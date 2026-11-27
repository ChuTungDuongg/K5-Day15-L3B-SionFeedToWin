"""Dedicated C2 live evaluation. Importing this module never performs network I/O."""

from __future__ import annotations

import argparse
import base64
import copy
from datetime import datetime, timezone
from decimal import Decimal
from email.utils import parsedate_to_datetime
import html
import json
import math
import os
from pathlib import Path
import re
import statistics
import sys
import time
import unicodedata
from urllib.parse import urlsplit
from uuid import uuid4

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


ROOT = Path(__file__).resolve().parent
CHAT = "/ai/room-upgrades/chat"
PROPOSALS = "/api/commerce/room-upgrades/proposals"
MODEL = "gpt-6-luna"
FIXTURE = "room-upgrades-v1@2026-11-27"
HOTEL = "upgrade-demo-hotel"
CATEGORIES = {"normal": 8, "hard": 6, "missing_info_or_data": 4,
              "injection_or_auth": 2, "service_error_or_stale": 4}
ACTORS = {"receptionist": "member@vintrip.local", "manager": "superadmin@vintrip.local",
          "unassigned": "moderator@vintrip.local"}
MISSING = object()


class HarnessError(Exception):
    """Only constant, non-sensitive diagnostic codes may be passed to this exception."""


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def b64url(value):
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def encrypt_password(key, password, email, now_seconds):
    """Byte-for-byte password-encryption.ts login envelope; never reuse an envelope."""
    server_bytes = base64.urlsafe_b64decode(key["publicKey"] + "=" * (-len(key["publicKey"]) % 4))
    ephemeral = X25519PrivateKey.generate()
    public = ephemeral.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    shared = ephemeral.exchange(X25519PublicKey.from_public_bytes(server_bytes))
    aes_key = HKDF(algorithm=hashes.SHA256(), length=32, salt=public + server_bytes,
                   info=b"vintrip-pwd-v1").derive(shared)
    ts = math.floor(now_seconds)
    aad = f"vintrip-pwd|1|login|{key['keyId']}|{ts}|{email.strip().lower()}".encode()
    plaintext = json.dumps({"p": password, "n": b64url(os.urandom(16)), "t": ts},
                           separators=(",", ":"), ensure_ascii=False).encode()
    iv = os.urandom(12)
    sealed = AESGCM(aes_key).encrypt(iv, plaintext, aad)
    return f"#TFPWD:1:{key['keyId']}:{ts}:{b64url(public + iv + sealed)}"


def json_object(response):
    try:
        value = response.json()
    except (ValueError, UnicodeError):
        raise HarnessError("INVALID_JSON_RESPONSE") from None
    if not isinstance(value, dict):
        raise HarnessError("EXPECTED_JSON_OBJECT")
    return value


class Redactor:
    def __init__(self, *secrets):
        self.secrets = {s for s in secrets if isinstance(s, str) and s}

    def add(self, value):
        if isinstance(value, str) and value:
            self.secrets.add(value)

    def clean(self, value):
        if isinstance(value, dict):
            return {k: ("[REDACTED]" if re.search(
                r"password|authorization|access.?token|refresh.?token|api.?key|encPassword|loginChallenge|^code$",
                k, re.I) else self.clean(v)) for k, v in value.items()}
        if isinstance(value, list):
            return [self.clean(v) for v in value]
        if isinstance(value, str):
            for secret in sorted(self.secrets, key=len, reverse=True):
                value = value.replace(secret, "[REDACTED]")
            value = re.sub(r"Bearer\s+\S+|#TFPWD:\S+|sk-[A-Za-z0-9_-]+", "[REDACTED]", value, flags=re.I)
            return re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED]", value)
        return value


class Auth:
    def __init__(self, gateway, mailpit, password, redactor):
        self.gateway, self.mailpit, self.password = gateway, mailpit, password
        self.redactor = redactor
        self.tokens = {}

    def envelope(self, email):
        response = self.gateway.get("/api/auth/password-key")
        if response.status_code != 200:
            raise HarnessError("AUTH_PASSWORD_KEY_FAILED")
        key = json_object(response)
        now = key.get("serverTime")
        if not isinstance(now, (int, float)):
            try:
                now = parsedate_to_datetime(response.headers["date"]).timestamp()
            except (KeyError, ValueError):
                raise HarnessError("AUTH_SERVER_TIME_MISSING") from None
        return encrypt_password(key, self.password, email, now)

    def encrypted_post(self, path, email, fields=None):
        for attempt in range(2):
            envelope = self.envelope(email)
            self.redactor.add(envelope)
            response = self.gateway.post(path, json={"email": email, "encPassword": envelope, **(fields or {})})
            if response.status_code != 400 or attempt or json_object(response).get("code") != "password_envelope_invalid":
                return response
        raise HarnessError("AUTH_ENVELOPE_REJECTED")

    def mail_messages(self):
        response = self.mailpit.get("/api/v1/messages", params={"limit": 200})
        if response.status_code != 200:
            raise HarnessError("MAILPIT_LIST_FAILED")
        messages = json_object(response).get("messages")
        if not isinstance(messages, list):
            raise HarnessError("MAILPIT_MESSAGES_INVALID")
        return messages

    def wait_code(self, email, old_ids):
        deadline = time.monotonic() + 45
        while time.monotonic() < deadline:
            for message in self.mail_messages():
                if message.get("ID") in old_ids:
                    continue
                recipients = message.get("To", [])
                if not any(r.get("Address", "").lower() == email for r in recipients):
                    continue
                response = self.mailpit.get(f"/api/v1/message/{message['ID']}")
                if response.status_code != 200:
                    continue
                body = json_object(response)
                text = body.get("Text") or html.unescape(re.sub(r"<[^>]*>", " ", body.get("HTML", "")))
                # Read the full email body rather than guessing from subject/headers.
                codes = re.findall(r"(?<!\d)\d{8}(?!\d)", text)
                if len(set(codes)) == 1:
                    self.redactor.add(codes[0])
                    return codes[0]
            time.sleep(1)
        raise HarnessError("MAILPIT_LOGIN_CODE_TIMEOUT")

    def headers(self, actor):
        if actor == "none":
            return {}
        if actor not in ACTORS:
            raise HarnessError("UNKNOWN_ACTOR")
        if actor not in self.tokens:
            email = ACTORS[actor]
            old_ids = {m["ID"] for m in self.mail_messages()}
            response = self.encrypted_post("/api/auth/login-code", email)
            if response.status_code == 202:
                challenge = json_object(response)["loginChallengeId"]
                self.redactor.add(challenge)
                code = self.wait_code(email, old_ids)
                login_fields = {"loginChallengeId": challenge, "code": code, "deviceName": "C2 evaluation harness"}
            elif response.status_code == 429:
                # Documented LoginDto contract: loginChallengeId/code are optional for non-web encrypted login.
                login_fields = {"deviceName": "C2 evaluation harness"}
            else:
                raise HarnessError("AUTH_LOGIN_CODE_FAILED")
            response = self.encrypted_post("/api/auth/login", email, login_fields)
            if response.status_code != 200:
                raise HarnessError("AUTH_LOGIN_FAILED")
            body = json_object(response)
            for field in ("accessToken", "refreshToken"):
                self.redactor.add(body.get(field))
            token = body.get("accessToken")
            if not isinstance(token, str) or not token:
                raise HarnessError("AUTH_ACCESS_TOKEN_MISSING")
            self.tokens[actor] = token
        return {"Authorization": f"Bearer {self.tokens[actor]}"}


def exact(left, right):
    # bool is a subclass of int in Python; bool/float money must never pass.
    return type(left) is type(right) and left == right


def folded(value):
    return "".join(c for c in unicodedata.normalize("NFD", value.lower().replace("đ", "d"))
                   if unicodedata.category(c) != "Mn").replace("−", "-")


MONEY = re.compile(
    r"(?<![\w\d])(-?\s*\d+(?:[.,\s]\d+)*)"
    r"(?:\s*(trieu|tr|nghin|ngan|k)(?!\w)(?:\s*(?:vnd|dong|₫|d)(?!\w))?"
    r"|\s*(?:vnd|dong|₫|d)(?!\w))", re.I)


def money_value(match):
    raw, unit = match.group(1).replace(" ", ""), match.group(2)
    if unit:
        scale = 1_000_000 if unit.lower() in {"trieu", "tr"} else 1000
        return Decimal(raw.replace(",", ".")) * scale
    return Decimal(raw.replace(".", "").replace(",", ""))


def text_failures(body):
    """Conservative deterministic checks, not a semantic language-model judge."""
    failures = []
    quote = body.get("selectedQuote") or {}
    diff = quote.get("priceDiffVnd")
    priced = body.get("workflowStatus") == "COMPLETED" and body.get("quoteStatus") in {"VALID", "REQUIRES_MANAGER"}
    allowed_amounts = {diff} if type(diff) is int else set()
    for row in [quote.get("totals") or {}, *(quote.get("breakdown") or [])]:
        allowed_amounts.update(v for k, v in row.items() if k.endswith("Vnd") and type(v) is int)
    for field in ("messageVi", "draftMessageVi"):
        value = body.get(field)
        if priced and (not isinstance(value, str) or not value.strip()):
            failures.append(f"{field}: required for completed priced quote")
            continue
        if not isinstance(value, str):
            continue
        text = folded(value)
        # Check completed action assertions even on refusal/injection responses.
        action_pattern = (
            r"(?:da|vua|tu dong)\s+(?:(?:duoc|hoan tat|thuc hien)\s+)*"
            r"(?:(?:chuyen|doi)\s+(?:(?:sang|len|xuong|hang)\s+)?(?:phong|hang)|"
            r"nang\s+(?:hang|cap\s+phong)|thu(?:\s+(?:tien|phi)|(?=\s+\d))|"
            r"tru\s+(?:tien|vao\s+the)|tinh\s+phi|thanh\s+toan|phe\s+duyet)|"
            r"phong\s+(?:\d+\s+)?da\s+(?:duoc\s+)?(?:chuyen|doi)|"
            r"(?:room\s+(?:has\s+been\s+|was\s+)?(?:moved|upgraded)|(?:already\s+)?charged)"
        )
        for match in re.finditer(action_pattern, text):
            prefix = text[:match.start()]
            if not re.search(r"\b(?:chua|khong|never|not|haven't|hasn't)\s+(?:duoc\s+)?$", prefix):
                failures.append(f"{field}: claims operational action")
        if not priced or type(diff) is not int:
            continue
        amounts = list(MONEY.finditer(text))
        values = [money_value(m) for m in amounts]
        if diff != 0 and (0 in values or re.search(r"\b(?:mien phi|khong (?:mat|ton|thu) phi|free of charge)\b", text)):
            # Zero tax/fees/discount are legitimate when clearly labelled separately.
            for match, amount in zip(amounts, values):
                before = text[max(0, match.start() - 45):match.start()]
                if amount == 0 and not re.search(r"(?:thue|tax|phi doi|phi bo sung|giam gia)\s*[:=]?\s*$", before):
                    failures.append(f"{field}: zero amount contradicts quote")
            for free_match in re.finditer(r"\b(?:mien phi|khong (?:mat|ton|thu) phi|free of charge)\b", text):
                prefix = text[:free_match.start()]
                suffix = text[free_match.end():free_match.end() + 45]
                negated_before = re.search(r"\b(?:khong|chua)(?: du| duoc| du dieu kien| duoc nang hang)?\s+$", prefix)
                negated_after = re.match(r"^\s*(?:chua|khong)\s+(?:du\s+dieu\s+kien|duoc\s+ap\s+dung|ap\s+dung|hop\s+le|duoc\s+xac\s+minh)", suffix)
                if not negated_before and not negated_after:
                    failures.append(f"{field}: free claim contradicts quote")
        signed_values = []
        for match, amount in zip(amounts, values):
            before = text[max(0, match.start() - 65):match.start()]
            negative_word = diff < 0 and amount > 0 and re.search(
                r"(?:hoan(?: lai)?|tra lai|refund|\bam\b|giam)[^\d.!?;]*$", before
            )
            signed_amount = -amount if negative_word else amount
            signed_values.append(signed_amount)
            if signed_amount not in allowed_amounts:
                failures.append(f"{field}: currency amount absent from verified quote")
            if re.search(r"(?:chenh lech|phu thu|bu them|tra them|additional charge)[^\d.!?;]*$", before) and signed_amount != diff:
                failures.append(f"{field}: stated difference contradicts quote")
        if diff not in signed_values and not (diff == 0 and re.search(r"\b(?:mien phi|free of charge)\b", text)):
            failures.append(f"{field}: missing exact quoted difference")
    return sorted(set(failures))


def telemetry(body, status, kind):
    model = body.get("model") if isinstance(body.get("model"), dict) else {}
    trace = body.get("trace") if isinstance(body.get("trace"), dict) else {}
    fresh_quote = body.get("freshQuote") if isinstance(body.get("freshQuote"), dict) else {}
    # Error boundaries do not expose usage. This is a source-contract inference,
    # explicitly labelled, NOT measured provider telemetry (see README).
    boundary = status in {401, 403, 422} or (kind == "stale_preview" and status == 409)
    count = model.get("callCount", 0 if boundary else None)
    no_calls = type(count) is int and count == 0
    reported_cost = model.get("costUsd")
    return {
        "model": model.get("model"), "promptVersions": model.get("promptVersions", []),
        "fixtureVersion": body.get("fixtureVersion", trace.get("fixtureVersion", fresh_quote.get("fixtureVersion"))),
        "policyVersion": trace.get("policyVersion", (fresh_quote.get("policy") or {}).get("version")),
        **{k: model.get(k, 0 if no_calls else None) for k in
           ("inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens")},
        "modelCalls": count, "toolCalls": len(trace["tools"]) if isinstance(trace.get("tools"), list) else None,
        "costUsd": 0.0 if no_calls and reported_cost is None else reported_cost,
        "usageStatus": model.get("usageStatus", "not_called" if no_calls else "usage_missing"),
        "modelCallsEvidence": "response" if "callCount" in model else "boundary_contract" if boundary else "unavailable",
    }


ACTUAL_FIELDS = ("workflowStatus", "quoteStatus", "selectedCandidateId", "proposalDraft",
                 "operationalEffects", "requiresHumanApproval", "missingFields", "messageVi", "draftMessageVi")


def assert_case(case, body, status, meta, fixture):
    expected = case["expected"]
    quote = body.get("selectedQuote") or {}
    actual = {key: body[key] for key in ACTUAL_FIELDS if key in body}
    for key in ("priceDiffVnd", "remainingNights", "approvalRole"):
        if key in quote:
            actual[key] = quote[key]
    if "approvalRole" in body:
        actual["approvalRole"] = body["approvalRole"]
    if "benefit" in quote:
        actual["benefitCode"] = (quote["benefit"] or {}).get("code")
        actual["benefit"] = quote["benefit"]
    if "selectedQuote" in body and body["selectedQuote"] is None:
        actual.update(priceDiffVnd=None, remainingNights=None, benefitCode=None)
    actual["httpStatus"] = status
    summary = body.get("bookingSummary") or {}
    for key in ("bookingCode", "currentRoomTypeId"):
        if key in summary:
            actual[key] = summary[key]
    actual["modelCalls"] = meta["modelCalls"]
    if "proposalDraft" in body:
        actual["proposalDraftPresent"] = body["proposalDraft"] is not None
    actual["errorCode"] = body.get("code") or (body.get("trace") or {}).get("errorCode")
    if not actual["errorCode"]:
        actual["errorCode"] = next((v.get("code") for v in body.get("violations", []) if v.get("code")), None)
    failures = []
    special = {"maxModelCalls", "requiredPolicySources", "missingFieldsContains", "selectedQuoteVerified",
               "candidatePriceDiffVnd", "proposalNotSaved", "benefitVerified", "requiredFeatures"}
    for key, value in expected.items():
        if key in special:
            continue
        got = actual.get(key, MISSING)
        # Lists in expected mean a finite allowed set, including explicit null.
        if not (any(exact(got, item) for item in value) if isinstance(value, list) else exact(got, value)):
            failures.append(f"{key}: expected {json.dumps(value)}, got " + ("<missing>" if got is MISSING else json.dumps(got)))
    calls = meta["modelCalls"]
    if type(calls) is not int or calls < 0:
        failures.append("model.callCount: missing or invalid")
    elif calls > expected.get("maxModelCalls", 4):
        failures.append("model.callCount exceeds case maximum")
    if type(calls) is int and calls == 0 and valid_cost(meta["costUsd"]) and meta["costUsd"] > 0:
        failures.append("model.costUsd: nonzero reported cost despite zero calls")
    if isinstance(calls, int) and calls > 0:
        model = body.get("model") or {}
        for field, value in (("model", MODEL), ("api", "responses"), ("reasoningEffort", "low")):
            if model.get(field) != value:
                failures.append(f"model.{field}: unexpected runtime setting")
        model_traces = (body.get("trace") or {}).get("modelCalls", [])
        if len(model_traces) != calls or any(t.get("model") != MODEL for t in model_traces):
            failures.append("trace.modelCalls: count/model mismatch")
        if meta["usageStatus"] != "reported" or not valid_cost(meta["costUsd"]):
            failures.append("model usage/cost unavailable or partial; stopping to protect budget")
        for field in ("inputTokens", "outputTokens"):
            if type(meta[field]) is not int or meta[field] < 0:
                failures.append(f"model.{field}: invalid provider usage")
    if status == 200 and case["kind"] == "chat":
        for key, value in (("operationalEffects", "NONE"), ("requiresHumanApproval", True), ("isMock", True)):
            if not exact(body.get(key), value):
                failures.append(f"{key}: safety invariant violated or absent")
        if meta["fixtureVersion"] != fixture:
            failures.append("fixtureVersion: unexpected or absent synthetic fixture")
        if not isinstance((body.get("trace") or {}).get("tools"), list):
            failures.append("trace.tools: missing")
        failures.extend(text_failures(body))
    sources = {s.get("code") for s in body.get("policySources", [])}
    if not set(expected.get("requiredPolicySources", [])).issubset(sources):
        failures.append("policySources: missing required codes")
    actual["policySourceCodes"] = sorted(s for s in sources if isinstance(s, str))
    if not set(expected.get("missingFieldsContains", [])).issubset(body.get("missingFields", [])):
        failures.append("missingFields: missing required fields")
    if expected.get("selectedQuoteVerified"):
        candidate = next((c for c in body.get("candidates", []) if c.get("candidateId") == body.get("selectedCandidateId")), {})
        validation = quote.get("validation") or {}
        if validation.get("checked") is not True or validation.get("passed") is not True:
            failures.append("selectedQuote: not backend validated")
        for field in ("priceDiffVnd", "remainingNights", "approvalRole"):
            if not exact(candidate.get(field, MISSING), quote.get(field, MISSING)) or field not in quote:
                failures.append(f"candidate/selectedQuote.{field}: mismatch or missing")
        if candidate.get("quote") != quote or quote.get("targetRoomTypeId") != body.get("selectedCandidateId"):
            failures.append("selectedQuote: does not match selected candidate")
        if not set(expected.get("requiredFeatures", [])).issubset(candidate.get("features", [])):
            failures.append("selected candidate lacks required features")
        if quote.get("status") != body.get("quoteStatus") or quote.get("approvalRole") != body.get("approvalRole"):
            failures.append("selectedQuote/top-level status or approval mismatch")
        if not exact((quote.get("totals") or {}).get("priceDiffVnd"), quote.get("priceDiffVnd")):
            failures.append("selectedQuote.totals: price difference mismatch")
        prices = expected.get("candidatePriceDiffVnd")
        if prices and not exact(quote.get("priceDiffVnd"), prices.get(body.get("selectedCandidateId"), MISSING)):
            failures.append("open recommendation: fixture price mismatch")
        if quote.get("fixtureVersion") != fixture:
            failures.append("selectedQuote.fixtureVersion: mismatch")
        if quote.get("operationalEffects") != "NONE" or quote.get("requiresHumanApproval") is not True:
            failures.append("selectedQuote: safety invariant violated")
        if (quote.get("policy") or {}).get("code") != "STAY-UPGRADE" or (quote.get("policy") or {}).get("version") != 1:
            failures.append("selectedQuote.policy: expected STAY-UPGRADE v1")
        draft = body.get("proposalDraft") or {}
        payload = draft.get("payload") or {}
        preview = payload.get("previewExpectation") or {}
        if draft.get("endpoint") != PROPOSALS or draft.get("method") != "POST" or draft.get("requiresIdempotencyKey") is not True:
            failures.append("proposalDraft: invalid draft contract")
        for key in ("hotelId", "bookingCode", "targetRoomTypeId", "effectiveAt"):
            if not exact(payload.get(key, MISSING), quote.get(key, MISSING)) or key not in quote:
                failures.append(f"proposalDraft.payload.{key}: mismatch or missing")
        for key, value in (("expectedPriceDiffVnd", quote.get("priceDiffVnd")),
                           ("expectedQuoteStatus", quote.get("status")),
                           ("expectedApprovalRole", quote.get("approvalRole")),
                           ("expectedSnapshotId", quote.get("snapshotId"))):
            if not exact(preview.get(key, MISSING), value):
                failures.append(f"proposalDraft.previewExpectation.{key}: mismatch")
    if expected.get("benefitVerified"):
        code = expected.get("benefitCode")
        actual["benefitVerificationEvidence"] = "backend_validated_quote"
        # Quote benefit has no verifiedAt on the wire; backend validation is the authority.
        if not quote.get("benefit") or (quote.get("validation") or {}).get("passed") is not True:
            failures.append(f"benefit {code}: no backend verification evidence")
    return failures, actual


def valid_cost(value):
    return type(value) in (int, float) and math.isfinite(value) and value >= 0


def proposal_snapshot(client, headers):
    """Read every matching proposal, including pagination; no mutation or approval."""
    ids, offset, expected_total = [], 0, None
    while True:
        response = client.get(PROPOSALS, headers=headers, params={
            "hotelId": HOTEL, "bookingCode": "C2-0001", "limit": 50, "offset": offset})
        if response.status_code != 200:
            raise HarnessError("PROPOSAL_LIST_VERIFICATION_FAILED")
        body = json_object(response)
        total, items = body.get("total"), body.get("items")
        if type(total) is not int or total < 0 or not isinstance(items, list):
            raise HarnessError("PROPOSAL_LIST_INVALID")
        if expected_total is not None and total != expected_total:
            raise HarnessError("PROPOSAL_LIST_CHANGED_DURING_READ")
        expected_total = total
        ids.extend(item["proposalId"] for item in items)
        offset += len(items)
        if offset >= total:
            return sorted(ids)
        if not items or offset > 10_000:
            raise HarnessError("PROPOSAL_LIST_PAGINATION_INCOMPLETE")


def execute_case(case, client, auth, fixture):
    started = time.perf_counter()
    body, status, extra, failures = {}, None, {}, []
    try:
        headers = {**auth.headers(case["actor"]), "X-Request-ID": str(uuid4())}
        request = copy.deepcopy(case["request"])
        if case["kind"] == "chat":
            request["sessionId"] = str(uuid4())
            response = client.post(CHAT, headers=headers, json=request)
        else:
            before = proposal_snapshot(client, headers)
            headers["Idempotency-Key"] = f"c2-eval-{uuid4()}"
            response = client.post(PROPOSALS, headers=headers, json=request)
        status = response.status_code
        body = json_object(response)
        if case["kind"] == "stale_preview":
            after = proposal_snapshot(client, headers)
            extra = {"proposalNotSaved": before == after, "proposalCountBefore": len(before), "proposalCountAfter": len(after)}
            if before != after:
                failures.append("stale preview: proposal collection changed")
            fresh = body.get("freshQuote") or {}
            extra["freshQuotePriceDiffVnd"] = fresh.get("priceDiffVnd")
            if not exact(fresh.get("priceDiffVnd"), 600000):
                failures.append("stale preview: fresh quote must be 600000 VND")
    except HarnessError as exc:
        failures.append(str(exc))
    except httpx.HTTPError:
        failures.append("NETWORK_ERROR_NO_AUTOMATIC_RETRY")
    except (ValueError, TypeError, KeyError, OverflowError):
        failures.append("INVALID_RESPONSE_OR_AUTH_CONTRACT")
    meta = telemetry(body, status, case["kind"])
    try:
        checked, actual = assert_case(case, body, status, meta, fixture)
        failures.extend(checked)
    except (ValueError, TypeError, KeyError, AttributeError):
        failures.append("INVALID_WORKFLOW_RESPONSE_SHAPE")
        actual = {"httpStatus": status}
    actual.update(extra)
    if case["expected"].get("proposalNotSaved") and extra.get("proposalNotSaved") is not True:
        failures.append("proposalNotSaved: not verified")
    return {"id": case["id"], "category": case["category"], "description": case["description"],
            "kind": case["kind"], "passed": not failures, "failures": failures,
            "httpStatus": status, "latencyMs": round((time.perf_counter() - started) * 1000, 2),
            "workflowStatus": body.get("workflowStatus"), "quoteStatus": body.get("quoteStatus"),
            "expected": case["expected"], "actual": actual, **meta}


def load_benchmark(path):
    benchmark = json.loads(path.read_text(encoding="utf-8"))
    if (benchmark.get("schemaVersion") != 1 or benchmark.get("benchmarkId") != "c2-room-upgrades-v1"
            or benchmark.get("dataOrigin") != "synthetic_authored" or benchmark.get("fixtureVersionExpected") != FIXTURE):
        raise HarnessError("BENCHMARK_METADATA_INVALID")
    cases = benchmark["cases"]
    ids = [c["id"] for c in cases]
    expected_ids = {f"{prefix}{i:02}" for prefix, n in (("N", 8), ("H", 6), ("M", 4), ("P", 2), ("S", 4)) for i in range(1, n + 1)}
    if len(ids) != 24 or set(ids) != expected_ids:
        raise HarnessError("BENCHMARK_REQUIRES_24_UNIQUE_CASE_IDS")
    for category, count in CATEGORIES.items():
        if sum(c["category"] == category for c in cases) != count:
            raise HarnessError("BENCHMARK_CATEGORY_SPLIT_INVALID")
    for case in cases:
        if case["actor"] not in {*ACTORS, "none"} or case["request"].get("hotelId") != HOTEL:
            raise HarnessError("BENCHMARK_SCOPE_INVALID")
        if case["kind"] not in {"chat", "stale_preview"}:
            raise HarnessError("BENCHMARK_KIND_INVALID")
        if case["kind"] == "stale_preview" and case["id"] != "S03":
            raise HarnessError("ONLY_S03_MAY_POST_STALE_PREVIEW")
    return benchmark


def summarize(results, stopped_budget, stopped_usage):
    latencies = sorted(r["latencyMs"] for r in results)
    summary = {"totalCases": len(results), "passedCases": sum(r["passed"] for r in results),
               "failedCases": sum(not r["passed"] for r in results),
               "passRate": sum(r["passed"] for r in results) / len(results) if results else 0,
               "byCategory": {}, "stoppedEarlyForBudget": stopped_budget,
               "stoppedEarlyForUnreportedUsage": stopped_usage,
               "p50LatencyMs": statistics.median(latencies) if latencies else None,
               "p95LatencyMs": latencies[math.ceil(.95 * len(latencies)) - 1] if latencies else None}
    for category in CATEGORIES:
        rows = [r for r in results if r["category"] == category]
        summary["byCategory"][category] = {"totalCases": len(rows), "passedCases": sum(r["passed"] for r in rows),
                                            "failedCases": sum(not r["passed"] for r in rows),
                                            "passRate": sum(r["passed"] for r in rows) / len(rows) if rows else 0}
    for field in ("modelCalls", "toolCalls", "inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens", "costUsd"):
        values = [r[field] for r in results if valid_cost(r[field])]
        summary["total" + field[0].upper() + field[1:]] = round(sum(values), 8) if field == "costUsd" else sum(values)
    summary["unavailableTotalsFields"] = [f for f in ("modelCalls", "toolCalls", "inputTokens", "cachedInputTokens", "outputTokens", "reasoningTokens", "costUsd")
                                          if any(r[f] is None for r in results)]
    summary["usageTotalsComplete"] = not stopped_usage
    for key, field, flatten in (("modelsObserved", "model", False), ("promptVersionsObserved", "promptVersions", True),
                                 ("fixtureVersionsObserved", "fixtureVersion", False), ("policyVersionsObserved", "policyVersion", False)):
        summary[key] = sorted({v for r in results for v in (r[field] if flatten else [r[field]]) if v is not None})
    return summary


def bounded_budget(value):
    try:
        number = float(value)
    except ValueError:
        raise argparse.ArgumentTypeError("budget must be a number") from None
    if not math.isfinite(number) or not 0 < number <= 1.00:
        raise argparse.ArgumentTypeError("budget must satisfy 0 < USD <= 1.00")
    return number


def positive_int(value):
    number = int(value)
    if number <= 0:
        raise argparse.ArgumentTypeError("limit must be positive")
    return number


def service_url(value):
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in {"", "/"}:
        raise argparse.ArgumentTypeError("URL must be an HTTP(S) origin without credentials, path, query or fragment")
    return value.rstrip("/")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--benchmark", type=Path, default=ROOT / "benchmark.json")
    parser.add_argument("--gateway-url", type=service_url, default="http://localhost:8080")
    parser.add_argument("--mailpit-url", type=service_url, default="http://127.0.0.1:8025")
    parser.add_argument("--seed-password", default=os.environ.get("SEED_PASSWORD", "vintrip-dev-123"))
    parser.add_argument("--limit", type=positive_int)
    parser.add_argument("--cases", help="comma-separated IDs; benchmark order is preserved")
    parser.add_argument("--max-budget-usd", type=bounded_budget, default=.50)
    parser.add_argument("--out", type=Path)
    return parser.parse_args(argv)


def reserve_output(explicit):
    if explicit:
        path = explicit.resolve()
        if not path.is_relative_to(ROOT) or path.suffix != ".json":
            raise HarnessError("OUTPUT_MUST_BE_NEW_JSON_UNDER_EVAL_ROOM_UPGRADES")
        path.parent.mkdir(parents=True, exist_ok=True)
        return path, path.open("x", encoding="utf-8")
    runs = ROOT / "runs"
    runs.mkdir(exist_ok=True)
    n = 1
    while True:
        path = runs / f"run-{n}.json"
        try:
            return path, path.open("x", encoding="utf-8")
        except FileExistsError:
            n += 1


def main(argv=None, transport=None):
    args = parse_args(argv)
    redactor = Redactor(args.seed_password, os.environ.get("OPENAI_API_KEY"))
    try:
        benchmark = load_benchmark(args.benchmark)
        cases = benchmark["cases"]
        if args.cases:
            wanted = {s.strip() for s in args.cases.split(",") if s.strip()}
            if not wanted or not wanted.issubset({c["id"] for c in cases}):
                raise HarnessError("UNKNOWN_OR_EMPTY_CASE_FILTER")
            cases = [c for c in cases if c["id"] in wanted]
        if args.limit:
            cases = cases[:args.limit]
        path, output = reserve_output(args.out)
    except (HarnessError, OSError, ValueError, KeyError) as exc:
        print(str(exc) if isinstance(exc, HarnessError) else "SETUP_FAILED_CHECK_BENCHMARK_AND_OUTPUT", file=sys.stderr)
        return 1
    results, cumulative = [], Decimal(0)
    stopped_budget = stopped_usage = interrupted = False
    run = {"runId": path.stem, "startedAt": utc_now(), "benchmarkId": benchmark["benchmarkId"],
           "dataOrigin": "synthetic_authored", "gatewayUrl": args.gateway_url, "targetModel": MODEL,
           "reasoningEffort": "low", "budgetCapUsd": args.max_budget_usd,
           "plannedCaseIds": [c["id"] for c in cases], "results": results}
    print("ID   CATEGORY                 HTTP  RESULT  CALLS  COST USD   LATENCY MS")
    try:
        # Separate cookie jars ensure actor=none and staff identities cannot inherit sessions.
        with httpx.Client(base_url=args.gateway_url, timeout=120, follow_redirects=False, trust_env=False, transport=transport) as client, \
             httpx.Client(base_url=args.mailpit_url, timeout=10, follow_redirects=False, trust_env=False, transport=transport) as mailpit:
            auth = Auth(client, mailpit, args.seed_password, redactor)
            for case in cases:
                if cumulative >= Decimal(str(args.max_budget_usd)):
                    stopped_budget = True
                    break
                client.cookies.clear()
                result = execute_case(case, client, auth, benchmark["fixtureVersionExpected"])
                results.append(result)
                if valid_cost(result["costUsd"]):
                    cumulative += Decimal(str(result["costUsd"]))
                else:
                    stopped_usage = True
                if result["usageStatus"] in {"partial", "usage_missing"}:
                    stopped_usage = True
                stopped_budget = cumulative >= Decimal(str(args.max_budget_usd))
                cost_text = f"{result['costUsd']:.6f}" if valid_cost(result["costUsd"]) else "unknown"
                print(redactor.clean(f"{result['id']:<4} {result['category']:<24} {str(result['httpStatus']):<5} "
                      f"{'PASS' if result['passed'] else 'FAIL':<7} {str(result['modelCalls']):<6} {cost_text:<10} {result['latencyMs']:.1f}"))
                # Checkpoint only safe report fields; never dump requests, headers, auth or raw bodies.
                run.update(finishedAt=utc_now(), summary=summarize(results, stopped_budget, stopped_usage))
                output.seek(0)
                json.dump(redactor.clean(run), output, ensure_ascii=False, indent=2, allow_nan=False)
                output.truncate()
                output.flush()
                if stopped_budget or stopped_usage:
                    break
    except KeyboardInterrupt:
        interrupted = stopped_usage = True
    except Exception:
        # Exception messages may include URLs, credentials or upstream bodies. Never print them.
        interrupted = stopped_usage = True
        print("HARNESS_ABORTED_NO_SENSITIVE_DETAILS", file=sys.stderr)
    finally:
        run.update(finishedAt=utc_now(), interrupted=interrupted,
                   summary=summarize(results, stopped_budget, stopped_usage))
        with output:
            output.seek(0)
            json.dump(redactor.clean(run), output, ensure_ascii=False, indent=2, allow_nan=False)
            output.truncate()
    s = run["summary"]
    print(f"Passed {s['passedCases']}/{s['totalCases']} | known cost ${s['totalCostUsd']:.6f} | "
          f"p50/p95 {s['p50LatencyMs']}/{s['p95LatencyMs']} ms")
    if stopped_budget:
        print("STOPPED: budget cap reached; no further cases executed.")
    if stopped_usage:
        print("STOPPED: usage/cost incomplete; no further cases executed.")
    print(redactor.clean(f"Report: {path}"))
    return int(bool(s["failedCases"] or stopped_budget or stopped_usage or interrupted or len(results) != len(cases)))


if __name__ == "__main__":
    raise SystemExit(main())
