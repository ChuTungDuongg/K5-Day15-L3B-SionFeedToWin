"""Controlled sequential AI workflow for Hotel Room Upgrades (C2-CP2).

Pipeline:
  Authenticate (API layer)
  -> Authorize hotel scope on Core API (before any LLM call)
  -> Verify/load staff+hotel scoped session
  -> Input prompt-injection guardrail
  -> Structured intent extraction (GPT-6 Luna, Responses API)
  -> Resolve booking & validate explicit transfer datetime in hotel timezone
  -> Load booking context + policy + available room candidates (CP1 backend)
  -> Generate & independently validate candidate quotes (CP1 backend + snapshot consistency)
  -> Select & explain recommendation from verified allowlist (GPT-6 Luna, Responses API)
  -> Persist non-authoritative session slots, emit FinOps usage & structured trace
"""

import asyncio
import logging
import re
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime
from functools import partial
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from app.core.config import RoomUpgradeSettings
from app.services.room_upgrades.guardrails import (
    build_allowed_source_refs,
    detect_prompt_injection,
    validate_recommendation,
)
from app.services.room_upgrades.llm_runner import AsyncStructuredLlm, RoomUpgradeLlmRunner
from app.services.room_upgrades.schemas import (
    BackendBookingContextResponse,
    BackendBookingListResponse,
    BackendIssue,
    BackendQuoteResponse,
    BackendRoomType,
    BookingSummaryOut,
    CandidateQuoteOut,
    ExtractedIntent,
    ModelOutcomeStatus,
    ModelStatusOut,
    PolicySourceOut,
    ProposalAiMetadataOut,
    ProposalCreateDraftOut,
    ProposalCreatePayloadOut,
    ProposalPreviewExpectationOut,
    QuoteStatus,
    RecommendationLlmOutput,
    RoomUpgradeChatRequest,
    RoomUpgradeChatResponse,
    RoomUpgradeClientContext,
    RoomUpgradeSessionContext,
    StaffRole,
    StepTraceOut,
    WorkflowStatus,
    WorkflowTraceOut,
)
from app.services.room_upgrades.session import RoomUpgradeSessionStore
from app.services.room_upgrades.tools import (
    CoreDependencyError,
    CoreNotFoundError,
    RoomUpgradeToolset,
)
from app.services.summary.pii import mask_pii
from app.services.summary.vi_text import normalize_text
from app.services.usage_events import UsageEvent, publish_usage

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).resolve().parents[2] / "prompts"
INTENT_PROMPT_VERSION = "room-upgrades-intent.v1"
RECOMMEND_PROMPT_VERSION = "room-upgrades-recommend.v1"
INTENT_PROMPT_PATH = PROMPTS_DIR / f"{INTENT_PROMPT_VERSION}.md"
RECOMMEND_PROMPT_PATH = PROMPTS_DIR / f"{RECOMMEND_PROMPT_VERSION}.md"

MAX_QUOTED_CANDIDATES = 5
MAX_SNAPSHOT_REFRESHES = 1
_DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})$")
_TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})$")


def _format_vnd(amount: int) -> str:
    sign = "-" if amount < 0 else ""
    return f"{sign}{abs(amount):,}".replace(",", ".") + "đ"


def _parse_iso_with_offset(value: str | None) -> str | None:
    if not value:
        return None
    raw = value.strip()
    try:
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        return None
    return raw


def resolve_local_effective_at(
    *,
    date_str: str | None,
    time_str: str | None,
    timezone_name: str,
) -> str | None:
    """Resolve an explicit local date + HH:MM in the hotel's IANA timezone.

    Returns None if either component is missing, invalid, non-existent, or DST-ambiguous.
    """
    if not date_str or not time_str:
        return None
    d_match = _DATE_RE.match(date_str.strip())
    t_match = _TIME_RE.match(time_str.strip())
    if not d_match or not t_match:
        return None
    try:
        tz = ZoneInfo(timezone_name)
        target_date = date(int(d_match[1]), int(d_match[2]), int(d_match[3]))
        hour, minute = int(t_match[1]), int(t_match[2])
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            return None
        naive = datetime(target_date.year, target_date.month, target_date.day, hour, minute, 0)
        dt0 = naive.replace(tzinfo=tz, fold=0)
        dt1 = naive.replace(tzinfo=tz, fold=1)
    except (ValueError, ZoneInfoNotFoundError):
        return None

    # Reject DST-ambiguous wall times (two distinct UTC instants).
    if dt0.utcoffset() != dt1.utcoffset():
        return None
    # Reject DST spring-forward non-existent wall times.
    roundtrip = dt0.astimezone(UTC).astimezone(tz)
    if (roundtrip.year, roundtrip.month, roundtrip.day, roundtrip.hour, roundtrip.minute) != (
        naive.year,
        naive.month,
        naive.day,
        naive.hour,
        naive.minute,
    ):
        return None
    return dt0.isoformat()


def match_room_type_id(
    room_types: list[BackendRoomType],
    *,
    explicit_id: str | None,
    hint: str | None,
) -> tuple[str | None, bool]:
    """Match an ID or Vietnamese/English hint strictly against backend catalog roomTypes.

    Returns (matched_id, is_unknown_explicit_target).
    """
    by_upper_id = {room.id.upper(): room.id for room in room_types}
    if explicit_id:
        candidate = explicit_id.strip().upper()
        if candidate in by_upper_id:
            return by_upper_id[candidate], False
        # Treat unrecognized explicit ID as a hint first; if still unknown, flag it.
        hint = hint or explicit_id

    if not hint:
        return None, False

    folded_hint = normalize_text(hint)
    if not folded_hint:
        return None, False

    # Generic phrases ("hạng cao hơn", "phòng đẹp hơn") mean open discovery, not an unknown type.
    if folded_hint in {
        "hang cao hon",
        "phong cao hon",
        "nang hang",
        "phong tot hon",
        "phong dep hon",
        "upgrade",
    }:
        return None, False

    # Check exact ID or normalized room name / distinctive keyword match.
    matches: list[str] = []
    for room in room_types:
        room_id_norm = normalize_text(room.id)
        room_name_norm = normalize_text(room.name)
        aliases = {room_id_norm, room_name_norm}
        if room.id.upper() == "STD":
            aliases.update({"standard", "tieu chuan", "phong tieu chuan"})
        elif room.id.upper() == "DLX":
            aliases.update({"deluxe", "dlx", "deluxe huong vuon"})
        elif room.id.upper() == "STE":
            aliases.update({"suite", "ste", "suite gia dinh", "phong suite"})

        if folded_hint in aliases or any(
            alias and (alias in folded_hint or folded_hint in alias)
            for alias in aliases
            if len(alias) >= 3
        ):
            matches.append(room.id)

    if len(matches) == 1:
        return matches[0], False
    return None, True


def _booking_summary(context: BackendBookingContextResponse) -> BookingSummaryOut:
    booking = context.booking
    current_room = next((r for r in context.room_types if r.id == booking.room_type_id), None)
    return BookingSummaryOut(
        hotel_id=context.hotel.id,
        hotel_name=context.hotel.name,
        timezone=context.hotel.timezone,
        booking_code=booking.booking_code,
        room_number=booking.room_number,
        current_room_type_id=booking.room_type_id,
        current_room_type_name=current_room.name if current_room else None,
        status=booking.status,
        check_in_at=booking.check_in_at,
        check_out_at=booking.check_out_at,
        guests=booking.guests,
        version=booking.version,
    )


def _policy_sources_from_quote(quote: BackendQuoteResponse) -> list[PolicySourceOut]:
    if quote.policy is None:
        return []
    return [
        PolicySourceOut(
            ref=f"{quote.policy.code}:v{quote.policy.version}:{src.code}",
            code=src.code,
            policy_code=quote.policy.code,
            policy_version=quote.policy.version,
            clause=src.clause,
        )
        for src in quote.policy.sources
    ]


def _pick_deterministic_candidate(
    actionable: list[CandidateQuoteOut], requested_target_id: str | None
) -> CandidateQuoteOut:
    if requested_target_id:
        for cand in actionable:
            if cand.candidate_id == requested_target_id:
                return cand
    valid_only = [c for c in actionable if c.quote_status == "VALID"]
    pool = valid_only or actionable
    return sorted(
        pool,
        key=lambda c: (
            c.price_diff_vnd if c.price_diff_vnd is not None else 10**18,
            c.rank,
            c.candidate_id,
        ),
    )[0]


def _build_verified_summary_message(
    booking: BookingSummaryOut,
    candidate: CandidateQuoteOut,
    *,
    degraded: bool,
) -> tuple[str, str, str]:
    """Deterministic Vietnamese copy built strictly from backend-verified quote fields."""
    quote = candidate.quote
    diff_text = (
        _format_vnd(quote.price_diff_vnd) if quote.price_diff_vnd is not None else "chưa xác định"
    )
    nights = quote.remaining_nights or 0
    prefix = "[Chế độ dự phòng — dữ liệu xác minh từ hệ thống] " if degraded else ""

    benefit_note = ""
    if quote.benefit is not None and quote.totals and quote.totals.eligible_discount_vnd > 0:
        benefit_note = (
            f" Đã áp dụng quyền lợi xác minh {quote.benefit.code} "
            f"(giảm {_format_vnd(quote.totals.eligible_discount_vnd)})."
        )

    if quote.status == "REQUIRES_MANAGER":
        violation_text = "; ".join(v.message for v in quote.violations) or "Cần quản lý phê duyệt."
        approval_note = (
            "Trạng thái REQUIRES_MANAGER — bắt buộc chuyển quản lý (MANAGER) duyệt "
            f"({violation_text})."
        )
    else:
        approval_note = (
            f"Báo giá hợp lệ (VALID), chờ {quote.approval_role or 'RECEPTIONIST'} duyệt "
            "trước khi thực hiện thay đổi."
        )

    reason_vi = (
        f"{prefix}Phương án {candidate.room_type_name} ({candidate.candidate_id}) đáp ứng "
        f"sức chứa {booking.guests}/{candidate.max_guests} khách cho {nights} đêm còn lại, "
        f"chênh lệch đã kiểm: {diff_text}.{benefit_note} {approval_note}"
    )
    draft_vi = (
        f"Kính gửi Quý khách phòng {booking.room_number} (mã đặt phòng {booking.booking_code}), "
        f"khách sạn đề xuất phương án chuyển sang hạng {candidate.room_type_name} cho {nights} đêm "
        f"còn lại với chênh lệch {diff_text}.{benefit_note} "
        f"Đây là báo giá dự kiến (dữ liệu mô phỏng), cần xác nhận của Quý khách và phê duyệt "
        f"từ {'Quản lý' if quote.approval_role == 'MANAGER' else 'Lễ tân'} trước khi áp dụng."
    )
    message_vi = (
        f"{prefix}Đề xuất {candidate.room_type_name} ({candidate.candidate_id}) cho booking "
        f"{booking.booking_code} ({nights} đêm, chênh lệch {diff_text}). {approval_note}"
    )
    return message_vi, reason_vi, draft_vi


def _build_proposal_draft(
    *,
    selected_quote: BackendQuoteResponse | None,
    selected_candidate_id: str | None,
    session_ctx: RoomUpgradeSessionContext,
    session_id: UUID,
    request_id: UUID,
    model_out: ModelStatusOut,
    recommendation_reason_vi: str | None,
    draft_message_vi: str | None,
) -> ProposalCreateDraftOut | None:
    """Prepare non-authoritative CP3 input; never submit or grant approval authority."""
    if (
        selected_quote is None
        or selected_candidate_id is None
        or selected_quote.status not in ("VALID", "REQUIRES_MANAGER")
        or not selected_quote.validation.checked
        or not selected_quote.validation.passed
        or selected_quote.booking_code is None
        or selected_quote.effective_at is None
        or selected_quote.price_diff_vnd is None
        or selected_quote.approval_role is None
    ):
        return None

    def bounded_text(value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip()[:1000] or None

    return ProposalCreateDraftOut(
        payload=ProposalCreatePayloadOut(
            hotel_id=selected_quote.hotel_id,
            booking_code=selected_quote.booking_code,
            target_room_type_id=selected_candidate_id,
            effective_at=selected_quote.effective_at,
            request_type=session_ctx.request_type,
            required_features=list(session_ctx.required_features),
            benefit_id=session_ctx.benefit_id,
            preview_expectation=ProposalPreviewExpectationOut(
                expected_price_diff_vnd=selected_quote.price_diff_vnd,
                expected_snapshot_id=selected_quote.snapshot_id,
                expected_quote_status=selected_quote.status,
                expected_approval_role=selected_quote.approval_role,
            ),
            ai_metadata=ProposalAiMetadataOut(
                session_id=str(session_id),
                ai_request_id=str(request_id),
                selected_candidate_id=selected_candidate_id,
                model=model_out.model,
                prompt_versions=list(model_out.prompt_versions[:10]),
                recommendation_reason_vi=bounded_text(recommendation_reason_vi),
                draft_message_vi=bounded_text(draft_message_vi),
            ),
        )
    )


def _describe_non_priced_quote(
    booking: BookingSummaryOut | None, quote: BackendQuoteResponse
) -> str:
    code_label = booking.booking_code if booking else (quote.booking_code or "booking")
    if quote.violations:
        details = "; ".join(v.message for v in quote.violations)
        return (
            f"Chưa thể tạo báo giá cho {code_label} (trạng thái {quote.status}): {details} "
            "Không có tổng tiền chính thức và chưa có tác động vận hành."
        )
    if quote.missing_fields:
        fields = ", ".join(quote.missing_fields)
        return (
            f"Chưa thể tính báo giá cho {code_label} (trạng thái {quote.status}) "
            f"vì thiếu dữ liệu: {fields}. Hệ thống không tự điền giá trị mặc định."
        )
    return f"Chưa thể tạo báo giá cho {code_label} (trạng thái {quote.status})."


def _seed_context_from_prior(
    hotel_id: str,
    stored: RoomUpgradeSessionContext | None,
    client_ctx: RoomUpgradeClientContext | None,
    selected_booking_code: str | None,
) -> RoomUpgradeSessionContext:
    """Build baseline non-authoritative context from verified server session or client hints."""
    if stored is not None:
        base = stored.model_copy(deep=True)
    elif client_ctx is not None:
        base = RoomUpgradeSessionContext(
            hotel_id=hotel_id,
            booking_code=client_ctx.booking_code,
            room_number=client_ctx.room_number,
            target_room_type_id=client_ctx.target_room_type_id,
            target_room_hint=client_ctx.target_room_hint,
            effective_at=_parse_iso_with_offset(client_ctx.effective_at),
            request_type=client_ctx.request_type or "UPGRADE",
            required_features=list(client_ctx.required_features),
            guest_preferences=list(client_ctx.guest_preferences),
            benefit_id=client_ctx.benefit_id,
        )
    else:
        base = RoomUpgradeSessionContext(hotel_id=hotel_id)

    if selected_booking_code:
        if base.booking_code and base.booking_code != selected_booking_code:
            base.room_number = None
            base.benefit_id = None
        base.booking_code = selected_booking_code
    return base


def _merge_extracted_intent(
    base: RoomUpgradeSessionContext,
    extracted: ExtractedIntent,
    *,
    hotel_timezone: str,
) -> tuple[RoomUpgradeSessionContext, bool]:
    """Merge newly extracted slots onto prior session context.

    Returns (merged_context, effective_time_explicitly_ambiguous).
    """
    merged = base.model_copy(deep=True)

    new_booking = extracted.booking_code.strip() if extracted.booking_code else None
    new_room = extracted.room_number.strip() if extracted.room_number else None
    if new_booking and new_booking != merged.booking_code:
        merged.booking_code = new_booking
        merged.room_number = new_room
        merged.benefit_id = None
    elif new_room and new_room != merged.room_number:
        merged.room_number = new_room
        if not new_booking:
            merged.booking_code = None
            merged.benefit_id = None

    if extracted.target_room_type_id:
        merged.target_room_type_id = extracted.target_room_type_id.strip()
    if extracted.target_room_hint:
        merged.target_room_hint = extracted.target_room_hint.strip()
        # New target hint replaces stale target_room_type_id unless both were extracted together.
        if not extracted.target_room_type_id:
            merged.target_room_type_id = None

    if extracted.request_type is not None:
        merged.request_type = extracted.request_type

    if extracted.required_features:
        seen = set(merged.required_features)
        for feat in extracted.required_features:
            clean = feat.strip().upper()
            if clean and clean not in seen:
                merged.required_features.append(clean)
                seen.add(clean)

    if extracted.guest_preferences:
        seen_p = set(merged.guest_preferences)
        for pref in extracted.guest_preferences:
            clean = pref.strip()
            if clean and clean not in seen_p:
                merged.guest_preferences.append(clean)
                seen_p.add(clean)

    if extracted.benefit_id:
        merged.benefit_id = extracted.benefit_id.strip()

    # Resolve effectiveAt strictly from explicit inputs; never default missing hour/date/offset.
    time_ambiguous = False
    if extracted.effective_time_ambiguous:
        merged.effective_at = None
        time_ambiguous = True
    elif extracted.effective_at_iso:
        parsed_iso = _parse_iso_with_offset(extracted.effective_at_iso)
        if parsed_iso is not None:
            merged.effective_at = parsed_iso
        else:
            merged.effective_at = None
            time_ambiguous = True
    elif extracted.effective_date or extracted.effective_time:
        resolved = resolve_local_effective_at(
            date_str=extracted.effective_date,
            time_str=extracted.effective_time,
            timezone_name=hotel_timezone,
        )
        if resolved is not None:
            merged.effective_at = resolved
        else:
            merged.effective_at = None
            time_ambiguous = True

    return merged, time_ambiguous


class RoomUpgradeWorkflow:
    """Orchestrates one bounded, audited Room Upgrades Copilot turn."""

    def __init__(
        self,
        *,
        settings: RoomUpgradeSettings,
        core: httpx.AsyncClient,
        llm_client: AsyncStructuredLlm | None,
        session_store: RoomUpgradeSessionStore,
        now_fn: Callable[[], datetime] = lambda: datetime.now(UTC),
        usage_publisher: Callable[[list[UsageEvent]], Awaitable[None]] = publish_usage,
    ) -> None:
        self._settings = settings
        self._core = core
        self._llm_client = llm_client
        self._session_store = session_store
        self._now_fn = now_fn
        self._usage_publisher = usage_publisher

    async def execute(
        self,
        request: RoomUpgradeChatRequest,
        *,
        user_id: str,
        access_token: str,
        request_id: UUID | None = None,
        started_monotonic: float | None = None,
    ) -> RoomUpgradeChatResponse:
        loop = asyncio.get_running_loop()
        start_perf = time.perf_counter()
        req_id = request_id or uuid4()
        session_id = request.session_id or uuid4()
        started_at = started_monotonic if started_monotonic is not None else loop.time()
        deadline = started_at + self._settings.room_upgrades_llm_timeout_seconds

        user_uuid: UUID | None = None
        try:
            user_uuid = UUID(user_id)
        except ValueError:
            user_uuid = None

        steps: list[StepTraceOut] = []
        tools = RoomUpgradeToolset(
            core=self._core,
            access_token=access_token,
            request_id=req_id,
            deadline=deadline,
            core_timeout_seconds=self._settings.room_upgrades_core_timeout_seconds,
        )
        llm = RoomUpgradeLlmRunner(
            client=self._llm_client,
            settings=self._settings,
            deadline=deadline,
            request_id=req_id,
            session_id=session_id,
            user_id=user_uuid,
        )

        staff_role: StaffRole | None = None
        snapshot_id: str | None = None
        fixture_version: str | None = None
        policy_version: int | None = None
        session_ctx = RoomUpgradeSessionContext(hotel_id=request.hotel_id)

        def record_step(
            step: str, outcome: str, step_start: float, detail: str | None = None
        ) -> None:
            steps.append(
                StepTraceOut(
                    step=step,
                    outcome=outcome,
                    latency_ms=max(0, round((time.perf_counter() - step_start) * 1000)),
                    detail=detail,
                )
            )

        def build_response(
            *,
            workflow_status: WorkflowStatus,
            quote_status: QuoteStatus | None,
            message_vi: str,
            recommendation_reason_vi: str | None = None,
            draft_message_vi: str | None = None,
            missing_fields: list[str] | None = None,
            violations: list[BackendIssue] | None = None,
            booking_summary: BookingSummaryOut | None = None,
            candidates: list[CandidateQuoteOut] | None = None,
            selected_candidate_id: str | None = None,
            selected_quote: BackendQuoteResponse | None = None,
            policy_sources: list[PolicySourceOut] | None = None,
            approval_role: StaffRole | None = None,
            model_status_override: ModelOutcomeStatus | None = None,
            degraded: bool = False,
            error_code: str | None = None,
        ) -> RoomUpgradeChatResponse:
            total_ms = max(0, round((time.perf_counter() - start_perf) * 1000))
            model_out = llm.build_model_status(status=model_status_override, degraded=degraded)
            trace_out = WorkflowTraceOut(
                request_id=req_id,
                total_latency_ms=total_ms,
                steps=steps,
                tools=tools.traces,
                model_calls=llm.model_calls,
                snapshot_id=snapshot_id,
                fixture_version=fixture_version,
                policy_version=policy_version,
                error_code=error_code,
            )
            response = RoomUpgradeChatResponse(
                request_id=req_id,
                session_id=session_id,
                session_context=session_ctx,
                workflow_status=workflow_status,
                quote_status=quote_status,
                message_vi=message_vi,
                recommendation_reason_vi=recommendation_reason_vi,
                draft_message_vi=draft_message_vi,
                missing_fields=missing_fields or [],
                violations=violations or [],
                booking_summary=booking_summary,
                candidates=candidates or [],
                selected_candidate_id=selected_candidate_id,
                selected_quote=selected_quote,
                proposal_draft=_build_proposal_draft(
                    selected_quote=selected_quote,
                    selected_candidate_id=selected_candidate_id,
                    session_ctx=session_ctx,
                    session_id=session_id,
                    request_id=req_id,
                    model_out=model_out,
                    recommendation_reason_vi=recommendation_reason_vi,
                    draft_message_vi=draft_message_vi,
                )
                if workflow_status in {"COMPLETED", "DEGRADED"}
                else None,
                policy_sources=policy_sources or [],
                approval_role=approval_role,
                staff_role=staff_role,
                snapshot_id=snapshot_id,
                fixture_version=fixture_version,
                model=model_out,
                trace=trace_out,
            )
            logger.info(
                "room_upgrades.workflow.finished",
                extra={
                    "requestId": str(req_id),
                    "hotelId": request.hotel_id,
                    "workflowStatus": workflow_status,
                    "quoteStatus": quote_status,
                    "model": model_out.model,
                    "modelStatus": model_out.status,
                    "degraded": model_out.degraded,
                    "callCount": model_out.call_count,
                    "repairCount": model_out.repair_count,
                    "usageStatus": model_out.usage_status,
                    "inputTokens": model_out.input_tokens,
                    "cachedInputTokens": model_out.cached_input_tokens,
                    "outputTokens": model_out.output_tokens,
                    "reasoningTokens": model_out.reasoning_tokens,
                    "costUsd": model_out.cost_usd,
                    "responseIds": model_out.response_ids,
                    "totalLatencyMs": total_ms,
                    "snapshotId": snapshot_id,
                    "fixtureVersion": fixture_version,
                    "policyVersion": policy_version,
                    "guardrailEvents": model_out.guardrail_events,
                    "errorCode": error_code,
                },
            )
            return response

        try:
            # Step 1: Authorize hotel scope on Core API BEFORE any LLM call or business data read.
            t0 = time.perf_counter()
            booking_list: BackendBookingListResponse = await tools.authorize_and_list_bookings(
                request.hotel_id
            )
            staff_role = booking_list.staff_role
            snapshot_id = booking_list.snapshot_id
            fixture_version = booking_list.fixture_version
            hotel_tz = booking_list.hotel.timezone
            record_step("authorize_hotel_scope", "ok", t0, f"staffRole={staff_role}")

            # Step 2: Load & enforce strict (userId, hotelId) session ownership.
            t0 = time.perf_counter()
            stored_session = await self._session_store.load(
                session_id, user_id=user_id, hotel_id=request.hotel_id
            )
            session_ctx = _seed_context_from_prior(
                request.hotel_id,
                stored_session.context if stored_session else None,
                request.context,
                request.selected_booking_code,
            )
            record_step(
                "load_session",
                "hit" if stored_session else "new",
                t0,
            )

            # Step 3: Input prompt-injection / authority-bypass guardrail (before LLM).
            t0 = time.perf_counter()
            injection_groups = detect_prompt_injection(request.message)
            if injection_groups:
                llm.guardrail_events.extend(injection_groups)
                record_step("input_guardrail", "blocked", t0, ",".join(injection_groups))
                return build_response(
                    workflow_status="BLOCKED_INJECTION",
                    quote_status=None,
                    message_vi=(
                        "Yêu cầu bị từ chối vì chứa chỉ dẫn vượt quyền hoặc can thiệp chính sách. "
                        "Trợ lý không thể bỏ qua phân quyền quản lý, tự đặt giá 0đ, tự đánh dấu "
                        "APPROVED hay thực hiện chuyển phòng/thanh toán."
                    ),
                    violations=[
                        BackendIssue(
                            code="PROMPT_INJECTION_BLOCKED",
                            field="message",
                            message=(
                                "Từ chối chỉ dẫn cố gắng vượt quyền, bỏ qua policy hoặc tự duyệt."
                            ),
                        )
                    ],
                    model_status_override="not_called",
                    error_code="PROMPT_INJECTION_BLOCKED",
                )
            record_step("input_guardrail", "clean", t0)

            # Step 4: Structured Intent Extraction via GPT-6 Luna (Responses API).
            t0 = time.perf_counter()
            now_utc = self._now_fn()
            try:
                server_now_local = now_utc.astimezone(ZoneInfo(hotel_tz)).isoformat()
            except ZoneInfoNotFoundError:
                server_now_local = now_utc.isoformat()

            intent_payload: dict[str, Any] = {
                "serverNow": server_now_local,
                "hotelTimezone": hotel_tz,
                "priorContext": {
                    "bookingCode": session_ctx.booking_code,
                    "roomNumber": session_ctx.room_number,
                    "targetRoomTypeId": session_ctx.target_room_type_id,
                    "targetRoomHint": session_ctx.target_room_hint,
                    "effectiveAt": session_ctx.effective_at,
                    "requestType": session_ctx.request_type,
                    "requiredFeatures": session_ctx.required_features,
                    "guestPreferences": session_ctx.guest_preferences,
                    "benefitId": session_ctx.benefit_id,
                    "pendingMissingFields": session_ctx.pending_missing_fields,
                },
                "message": mask_pii(request.message),
            }
            intent_outcome = await llm.call_structured(
                step="extract_intent",
                repair_step="extract_intent_repair",
                prompt_version=INTENT_PROMPT_VERSION,
                system_prompt=INTENT_PROMPT_PATH.read_text(encoding="utf-8"),
                user_payload=intent_payload,
                output_model=ExtractedIntent,
                schema_name="room_upgrades_intent",
            )
            if not intent_outcome.ok or intent_outcome.data is None:
                record_step(
                    "extract_intent",
                    intent_outcome.status,
                    t0,
                    intent_outcome.error_code,
                )
                return build_response(
                    workflow_status="AI_ERROR",
                    quote_status=None,
                    message_vi=(
                        "Không thể phân tích yêu cầu qua mô hình AI ở lượt này "
                        f"({intent_outcome.error_code or intent_outcome.status}). "
                        "Hệ thống không tự tạo báo giá chưa xác minh; vui lòng thử lại."
                    ),
                    degraded=True,
                    error_code=intent_outcome.error_code or "INTENT_EXTRACTION_FAILED",
                )

            extracted = intent_outcome.data
            record_step("extract_intent", "ok", t0, f"scope={extracted.intent_scope}")

            if extracted.intent_scope == "prompt_injection" or extracted.unauthorized_request:
                llm.guardrail_events.append("MODEL_DETECTED_UNAUTHORIZED_REQUEST")
                return build_response(
                    workflow_status="BLOCKED_INJECTION",
                    quote_status=None,
                    message_vi=(
                        "Yêu cầu vượt ngoài thẩm quyền của trợ lý AI. "
                        "Hệ thống không thể bỏ qua chính sách, tự duyệt hoặc sửa giá/booking."
                    ),
                    violations=[
                        BackendIssue(
                            code="UNAUTHORIZED_REQUEST",
                            field="message",
                            message=extracted.unauthorized_reason
                            or "Yêu cầu vượt thẩm quyền hoặc cố bỏ qua chính sách.",
                        )
                    ],
                    error_code="UNAUTHORIZED_REQUEST",
                )

            if extracted.intent_scope == "out_of_scope":
                return build_response(
                    workflow_status="OUT_OF_SCOPE",
                    quote_status=None,
                    message_vi=(
                        "Trợ lý này chỉ hỗ trợ nhân viên khách sạn tra cứu và báo giá "
                        "đổi/nâng hạng phòng (Room Upgrades). Vui lòng nhập mã booking/số phòng."
                    ),
                )

            session_ctx, time_ambiguous = _merge_extracted_intent(
                session_ctx, extracted, hotel_timezone=hotel_tz
            )

            # Step 5: Resolve booking code (direct bookingCode or lookup by active roomNumber).
            t0 = time.perf_counter()
            resolved_booking_code = session_ctx.booking_code
            if not resolved_booking_code and session_ctx.room_number:
                room_matches = [
                    b for b in booking_list.items if b.room_number == session_ctx.room_number
                ]
                if len(room_matches) == 1:
                    resolved_booking_code = room_matches[0].booking_code
                    session_ctx.booking_code = resolved_booking_code
                elif len(room_matches) > 1:
                    session_ctx.pending_missing_fields = ["bookingCode"]
                    await self._session_store.save(
                        session_id, user_id=user_id, hotel_id=request.hotel_id, context=session_ctx
                    )
                    record_step("resolve_booking", "ambiguous_room", t0)
                    return build_response(
                        workflow_status="NEEDS_INPUT",
                        quote_status="NEEDS_INPUT",
                        message_vi=(
                            f"Phòng {session_ctx.room_number} hiện có nhiều booking đang lưu trú. "
                            "Vui lòng cung cấp mã booking cụ thể (ví dụ: C2-0001)."
                        ),
                        missing_fields=["bookingCode"],
                        violations=[
                            BackendIssue(
                                code="AMBIGUOUS_ROOM_NUMBER",
                                field="bookingCode",
                                message="Nhiều booking đang lưu trú cùng số phòng; cần mã booking.",
                            )
                        ],
                    )
                else:
                    record_step("resolve_booking", "not_found_by_room", t0)
                    return build_response(
                        workflow_status="COMPLETED",
                        quote_status="INELIGIBLE",
                        message_vi=(
                            f"Không tìm thấy booking đang lưu trú cho phòng "
                            f"{session_ctx.room_number} trong khách sạn này."
                        ),
                        violations=[
                            BackendIssue(
                                code="BOOKING_NOT_FOUND",
                                field="roomNumber",
                                message=(
                                    "Không tìm thấy booking đang lưu trú theo số phòng đã nhập."
                                ),
                            )
                        ],
                    )

            if not resolved_booking_code:
                missing = ["bookingCodeOrRoomNumber"]
                if not session_ctx.effective_at:
                    missing.append("effectiveAt")
                session_ctx.pending_missing_fields = missing
                await self._session_store.save(
                    session_id, user_id=user_id, hotel_id=request.hotel_id, context=session_ctx
                )
                record_step("resolve_booking", "missing_booking", t0)
                return build_response(
                    workflow_status="NEEDS_INPUT",
                    quote_status="NEEDS_INPUT",
                    message_vi=(
                        "Vui lòng cung cấp mã booking (ví dụ: C2-0001) hoặc số phòng đang lưu trú "
                        "để tôi tra cứu thông tin và báo giá nâng/đổi hạng phòng."
                    ),
                    missing_fields=missing,
                )
            record_step("resolve_booking", "ok", t0, f"booking={resolved_booking_code}")

            # Step 6: Load authoritative booking context from Core API.
            t0 = time.perf_counter()
            try:
                booking_context = await tools.get_booking_context(
                    request.hotel_id, resolved_booking_code
                )
            except CoreNotFoundError:
                record_step("load_booking_context", "not_found", t0)
                return build_response(
                    workflow_status="COMPLETED",
                    quote_status="INELIGIBLE",
                    message_vi=(
                        f"Không tìm thấy booking {resolved_booking_code} trong khách sạn "
                        f"{booking_list.hotel.name}."
                    ),
                    violations=[
                        BackendIssue(
                            code="BOOKING_NOT_FOUND",
                            field="bookingCode",
                            message="Không tìm thấy booking trong khách sạn.",
                        )
                    ],
                )
            snapshot_id = booking_context.snapshot_id
            fixture_version = booking_context.fixture_version
            summary = _booking_summary(booking_context)
            record_step(
                "load_booking_context", "ok", t0, f"status={booking_context.booking.status}"
            )

            # Map target room type strictly against backend roomTypes catalog.
            resolved_target_id, is_unknown_target = match_room_type_id(
                booking_context.room_types,
                explicit_id=session_ctx.target_room_type_id,
                hint=session_ctx.target_room_hint,
            )
            if resolved_target_id:
                session_ctx.target_room_type_id = resolved_target_id

            # If booking is not IN_HOUSE and effectiveAt is missing, report INELIGIBLE right away.
            if booking_context.booking.status != "IN_HOUSE" and not session_ctx.effective_at:
                await self._session_store.save(
                    session_id, user_id=user_id, hotel_id=request.hotel_id, context=session_ctx
                )
                return build_response(
                    workflow_status="COMPLETED",
                    quote_status="INELIGIBLE",
                    message_vi=(
                        f"Booking {summary.booking_code} hiện có trạng thái {summary.status} "
                        "(chưa check-in hoặc đã checkout) nên không đủ điều kiện đổi/nâng hạng."
                    ),
                    booking_summary=summary,
                    violations=[
                        BackendIssue(
                            code="NOT_IN_HOUSE",
                            field="bookingCode",
                            message="Booking chưa check-in hoặc đã checkout.",
                        )
                    ],
                )

            if is_unknown_target:
                catalog_list = ", ".join(
                    f"{r.name} ({r.id})"
                    for r in sorted(booking_context.room_types, key=lambda x: x.rank)
                )
                session_ctx.target_room_type_id = None
                session_ctx.pending_missing_fields = ["targetRoomTypeId"]
                await self._session_store.save(
                    session_id, user_id=user_id, hotel_id=request.hotel_id, context=session_ctx
                )
                return build_response(
                    workflow_status="NEEDS_INPUT",
                    quote_status="NEEDS_INPUT",
                    message_vi=(
                        f"Hạng phòng yêu cầu không có trong danh mục của khách sạn. "
                        f"Các hạng phòng hiện có: {catalog_list}. Vui lòng chọn hạng phòng hợp lệ."
                    ),
                    missing_fields=["targetRoomTypeId"],
                    booking_summary=summary,
                )

            # Check explicit transfer time; never default missing hour/date/offset.
            if not session_ctx.effective_at:
                session_ctx.pending_missing_fields = ["effectiveAt"]
                await self._session_store.save(
                    session_id, user_id=user_id, hotel_id=request.hotel_id, context=session_ctx
                )
                extra_hint = (
                    " (thời điểm vừa nêu chưa đủ ngày, giờ hoặc múi giờ xác định)"
                    if time_ambiguous
                    else ""
                )
                target_label = f" sang hạng {resolved_target_id}" if resolved_target_id else ""
                return build_response(
                    workflow_status="NEEDS_INPUT",
                    quote_status="NEEDS_INPUT",
                    message_vi=(
                        f"Đã ghi nhận booking {summary.booking_code} (phòng {summary.room_number})"
                        f"{target_label}. Vui lòng cung cấp ngày và giờ chuyển phòng cụ thể"
                        f"{extra_hint} theo giờ khách sạn ({summary.timezone}, "
                        "ví dụ: 14:00 ngày 28/11) để tôi kiểm tra tồn phòng và tính báo giá."
                    ),
                    missing_fields=["effectiveAt"],
                    booking_summary=summary,
                )

            # Step 7: Policy lookup, candidates, pricing & validation (max 1 snapshot refresh).
            t0 = time.perf_counter()
            candidates: list[CandidateQuoteOut] = []
            policy_sources: list[PolicySourceOut] = []
            snapshot_consistent = False

            for attempt in range(MAX_SNAPSHOT_REFRESHES + 1):
                if attempt > 0:
                    booking_context = await tools.get_booking_context(
                        request.hotel_id, resolved_booking_code
                    )
                    snapshot_id = booking_context.snapshot_id
                    fixture_version = booking_context.fixture_version
                    summary = _booking_summary(booking_context)

                policy_res = tools.get_upgrade_policy(
                    booking_context,
                    effective_at=session_ctx.effective_at,
                    now=self._now_fn(),
                )
                policy_sources = policy_res.sources
                policy_version = policy_res.policy.version if policy_res.policy else None

                available_res = tools.find_available_rooms(
                    booking_context,
                    effective_at=session_ctx.effective_at,
                    request_type=session_ctx.request_type,
                    required_features=session_ctx.required_features,
                    policy=policy_res.policy,
                    requested_target_id=resolved_target_id,
                )

                if resolved_target_id is not None:
                    target_ids = [resolved_target_id]
                else:
                    target_ids = available_res.candidate_ids[:MAX_QUOTED_CANDIDATES]

                if not target_ids:
                    record_step("generate_quotes", "no_candidates", t0)
                    session_ctx.pending_missing_fields = []
                    await self._session_store.save(
                        session_id, user_id=user_id, hotel_id=request.hotel_id, context=session_ctx
                    )
                    return build_response(
                        workflow_status="COMPLETED",
                        quote_status="INELIGIBLE",
                        message_vi=(
                            f"Không tìm thấy hạng phòng phù hợp cho booking {summary.booking_code} "
                            "theo sức chứa, tiện nghi yêu cầu và chính sách đổi/nâng hạng."
                        ),
                        booking_summary=summary,
                        policy_sources=policy_sources,
                        violations=[
                            BackendIssue(
                                code="NO_ELIGIBLE_CANDIDATES",
                                field="targetRoomTypeId",
                                message="Không có hạng phòng phù hợp điều kiện nâng/đổi hạng.",
                            )
                        ],
                    )

                room_by_id = {r.id: r for r in booking_context.room_types}
                quoted: list[CandidateQuoteOut] = []
                drift_detected = False
                seen_snapshots: set[str] = {booking_context.snapshot_id}

                for tid in target_ids:
                    quote = await tools.calculate_upgrade_quote(
                        hotel_id=request.hotel_id,
                        booking_code=resolved_booking_code,
                        target_room_type_id=tid,
                        effective_at=session_ctx.effective_at,
                        request_type=session_ctx.request_type,
                        required_features=session_ctx.required_features,
                        benefit_id=session_ctx.benefit_id,
                    )
                    seen_snapshots.add(quote.snapshot_id)
                    validation = tools.validate_upgrade_proposal(
                        quote,
                        booking_context,
                        expected_snapshot_id=booking_context.snapshot_id,
                    )
                    if validation.snapshot_drift or len(seen_snapshots) > 1:
                        drift_detected = True
                        break
                    if not validation.passed:
                        # Fail closed: never return totals from a quote that failed validation.
                        quote = quote.model_copy(
                            update={
                                "status": "VALIDATION_FAILED",
                                "totals": None,
                                "price_diff_vnd": None,
                                "breakdown": [],
                                "approval_role": None,
                            }
                        )
                    room = room_by_id[tid]
                    quoted.append(
                        CandidateQuoteOut(
                            candidate_id=tid,
                            room_type_name=room.name,
                            rank=room.rank,
                            max_guests=room.max_guests,
                            features=room.features,
                            quote_status=quote.status,
                            price_diff_vnd=quote.price_diff_vnd,
                            remaining_nights=quote.remaining_nights,
                            totals=quote.totals,
                            approval_role=quote.approval_role,
                            benefit=quote.benefit,
                            missing_fields=quote.missing_fields,
                            violations=quote.violations,
                            quote=quote,
                        )
                    )

                if not drift_detected:
                    candidates = quoted
                    snapshot_consistent = True
                    break

            if not snapshot_consistent:
                record_step("generate_quotes", "snapshot_inconsistent", t0)
                return build_response(
                    workflow_status="DEGRADED",
                    quote_status="MISSING_DATA",
                    message_vi=(
                        "Dữ liệu tồn phòng hoặc bảng giá vừa thay đổi trong lúc tính báo giá. "
                        "Hệ thống không gộp dữ liệu khác snapshot; vui lòng yêu cầu báo giá lại."
                    ),
                    missing_fields=["snapshotConsistency"],
                    violations=[
                        BackendIssue(
                            code="SNAPSHOT_INCONSISTENT",
                            field="snapshotId",
                            message=(
                                "Snapshot giữa context và báo giá không còn nhất quán; "
                                "cần báo giá lại."
                            ),
                        )
                    ],
                    booking_summary=summary,
                    policy_sources=policy_sources,
                    degraded=True,
                    error_code="SNAPSHOT_INCONSISTENT",
                )

            record_step("generate_quotes", "ok", t0, f"quoted={len(candidates)}")
            session_ctx.pending_missing_fields = []
            await self._session_store.save(
                session_id, user_id=user_id, hotel_id=request.hotel_id, context=session_ctx
            )

            # Collect actionable backend-validated candidates (VALID or REQUIRES_MANAGER).
            actionable = [
                c
                for c in candidates
                if c.quote_status in {"VALID", "REQUIRES_MANAGER"}
                and c.quote.validation.checked
                and c.quote.validation.passed
                and c.quote.totals is not None
                and c.quote.price_diff_vnd is not None
            ]

            if not actionable:
                primary = candidates[0].quote
                quote_sources = _policy_sources_from_quote(primary) or policy_sources
                if primary.policy:
                    policy_version = primary.policy.version
                return build_response(
                    workflow_status="COMPLETED",
                    quote_status=primary.status,
                    message_vi=_describe_non_priced_quote(summary, primary),
                    missing_fields=primary.missing_fields,
                    violations=primary.violations,
                    booking_summary=summary,
                    candidates=candidates,
                    selected_candidate_id=None,
                    selected_quote=primary,
                    policy_sources=quote_sources,
                    approval_role=None,
                )

            # Step 8: AI Recommendation & Vietnamese draft via GPT-6 Luna (allowlist + guardrails).
            t0 = time.perf_counter()
            allowed_ids = {c.candidate_id for c in actionable}
            candidates_by_id = {c.candidate_id: c for c in actionable}
            allowed_source_refs = build_allowed_source_refs([c.quote for c in actionable])

            rec_payload: dict[str, Any] = {
                "booking": {
                    "bookingCode": summary.booking_code,
                    "roomNumber": summary.room_number,
                    "currentRoomTypeId": summary.current_room_type_id,
                    "currentRoomTypeName": summary.current_room_type_name,
                    "guests": summary.guests,
                    "checkInAt": summary.check_in_at,
                    "checkOutAt": summary.check_out_at,
                },
                "request": {
                    "requestType": session_ctx.request_type,
                    "effectiveAt": session_ctx.effective_at,
                    "requiredFeatures": session_ctx.required_features,
                    "guestPreferences": session_ctx.guest_preferences,
                    "requestedTargetRoomTypeId": resolved_target_id,
                },
                "allowedCandidateIds": sorted(allowed_ids),
                "allowedSourceRefs": sorted(allowed_source_refs),
                "candidates": [
                    {
                        "candidateId": c.candidate_id,
                        "roomTypeName": c.room_type_name,
                        "rank": c.rank,
                        "maxGuests": c.max_guests,
                        "features": c.features,
                        "quoteStatus": c.quote_status,
                        "remainingNights": c.remaining_nights,
                        "priceDiffVnd": c.price_diff_vnd,
                        "totals": c.totals.model_dump(mode="json", by_alias=True)
                        if c.totals
                        else None,
                        "benefit": c.benefit.model_dump(mode="json", by_alias=True)
                        if c.benefit
                        else None,
                        "approvalRole": c.approval_role,
                        "requiresHumanApproval": True,
                        "violations": [
                            v.model_dump(mode="json", by_alias=True) for v in c.violations
                        ],
                        "policy": c.quote.policy.model_dump(mode="json", by_alias=True)
                        if c.quote.policy
                        else None,
                    }
                    for c in actionable
                ],
            }

            rec_outcome = await llm.call_structured(
                step="recommend",
                repair_step="recommend_repair",
                prompt_version=RECOMMEND_PROMPT_VERSION,
                system_prompt=RECOMMEND_PROMPT_PATH.read_text(encoding="utf-8"),
                user_payload=rec_payload,
                output_model=RecommendationLlmOutput,
                schema_name="room_upgrades_recommendation",
                validator=partial(
                    validate_recommendation,
                    allowed_candidate_ids=allowed_ids,
                    allowed_source_refs=allowed_source_refs,
                    candidates_by_id=candidates_by_id,
                ),
            )

            if rec_outcome.ok and rec_outcome.data is not None:
                rec = rec_outcome.data
                chosen = candidates_by_id[rec.selected_candidate_id]
                # Put model's verified ranking first, keeping any unranked items behind.
                rank_pos = {cid: idx for idx, cid in enumerate(rec.ranked_candidate_ids)}
                ordered_candidates = sorted(
                    candidates, key=lambda c: (rank_pos.get(c.candidate_id, 999), c.rank)
                )
                quote = chosen.quote
                quote_sources = _policy_sources_from_quote(quote) or policy_sources
                if quote.policy:
                    policy_version = quote.policy.version
                diff_text = _format_vnd(quote.price_diff_vnd or 0)
                approval_note = (
                    "Cần chuyển Quản lý (MANAGER) phê duyệt."
                    if quote.status == "REQUIRES_MANAGER"
                    else f"Chờ {quote.approval_role or 'RECEPTIONIST'} duyệt."
                )
                record_step("recommend", "ok", t0, f"selected={chosen.candidate_id}")
                return build_response(
                    workflow_status="COMPLETED",
                    quote_status=quote.status,
                    message_vi=(
                        f"Đề xuất {chosen.room_type_name} ({chosen.candidate_id}) cho booking "
                        f"{summary.booking_code}: {quote.remaining_nights} đêm, chênh lệch "
                        f"{diff_text} ({quote.status}). {approval_note}"
                    ),
                    recommendation_reason_vi=rec.reason_vi,
                    draft_message_vi=rec.draft_message_vi,
                    missing_fields=quote.missing_fields,
                    violations=quote.violations,
                    booking_summary=summary,
                    candidates=ordered_candidates,
                    selected_candidate_id=chosen.candidate_id,
                    selected_quote=quote,
                    policy_sources=quote_sources,
                    approval_role=quote.approval_role,
                )

            # Safe deterministic degraded fallback ONLY over backend-verified quotes.
            chosen = _pick_deterministic_candidate(actionable, resolved_target_id)
            quote = chosen.quote
            quote_sources = _policy_sources_from_quote(quote) or policy_sources
            if quote.policy:
                policy_version = quote.policy.version
            msg_vi, reason_vi, draft_vi = _build_verified_summary_message(
                summary, chosen, degraded=True
            )
            record_step("recommend", f"degraded:{rec_outcome.status}", t0, rec_outcome.error_code)
            return build_response(
                workflow_status="DEGRADED",
                quote_status=quote.status,
                message_vi=msg_vi,
                recommendation_reason_vi=reason_vi,
                draft_message_vi=draft_vi,
                missing_fields=quote.missing_fields,
                violations=quote.violations,
                booking_summary=summary,
                candidates=candidates,
                selected_candidate_id=chosen.candidate_id,
                selected_quote=quote,
                policy_sources=quote_sources,
                approval_role=quote.approval_role,
                degraded=True,
                error_code=rec_outcome.error_code,
            )

        except CoreDependencyError as exc:
            record_step("core_dependency", "error", start_perf, exc.code)
            return build_response(
                workflow_status="DEPENDENCY_ERROR",
                quote_status=None,
                message_vi=exc.message,
                degraded=True,
                error_code=exc.code,
            )
        finally:
            if llm.usage_events:
                await self._usage_publisher(llm.usage_events)
