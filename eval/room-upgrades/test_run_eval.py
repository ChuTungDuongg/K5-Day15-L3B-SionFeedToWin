"""Offline harness regression tests. No live HTTP, LLM calls or saved run artifacts."""

import base64
import contextlib
import copy
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


SPEC = importlib.util.spec_from_file_location("room_upgrade_eval", Path(__file__).with_name("run_eval.py"))
e = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(e)


def decode64(value):
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def response_body(case, cost=.01):
    """Explicitly artificial wire response, for offline harness tests only."""
    expected = case["expected"]
    diff = expected["priceDiffVnd"]
    target = expected["selectedCandidateId"]
    benefit_code = expected.get("benefitCode")
    quote = {"priceDiffVnd": diff, "remainingNights": expected["remainingNights"],
             "approvalRole": expected["approvalRole"], "status": expected["quoteStatus"],
             "hotelId": e.HOTEL, "bookingCode": expected.get("bookingCode", "C2-0001"),
             "targetRoomTypeId": target, "effectiveAt": "2026-11-28T14:00:00+07:00",
             "snapshotId": "offline-snapshot", "fixtureVersion": e.FIXTURE,
             "policy": {"code": "STAY-UPGRADE", "version": 1},
             "benefit": {"code": benefit_code} if benefit_code else None,
             "validation": {"checked": True, "passed": True},
             "totals": {"priceDiffVnd": diff}, "operationalEffects": "NONE", "requiresHumanApproval": True}
    candidate = {k: quote[k] for k in ("priceDiffVnd", "remainingNights", "approvalRole")}
    candidate.update(candidateId=target, quote=copy.deepcopy(quote), features=["GARDEN_VIEW", "NON_SMOKING"])
    return {"workflowStatus": "COMPLETED", "quoteStatus": quote["status"],
            "selectedCandidateId": target, "selectedQuote": quote, "candidates": [candidate],
            "approvalRole": quote["approvalRole"], "bookingSummary": {"bookingCode": quote["bookingCode"]},
            "proposalDraft": {"endpoint": e.PROPOSALS, "method": "POST", "requiresIdempotencyKey": True,
                              "payload": {**{k: quote[k] for k in ("hotelId", "bookingCode", "targetRoomTypeId", "effectiveAt")},
                                          "previewExpectation": {"expectedPriceDiffVnd": diff,
                                                                 "expectedQuoteStatus": quote["status"],
                                                                 "expectedApprovalRole": quote["approvalRole"],
                                                                 "expectedSnapshotId": "offline-snapshot"}}},
            "policySources": [{"code": c} for c in expected.get("requiredPolicySources", [])],
            "operationalEffects": "NONE", "requiresHumanApproval": True, "isMock": True,
            "fixtureVersion": e.FIXTURE, "messageVi": f"Chênh lệch {diff:,} VND. Chờ duyệt.",
            "draftMessageVi": f"Chênh lệch dự kiến {diff:,} VND. Cần phê duyệt trước khi áp dụng.",
            "model": {"model": e.MODEL, "api": "responses", "reasoningEffort": "low", "callCount": 2,
                      "usageStatus": "reported", "inputTokens": 100, "cachedInputTokens": 10,
                      "outputTokens": 50, "reasoningTokens": 5, "costUsd": cost,
                      "promptVersions": ["offline-test-prompt"]},
            "trace": {"tools": [{"tool": "offline-tool"}], "policyVersion": 1,
                      "modelCalls": [{"model": e.MODEL}, {"model": e.MODEL}]}}


class HarnessTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.benchmark = e.load_benchmark(e.ROOT / "benchmark.json")

    def case(self, case_id):
        return copy.deepcopy(next(c for c in self.benchmark["cases"] if c["id"] == case_id))

    def test_benchmark_disclosure_and_exact_split(self):
        self.assertEqual(len(self.benchmark["cases"]), 24)
        self.assertEqual(self.benchmark["dataOrigin"], "synthetic_authored")
        for prefix, category in (("N", "normal"), ("H", "hard"), ("M", "missing_info_or_data"),
                                 ("P", "injection_or_auth"), ("S", "service_error_or_stale")):
            self.assertTrue(all(c["category"] == category for c in self.benchmark["cases"] if c["id"].startswith(prefix)))

    def test_password_envelope_decrypts_with_server_key(self):
        server = X25519PrivateKey.generate()
        public = server.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        key = {"keyId": "offline-k1", "publicKey": e.b64url(public)}
        envelope = e.encrypt_password(key, "offline-secret", " MEMBER@VINTRIP.LOCAL ", 1795849200.9)
        prefix, version, key_id, timestamp, encoded = envelope.split(":")
        self.assertEqual((prefix, version, key_id, timestamp), ("#TFPWD", "1", "offline-k1", "1795849200"))
        raw = decode64(encoded)
        shared = server.exchange(X25519PublicKey.from_public_bytes(raw[:32]))
        aes_key = HKDF(algorithm=hashes.SHA256(), length=32, salt=raw[:32] + public,
                       info=b"vintrip-pwd-v1").derive(shared)
        aad = b"vintrip-pwd|1|login|offline-k1|1795849200|member@vintrip.local"
        plaintext = json.loads(AESGCM(aes_key).decrypt(raw[32:44], raw[44:], aad))
        self.assertEqual(plaintext["p"], "offline-secret")
        self.assertEqual(plaintext["t"], 1795849200)
        self.assertEqual(len(decode64(plaintext["n"])), 16)
        self.assertNotEqual(envelope, e.encrypt_password(key, "offline-secret", "member@vintrip.local", 1795849200))

    def test_two_step_auth_reencrypts_and_caches_by_actor(self):
        server = X25519PrivateKey.generate()
        public = server.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        envelopes, posts = [], []
        def handle(request):
            path = request.url.path
            if path == "/api/auth/password-key":
                return httpx.Response(200, json={"keyId": "offline-key", "publicKey": e.b64url(public), "serverTime": 1795849200})
            if path == "/api/v1/messages":
                messages = [{"ID": "new", "To": [{"Address": "member@vintrip.local"}]}] if posts else []
                return httpx.Response(200, json={"messages": messages})
            if path == "/api/v1/message/new":
                return httpx.Response(200, json={"Text": "Mã đăng nhập: 87654321"})
            body = json.loads(request.content)
            self.assertNotIn("password", body)
            envelopes.append(body["encPassword"])
            posts.append(path)
            if path.endswith("login-code"):
                return httpx.Response(202, json={"loginChallengeId": "offline-challenge"})
            self.assertEqual(body["code"], "87654321")
            self.assertEqual(body["loginChallengeId"], "offline-challenge")
            return httpx.Response(200, json={"accessToken": "offline-token", "refreshToken": "offline-refresh"})
        transport = httpx.MockTransport(handle)
        with httpx.Client(base_url="http://offline", transport=transport) as client:
            auth = e.Auth(client, client, "offline-secret", e.Redactor("offline-secret"))
            self.assertEqual(auth.headers("none"), {})
            self.assertEqual(auth.headers("receptionist"), {"Authorization": "Bearer offline-token"})
            self.assertEqual(auth.headers("receptionist"), {"Authorization": "Bearer offline-token"})
        self.assertEqual(len(posts), 2)
        self.assertNotEqual(*envelopes)

    def test_exact_money_and_null_are_strict(self):
        case = self.case("N01")
        body = response_body(case)
        failures, _ = e.assert_case(case, body, 200, e.telemetry(body, 200, "chat"), e.FIXTURE)
        self.assertEqual(failures, [])
        for wrong in (0, 600000.0, True, None, "600000"):
            with self.subTest(wrong=wrong):
                broken = copy.deepcopy(body)
                broken["selectedQuote"]["priceDiffVnd"] = wrong
                failures, _ = e.assert_case(case, broken, 200, e.telemetry(broken, 200, "chat"), e.FIXTURE)
                self.assertTrue(failures)
        case = self.case("S04")
        body = {"selectedQuote": None, "proposalDraft": None}
        _, actual = e.assert_case(case, body, 200, e.telemetry(body, 200, "chat"), e.FIXTURE)
        self.assertIsNone(actual["priceDiffVnd"])
        _, actual = e.assert_case(case, {}, 200, e.telemetry({}, 200, "chat"), e.FIXTURE)
        self.assertNotIn("priceDiffVnd", actual)

    def test_text_money_operational_claims_and_legitimate_benefit(self):
        body = response_body(self.case("N01"))
        for bad in ("Chênh lệch 0đ.", "Miễn phí nâng hạng.", "Chênh lệch 540.000 VND.",
                    "Chênh lệch 600.000 VND. Đã chuyển phòng.",
                    "Chênh lệch 600.000 VND. Đã chuyển sang phòng Deluxe.",
                    "Chênh lệch 600.000 VND. Đã thu 600.000đ.",
                    "Chênh lệch 600.000 VND. Phòng không hút thuốc, đã chuyển phòng.",
                    "Chênh lệch 600.000 VND. Đã thu tiền."):
            with self.subTest(bad=bad):
                body["draftMessageVi"] = bad
                self.assertTrue(e.text_failures(body))
        for good in ("Chênh lệch 600.000đ. Chưa chuyển phòng hay thu tiền.",
                     "Chênh lệch 0,6 triệu đồng. Cần quản lý duyệt.",
                     "Chênh lệch 600k. Chưa đủ điều kiện miễn phí.",
                     "Chênh lệch 600 000 VND. Chưa thực hiện thay đổi."):
            body["draftMessageVi"] = good
            self.assertEqual(e.text_failures(body), [], good)
        body = response_body(self.case("N03"))
        body["selectedQuote"]["totals"]["eligibleDiscountVnd"] = 60000
        body["draftMessageVi"] = "Chênh lệch 540.000đ, quyền lợi giảm 60.000đ. Chờ duyệt."
        self.assertEqual(e.text_failures(body), [])
        body = response_body(self.case("H02"))
        body["draftMessageVi"] = "Dự kiến hoàn lại 300.000đ, cần quản lý duyệt."
        self.assertEqual(e.text_failures(body), [])

    def test_open_recommendation_requires_exact_candidate_quote(self):
        case = self.case("N08")
        body = response_body(self.case("N01"))
        failures, _ = e.assert_case(case, body, 200, e.telemetry(body, 200, "chat"), e.FIXTURE)
        self.assertEqual(failures, [])
        body["candidates"][0]["priceDiffVnd"] = 0
        failures, _ = e.assert_case(case, body, 200, e.telemetry(body, 200, "chat"), e.FIXTURE)
        self.assertTrue(any("candidate" in f for f in failures))

    def run_mock(self, cost, case_ids="N01,N02"):
        seen_sessions, calls = [], []
        bodies = [response_body(self.case("N01"), cost), response_body(self.case("N02"), cost)]
        def handle(request):
            if request.url.path == e.CHAT:
                data = json.loads(request.content)
                seen_sessions.append(data["sessionId"])
                calls.append(data["message"])
                return httpx.Response(200, json=bodies[len(calls) - 1])
            raise AssertionError("No auth network request expected for preloaded test token")
        # Reuse real main's orchestration and serialization; inject HTTP transport and test auth only.
        original = e.Auth.headers
        e.Auth.headers = lambda self, actor: {"Authorization": "Bearer offline-sensitive-token"}
        try:
            with tempfile.TemporaryDirectory(dir=e.ROOT) as directory:
                out = Path(directory) / "offline.json"
                stdout = io.StringIO()
                with contextlib.redirect_stdout(stdout):
                    code = e.main(["--cases", case_ids, "--max-budget-usd", ".01", "--out", str(out)],
                                  transport=httpx.MockTransport(handle))
                raw = out.read_text(encoding="utf-8")
                self.assertNotIn("offline-sensitive-token", raw + stdout.getvalue())
                return code, json.loads(raw), seen_sessions
        finally:
            e.Auth.headers = original

    def test_budget_stops_before_second_case_at_equal_cap(self):
        code, run, sessions = self.run_mock(.01)
        self.assertEqual(code, 1)
        self.assertEqual(len(sessions), 1)
        self.assertTrue(run["summary"]["stoppedEarlyForBudget"])
        self.assertEqual(run["summary"]["totalCostUsd"], .01)

    def test_missing_cost_stops_without_fabricating_zero(self):
        code, run, sessions = self.run_mock(None)
        self.assertEqual(code, 1)
        self.assertEqual(len(sessions), 1)
        self.assertTrue(run["summary"]["stoppedEarlyForUnreportedUsage"])
        self.assertIsNone(run["results"][0]["costUsd"])
        self.assertFalse(run["results"][0]["passed"])

    def test_sequential_sessions_and_summary(self):
        code, run, sessions = self.run_mock(.001)
        self.assertEqual(code, 0)
        self.assertEqual(len(set(sessions)), 2)
        self.assertEqual(run["summary"]["passedCases"], 2)
        self.assertEqual(run["summary"]["totalInputTokens"], 200)
        self.assertEqual(run["summary"]["totalModelCalls"], 4)

    def test_stale_preview_is_not_saved(self):
        case = self.case("S03")
        traffic = []
        def handle(request):
            traffic.append(request.method)
            if request.method == "GET":
                return httpx.Response(200, json={"total": 1, "items": [{"proposalId": "existing"}]})
            self.assertIn("Idempotency-Key", request.headers)
            self.assertEqual(json.loads(request.content)["previewExpectation"]["expectedPriceDiffVnd"], 450000)
            return httpx.Response(409, json={"code": "PREVIEW_MISMATCH", "freshQuote": {"priceDiffVnd": 600000}})
        with httpx.Client(base_url="http://offline", transport=httpx.MockTransport(handle)) as client:
            auth = type("OfflineAuth", (), {"headers": lambda self, actor: {}})()
            result = e.execute_case(case, client, auth, e.FIXTURE)
        self.assertEqual(traffic, ["GET", "POST", "GET"])
        self.assertTrue(result["passed"], result["failures"])
        self.assertTrue(result["actual"]["proposalNotSaved"])

    def test_stale_preview_detects_new_proposal(self):
        case = self.case("S03")
        count = 0
        def handle(request):
            nonlocal count
            if request.method == "GET":
                count += 1
                return httpx.Response(200, json={"total": count - 1, "items": [] if count == 1 else [{"proposalId": "new"}]})
            return httpx.Response(409, json={"code": "PREVIEW_MISMATCH", "freshQuote": {"priceDiffVnd": 600000}})
        with httpx.Client(base_url="http://offline", transport=httpx.MockTransport(handle)) as client:
            auth = type("OfflineAuth", (), {"headers": lambda self, actor: {}})()
            result = e.execute_case(case, client, auth, e.FIXTURE)
        self.assertFalse(result["passed"])
        self.assertFalse(result["actual"]["proposalNotSaved"])

    def test_redaction_and_boundary_evidence(self):
        redactor = e.Redactor("offline-secret", "offline-token")
        text = json.dumps(redactor.clean({"messageVi": "offline-secret Bearer offline-token",
                                          "accessToken": "arbitrary", "encPassword": "arbitrary"}))
        self.assertNotIn("offline-secret", text)
        self.assertNotIn("offline-token", text)
        self.assertNotIn("arbitrary", text)
        for status in (401, 403, 422):
            meta = e.telemetry({}, status, "chat")
            self.assertEqual(meta["modelCalls"], 0)
            self.assertEqual(meta["modelCallsEvidence"], "boundary_contract")
            self.assertIsNone(meta["toolCalls"])
        self.assertIsNone(e.telemetry({}, 500, "chat")["costUsd"])
        meta = e.telemetry({"model": {"callCount": 0, "costUsd": .2}}, 200, "chat")
        self.assertEqual(meta["costUsd"], .2)  # Never discard reported spend.

    def test_invalid_budget_and_overwrite_are_rejected(self):
        for raw in ("0", "-1", "1.01", "nan", "inf"):
            with self.subTest(raw=raw), self.assertRaises(Exception):
                e.bounded_budget(raw)
        self.assertEqual(e.bounded_budget("1"), 1)
        with self.assertRaises(FileExistsError):
            e.reserve_output(e.ROOT / "benchmark.json")
        with self.assertRaises(e.HarnessError):
            e.reserve_output(e.ROOT.parent / "forbidden.json")

    def test_vietnamese_negative_and_post_negated_free_phrases(self):
        neg = response_body(self.case("H02"))
        neg["draftMessageVi"] = "Phương án đổi sang Tiêu chuẩn có chênh lệch âm 300.000 VND. Cần quản lý phê duyệt."
        self.assertEqual(e.text_failures(neg), [])
        comp = response_body(self.case("H04"))
        comp["draftMessageVi"] = "Khoản chênh lệch 600.000 VND. Yêu cầu nâng hạng miễn phí chưa đủ điều kiện; chờ quản lý duyệt."
        self.assertEqual(e.text_failures(comp), [])
        bad_free = copy.deepcopy(comp)
        bad_free["draftMessageVi"] = "Quý khách được nâng hạng miễn phí với phụ thu 600.000 VND."
        self.assertIn("draftMessageVi: free claim contradicts quote", e.text_failures(bad_free))


if __name__ == "__main__":
    unittest.main()
