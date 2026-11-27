"""Guardrails for the Room Upgrades AI workflow (C2-CP2).

Layer 1: input prompt-injection / authority-bypass detection (distinguishing normal
         complimentary-upgrade business queries from policy/approval bypass attempts).
Layer 2: post-generation allowlist & numeric/waiver verification on RecommendationLlmOutput.
"""

import re
from collections.abc import Iterable

from app.services.room_upgrades.schemas import (
    BackendQuoteResponse,
    CandidateQuoteOut,
    RecommendationLlmOutput,
)
from app.services.summary.injection import match_injection
from app.services.summary.vi_text import normalize_text

# Patterns for authority bypass, forced approval, 0-VND tampering, or secret exfiltration.
# Normal staff requests like "khách muốn nâng miễn phí" do NOT match these patterns.
_HOTEL_INJECTION_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "bypass_authority",
        re.compile(
            r"\b("
            r"(bo qua|phot lo|vuot|khong can)\s+(het\s+|moi\s+|tat ca\s+|cac\s+)?"
            r"(phan quyen|quyen|chinh sach|policy|quan ly|manager|phe duyet|duyet|"
            r"xac minh|kiem tra)"
            r"|(bypass|override|skip|ignore)\s+"
            r"(auth|authorization|permission|policy|manager|approval|check|validation)"
            r")\b"
        ),
    ),
    (
        "self_approve",
        re.compile(
            r"\b("
            r"(tu|tu dong|hay|cu|ep)\s+"
            r"(phe duyet|duyet|chot|xac nhan|approve|chuyen phong|giu phong|hoan tien|thu tien)"
            r"|auto[- ]?approve"
            r"|(dat|chuyen|sua|gan|set|force|mark)\s+(trang thai|status|quyen|role)"
            r"\s*(la|thanh|=|:)?\s*(approved|valid|manager|superadmin)"
            r"|role\s*=\s*(manager|superadmin)"
            r"|status\s*=\s*approved"
            r")\b"
        ),
    ),
    (
        "price_tampering",
        re.compile(
            r"\b("
            r"(sua|dat|ep|giam|chinh|set|force)\s+"
            r"(gia|tien|phu thu|chenh lech|tong tien|amount|price)\s*(ve|thanh|la|=|:)?\s*0\b"
            r"|mien phi\s+(bat chap|bo qua|khong can)\s+(chinh sach|policy|dieu kien|quan ly)"
            r"|cho\s+mien\s+phi\s+du\s+khong\s+du\s+dieu\s+kien"
            r")\b"
        ),
    ),
    (
        "secret_exfiltration",
        re.compile(
            r"\b("
            r"(in|hien|xuat|lo|print|reveal|dump|show)\s+(ra\s+)?"
            r"(system prompt|api[_ ]?key|openai[_ ]?api[_ ]?key|secret|bearer|token|env|\.env)"
            r"|api[_ ]?key"
            r")\b"
        ),
    ),
)

# Forbidden claims in LLM-generated text that imply side effects or completed approval.
_FORBIDDEN_ACTION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"(?<!chua )(?<!khong )(?<!chua duoc )\b(da phe duyet|da duoc duyet|da duyet thanh cong)\b"
    ),
    re.compile(r"\btrang thai\s+approved\b"),
    re.compile(
        r"(?<!chua )(?<!khong )\b"
        r"(da chuyen phong|da giu phong|da thu tien|da hoan tien|da cap nhat booking)\b"
    ),
    re.compile(r"\b(khong can quan ly duyet|khong can phe duyet|tu dong duyet)\b"),
)

# Claims asserting a free/0-VND upgrade when backend verified a non-zero difference.
_FREE_CLAIM_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"(?<!khong )(?<!chua )(?<!khong du dieu kien )(?<!chua du dieu kien )\b"
        r"(duoc mien phi|mien phi hoan toan|mien phi phu thu|nang hang mien phi thanh cong)\b"
    ),
    re.compile(
        r"(?<!khong )(?<!chua )\b(phu thu|chenh lech|chi phi)\s*(la|:|=)?\s*0\s*(d|vnd|dong)\b"
    ),
)

# Explicit VND monetary amounts in Vietnamese text (e.g. 600.000đ, 1.500.000 VND, 500k, 1,5 triệu).
_VND_EXPLICIT_RE = re.compile(
    r"(?<!\d)(-?\d{1,3}(?:[.,]\d{3})+|-?\d+)\s*(đồng|dong|vnđ|vnd|đ)\b",
    re.IGNORECASE,
)
_VND_TRIEU_RE = re.compile(r"(?<!\d)(\d+(?:[.,]\d+)?)\s*(triệu|trieu)\b", re.IGNORECASE)
_VND_K_RE = re.compile(r"(?<!\d)(\d{2,4})k\b", re.IGNORECASE)


def detect_prompt_injection(message: str) -> list[str]:
    """Return matched prompt-injection / authority-bypass rule names; empty when clean."""
    groups = list(match_injection(message))
    folded = normalize_text(message)
    for name, pattern in _HOTEL_INJECTION_PATTERNS:
        if pattern.search(folded) and name not in groups:
            groups.append(name)
    return groups


def extract_vnd_amounts(text: str) -> list[int]:
    """Extract explicit monetary VND integers written in Vietnamese prose."""
    amounts: list[int] = []
    for match in _VND_EXPLICIT_RE.finditer(text):
        raw = match.group(1).replace(".", "").replace(",", "")
        try:
            amounts.append(int(raw))
        except ValueError:
            continue
    for match in _VND_TRIEU_RE.finditer(text):
        raw = match.group(1).replace(",", ".")
        try:
            amounts.append(round(float(raw) * 1_000_000))
        except ValueError:
            continue
    for match in _VND_K_RE.finditer(text):
        try:
            amounts.append(int(match.group(1)) * 1_000)
        except ValueError:
            continue
    return amounts


def collect_verified_vnd_numbers(quotes: Iterable[BackendQuoteResponse]) -> set[int]:
    """Collect every authoritative VND integer present in backend-validated quotes."""
    allowed: set[int] = set()
    for quote in quotes:
        if quote.price_diff_vnd is not None:
            allowed.add(quote.price_diff_vnd)
            allowed.add(abs(quote.price_diff_vnd))
        if quote.totals is not None:
            for val in (
                quote.totals.new_room_total_vnd,
                quote.totals.eligible_original_credit_vnd,
                quote.totals.additional_fees_vnd,
                quote.totals.additional_tax_vnd,
                quote.totals.eligible_discount_vnd,
                quote.totals.price_diff_vnd,
                abs(quote.totals.price_diff_vnd),
            ):
                allowed.add(val)
        for night in quote.breakdown:
            for val in (
                night.new_room_price_vnd,
                night.original_paid_vnd,
                night.eligible_original_credit_vnd,
                night.additional_fees_vnd,
                night.additional_tax_vnd,
                night.eligible_discount_vnd,
                night.price_diff_vnd,
                abs(night.price_diff_vnd),
            ):
                allowed.add(val)
    return allowed


def build_allowed_source_refs(quotes: Iterable[BackendQuoteResponse]) -> set[str]:
    """Build exact allowlist of policy & pricing source refs from backend quotes."""
    refs: set[str] = set()
    for quote in quotes:
        if quote.policy is not None:
            for src in quote.policy.sources:
                refs.add(f"{quote.policy.code}:v{quote.policy.version}:{src.code}")
                refs.add(src.code)
        for night in quote.breakdown:
            refs.update(night.source_refs)
    return refs


def validate_recommendation(
    output: RecommendationLlmOutput,
    *,
    allowed_candidate_ids: set[str],
    allowed_source_refs: set[str],
    candidates_by_id: dict[str, CandidateQuoteOut],
) -> tuple[list[str], str | None]:
    """Verify LLM recommendation against backend allowlists, prices, and authority rules.

    Returns (guardrail_event_codes, repair_feedback_or_none).
    """
    codes: list[str] = []
    reasons: list[str] = []

    if output.selected_candidate_id not in allowed_candidate_ids:
        codes.append("HALLUCINATED_CANDIDATE_ID")
        reasons.append(
            f"selected_candidate_id '{output.selected_candidate_id}' is not in "
            f"allowedCandidateIds {sorted(allowed_candidate_ids)}."
        )

    bad_ranked = [cid for cid in output.ranked_candidate_ids if cid not in allowed_candidate_ids]
    if bad_ranked:
        if "HALLUCINATED_CANDIDATE_ID" not in codes:
            codes.append("HALLUCINATED_CANDIDATE_ID")
        reasons.append(f"ranked_candidate_ids contains unknown IDs: {bad_ranked}.")
    elif (
        output.ranked_candidate_ids
        and output.ranked_candidate_ids[0] != output.selected_candidate_id
    ):
        codes.append("INVALID_RANKING_ORDER")
        reasons.append("ranked_candidate_ids[0] must equal selected_candidate_id.")

    bad_sources = [ref for ref in output.source_refs if ref not in allowed_source_refs]
    if bad_sources:
        codes.append("HALLUCINATED_SOURCE_REF")
        reasons.append(
            f"source_refs contains unverified refs {bad_sources}; "
            f"only refs from allowedSourceRefs are permitted."
        )

    combined_text = f"{output.reason_vi}\n{output.draft_message_vi}"
    folded = normalize_text(combined_text)

    if any(pattern.search(folded) for pattern in _FORBIDDEN_ACTION_PATTERNS):
        codes.append("FORBIDDEN_ACTION_CLAIM")
        reasons.append(
            "Text must not claim approval is done, rooms moved/held, or payment/refund executed."
        )

    selected = candidates_by_id.get(output.selected_candidate_id)
    if selected is not None:
        if selected.price_diff_vnd is not None and selected.price_diff_vnd != 0:
            if any(pattern.search(folded) for pattern in _FREE_CLAIM_PATTERNS):
                codes.append("UNAUTHORIZED_WAIVER_CLAIM")
                reasons.append(
                    f"Backend priceDiffVnd is {selected.price_diff_vnd} VND; "
                    "text must not claim complimentary/0 VND upgrade is granted."
                )
        verified_numbers = collect_verified_vnd_numbers(
            [c.quote for c in candidates_by_id.values()]
        )
        mentioned_amounts = extract_vnd_amounts(combined_text)
        mismatched = [
            amt
            for amt in mentioned_amounts
            if amt not in verified_numbers and abs(amt) not in verified_numbers
        ]
        if mismatched:
            codes.append("FABRICATED_PRICE_IN_TEXT")
            reasons.append(
                f"Text mentions VND amounts {mismatched} outside verified figures "
                f"{sorted(verified_numbers)}."
            )

    if codes:
        return codes, " ".join(reasons)
    return [], None
