"""Schemas for the Room Upgrades AI workflow (C2-CP2).

Wire request/response contracts use camelCase aliases and forbid unknown keys so forged authority
fields (role, amount, approved, status) are rejected at the API boundary. Internal LLM output
schemas stay snake_case and compatible with strict_json_schema().
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

StaffRole = Literal["RECEPTIONIST", "MANAGER"]
RequestType = Literal["UPGRADE", "ROOM_CHANGE", "COMPLIMENTARY_UPGRADE"]
QuoteStatus = Literal[
    "VALID",
    "NEEDS_INPUT",
    "MISSING_DATA",
    "INELIGIBLE",
    "UNAVAILABLE",
    "REQUIRES_MANAGER",
    "VALIDATION_FAILED",
]
WorkflowStatus = Literal[
    "COMPLETED",
    "NEEDS_INPUT",
    "OUT_OF_SCOPE",
    "BLOCKED_INJECTION",
    "DEGRADED",
    "AI_ERROR",
    "DEPENDENCY_ERROR",
]
ModelOutcomeStatus = Literal[
    "ok",
    "not_called",
    "disabled",
    "not_configured",
    "timeout",
    "invalid_output",
    "guardrail_rejected",
    "budget_exceeded",
    "deadline_exceeded",
    "breaker_open",
    "provider_error",
]
UsageStatus = Literal["reported", "partial", "usage_missing", "not_called"]


class WireModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class BackendModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class _StrictLlmModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


# ---------------------------------------------------------------------------
# API Request schemas (strict: rejects role, userId, amount, status, approved)
# ---------------------------------------------------------------------------


class RoomUpgradeClientContext(WireModel):
    """Non-authoritative structured hints for follow-up turns; always re-checked on backend."""

    booking_code: str | None = Field(default=None, min_length=1, max_length=100)
    room_number: str | None = Field(default=None, min_length=1, max_length=100)
    target_room_type_id: str | None = Field(default=None, min_length=1, max_length=100)
    target_room_hint: str | None = Field(default=None, min_length=1, max_length=120)
    effective_at: str | None = Field(default=None, min_length=1, max_length=64)
    request_type: RequestType | None = None
    required_features: list[str] = Field(default_factory=list, max_length=10)
    guest_preferences: list[str] = Field(default_factory=list, max_length=10)
    benefit_id: str | None = Field(default=None, min_length=1, max_length=100)


class RoomUpgradeChatRequest(WireModel):
    hotel_id: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=1000, pattern=r"\S")
    session_id: UUID | None = None
    selected_booking_code: str | None = Field(default=None, min_length=1, max_length=100)
    context: RoomUpgradeClientContext | None = None


# ---------------------------------------------------------------------------
# Structured LLM schemas (used with strict_json_schema)
# ---------------------------------------------------------------------------


class ExtractedIntent(_StrictLlmModel):
    intent_scope: Literal["room_upgrade", "out_of_scope", "prompt_injection"]
    booking_code: str | None = Field(default=None, max_length=100)
    room_number: str | None = Field(default=None, max_length=100)
    target_room_type_id: str | None = Field(default=None, max_length=100)
    target_room_hint: str | None = Field(default=None, max_length=120)
    effective_at_iso: str | None = Field(default=None, max_length=64)
    effective_date: str | None = Field(default=None, max_length=20)
    effective_time: str | None = Field(default=None, max_length=16)
    effective_time_ambiguous: bool = False
    effective_time_note: str | None = Field(default=None, max_length=120)
    request_type: RequestType | None = None
    required_features: list[str] = Field(default_factory=list, max_length=10)
    guest_preferences: list[str] = Field(default_factory=list, max_length=10)
    benefit_id: str | None = Field(default=None, max_length=100)
    missing_fields: list[str] = Field(default_factory=list, max_length=10)
    unauthorized_request: bool = False
    unauthorized_reason: str | None = Field(default=None, max_length=200)


class RecommendationLlmOutput(_StrictLlmModel):
    selected_candidate_id: str = Field(min_length=1, max_length=100)
    ranked_candidate_ids: list[str] = Field(min_length=1, max_length=10)
    reason_vi: str = Field(min_length=1, max_length=800)
    draft_message_vi: str = Field(min_length=1, max_length=1200)
    source_refs: list[str] = Field(min_length=1, max_length=20)


# ---------------------------------------------------------------------------
# Backend CP1 contract schemas (mirrors core-api commerce/room-upgrades)
# ---------------------------------------------------------------------------


class BackendHotel(BackendModel):
    id: str
    name: str
    timezone: str
    fixture_version: str
    is_mock: Literal[True]
    version: int


class BackendRoomType(BackendModel):
    id: str
    hotel_id: str
    name: str
    rank: int
    max_guests: int
    features: list[str]
    is_mock: Literal[True]
    version: int


class BackendBookingNight(BackendModel):
    date: str
    paid_vnd: int | None
    credit_eligible_vnd: int | None
    tax_included: Literal[True]
    source_ref: str


class BackendBooking(BackendModel):
    hotel_id: str
    booking_code: str
    room_number: str
    room_type_id: str
    status: Literal["IN_HOUSE", "CONFIRMED", "CHECKED_OUT"]
    check_in_at: str
    check_out_at: str
    guests: int
    nights: list[BackendBookingNight]
    is_mock: Literal[True]
    version: int


class BackendInventory(BackendModel):
    hotel_id: str
    room_type_id: str
    date: str
    total: int
    held: int
    sold: int
    out_of_service: int
    stop_sell: bool
    is_mock: Literal[True]
    version: int


class BackendRate(BackendModel):
    hotel_id: str
    room_type_id: str
    date: str
    price_vnd: int
    tax_included: bool
    source_ref: str
    is_mock: Literal[True]
    version: int


class BackendPolicySource(BackendModel):
    code: str
    clause: str


class BackendPolicyTransition(BackendModel):
    from_room: str = Field(alias="from")
    to_room: str = Field(alias="to")


class BackendPolicyRules(BackendModel):
    night_rule: Literal["FULL_LOCAL_NIGHT"]
    original_credit_bps: int
    change_fee_vnd: int
    fee_tax_included: bool
    tax_bps: int
    max_nights: int
    quote_ttl_minutes: int
    max_receptionist_diff_vnd: int
    allowed_transitions: list[BackendPolicyTransition]
    allowed_benefit_codes: list[str]


class BackendPolicy(BackendModel):
    hotel_id: str
    code: str
    valid_from: str
    valid_until: str
    rules: BackendPolicyRules
    sources: list[BackendPolicySource]
    is_mock: Literal[True]
    version: int


class BackendBenefit(BackendModel):
    id: str
    hotel_id: str
    booking_code: str
    code: str
    verified_at: str | None
    valid_from: str
    valid_until: str
    discount_bps: int
    room_type_ids: list[str]
    is_mock: Literal[True]
    version: int


class BackendBookingListResponse(BackendModel):
    case_id: Literal["C2"]
    is_mock: Literal[True]
    request_id: str
    snapshot_id: str
    fixture_version: str
    hotel: BackendHotel
    staff_role: StaffRole
    items: list[BackendBooking]


class BackendBookingContextResponse(BackendModel):
    case_id: Literal["C2"]
    is_mock: Literal[True]
    request_id: str
    snapshot_id: str
    fixture_version: str
    staff_role: StaffRole
    currency: Literal["VND"]
    hotel: BackendHotel
    booking: BackendBooking
    room_types: list[BackendRoomType]
    inventory: list[BackendInventory]
    rates: list[BackendRate]
    policies: list[BackendPolicy]
    benefits: list[BackendBenefit]


class BackendIssue(WireModel):
    code: str
    field: str
    message: str


class BackendQuoteSourceVersions(WireModel):
    booking: int
    inventory: int
    rate: int
    policy: int
    benefit: int | None = None


class BackendQuoteNight(WireModel):
    date: str
    available_units: int
    new_room_price_vnd: int
    original_paid_vnd: int
    eligible_original_credit_vnd: int
    additional_fees_vnd: int
    additional_tax_vnd: int
    eligible_discount_vnd: int
    price_diff_vnd: int
    rate_tax_included: bool
    source_refs: list[str]
    source_versions: BackendQuoteSourceVersions


class BackendQuoteTotals(WireModel):
    new_room_total_vnd: int
    eligible_original_credit_vnd: int
    additional_fees_vnd: int
    additional_tax_vnd: int
    eligible_discount_vnd: int
    price_diff_vnd: int


class BackendInventoryNight(WireModel):
    date: str
    available_units: int | None
    stop_sell: bool | None
    version: int | None


class BackendQuotePolicy(WireModel):
    code: str
    version: int
    sources: list[BackendPolicySource]


class BackendQuoteBenefit(WireModel):
    id: str
    code: str
    version: int
    discount_bps: int


class BackendQuoteValidation(WireModel):
    checked: bool
    passed: bool
    violations: list[BackendIssue]


class BackendQuoteResponse(BackendModel):
    case_id: Literal["C2"]
    request_id: str
    quote_id: str
    hotel_id: str
    booking_code: str | None
    target_room_type_id: str | None
    status: QuoteStatus
    currency: Literal["VND"]
    is_mock: Literal[True]
    snapshot_id: str
    fixture_version: str
    calculated_at: str
    expires_at: str | None
    effective_at: str | None
    timezone: str
    remaining_nights: int | None
    approval_role: StaffRole | None
    policy: BackendQuotePolicy | None
    benefit: BackendQuoteBenefit | None
    breakdown: list[BackendQuoteNight]
    totals: BackendQuoteTotals | None
    price_diff_vnd: int | None
    inventory_by_night: list[BackendInventoryNight]
    missing_fields: list[str]
    violations: list[BackendIssue]
    validation: BackendQuoteValidation
    requires_human_approval: Literal[True]
    operational_effects: Literal["NONE"]

    @model_validator(mode="after")
    def verify_non_priced_statuses_have_no_totals(self) -> "BackendQuoteResponse":
        if self.status in {
            "UNAVAILABLE",
            "MISSING_DATA",
            "NEEDS_INPUT",
            "INELIGIBLE",
            "VALIDATION_FAILED",
        } and (self.totals is not None or self.price_diff_vnd is not None):
            raise ValueError(f"Non-priced quote status {self.status} must not carry totals")
        return self


# ---------------------------------------------------------------------------
# API Response schemas (CP4 Staff Dashboard ready)
# ---------------------------------------------------------------------------


class RoomUpgradeSessionContext(WireModel):
    """Merged non-authoritative intent slots preserved for follow-up turns."""

    hotel_id: str
    booking_code: str | None = None
    room_number: str | None = None
    target_room_type_id: str | None = None
    target_room_hint: str | None = None
    effective_at: str | None = None
    request_type: RequestType = "UPGRADE"
    required_features: list[str] = Field(default_factory=list)
    guest_preferences: list[str] = Field(default_factory=list)
    benefit_id: str | None = None
    pending_missing_fields: list[str] = Field(default_factory=list)


class BookingSummaryOut(WireModel):
    hotel_id: str
    hotel_name: str
    timezone: str
    booking_code: str
    room_number: str
    current_room_type_id: str
    current_room_type_name: str | None = None
    status: Literal["IN_HOUSE", "CONFIRMED", "CHECKED_OUT"]
    check_in_at: str
    check_out_at: str
    guests: int
    version: int


class PolicySourceOut(WireModel):
    ref: str
    code: str
    policy_code: str
    policy_version: int
    clause: str


class CandidateQuoteOut(WireModel):
    candidate_id: str
    room_type_name: str
    rank: int
    max_guests: int
    features: list[str]
    quote_status: QuoteStatus
    price_diff_vnd: int | None
    remaining_nights: int | None
    totals: BackendQuoteTotals | None
    approval_role: StaffRole | None
    requires_human_approval: Literal[True] = True
    benefit: BackendQuoteBenefit | None = None
    missing_fields: list[str] = Field(default_factory=list)
    violations: list[BackendIssue] = Field(default_factory=list)
    quote: BackendQuoteResponse


class ModelCallTraceOut(WireModel):
    step: str
    provider: str
    model: str | None = None
    response_id: str | None = None
    status: str
    latency_ms: int = Field(ge=0)
    usage_status: UsageStatus
    input_tokens: int | None = Field(default=None, ge=0)
    cached_input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    reasoning_tokens: int | None = Field(default=None, ge=0)
    cost_usd: float | None = Field(default=None, ge=0)
    finish_reason: str | None = None
    error_code: str | None = None


class ModelStatusOut(WireModel):
    provider: str
    api: str = "responses"
    model: str | None = None
    reasoning_effort: str = "low"
    prompt_versions: list[str] = Field(default_factory=list)
    status: ModelOutcomeStatus
    degraded: bool = False
    call_count: int = Field(default=0, ge=0)
    repair_count: int = Field(default=0, ge=0)
    usage_status: UsageStatus = "not_called"
    input_tokens: int | None = Field(default=None, ge=0)
    cached_input_tokens: int | None = Field(default=None, ge=0)
    output_tokens: int | None = Field(default=None, ge=0)
    reasoning_tokens: int | None = Field(default=None, ge=0)
    cost_usd: float | None = Field(default=None, ge=0)
    response_ids: list[str] = Field(default_factory=list)
    guardrail_events: list[str] = Field(default_factory=list)


class StepTraceOut(WireModel):
    step: str
    outcome: str
    latency_ms: int = Field(ge=0)
    detail: str | None = None


class ToolTraceOut(WireModel):
    tool: str
    outcome: str
    latency_ms: int = Field(ge=0)
    detail: str | None = None


class WorkflowTraceOut(WireModel):
    request_id: UUID
    total_latency_ms: int = Field(ge=0)
    steps: list[StepTraceOut] = Field(default_factory=list)
    tools: list[ToolTraceOut] = Field(default_factory=list)
    model_calls: list[ModelCallTraceOut] = Field(default_factory=list)
    snapshot_id: str | None = None
    fixture_version: str | None = None
    policy_version: int | None = None
    error_code: str | None = None


class RoomUpgradeChatResponse(WireModel):
    request_id: UUID
    case_id: Literal["C2"] = "C2"
    session_id: UUID
    session_context: RoomUpgradeSessionContext
    workflow_status: WorkflowStatus
    quote_status: QuoteStatus | None = None
    message_vi: str
    recommendation_reason_vi: str | None = None
    draft_message_vi: str | None = None
    missing_fields: list[str] = Field(default_factory=list)
    violations: list[BackendIssue] = Field(default_factory=list)
    booking_summary: BookingSummaryOut | None = None
    candidates: list[CandidateQuoteOut] = Field(default_factory=list)
    selected_candidate_id: str | None = None
    selected_quote: BackendQuoteResponse | None = None
    policy_sources: list[PolicySourceOut] = Field(default_factory=list)
    requires_human_approval: Literal[True] = True
    approval_role: StaffRole | None = None
    staff_role: StaffRole | None = None
    snapshot_id: str | None = None
    fixture_version: str | None = None
    is_mock: Literal[True] = True
    operational_effects: Literal["NONE"] = "NONE"
    model: ModelStatusOut
    trace: WorkflowTraceOut


class StoredSession(WireModel):
    """Server-side session record bound strictly to one verified staff user and one hotel."""

    owner_user_id: str
    hotel_id: str
    context: RoomUpgradeSessionContext
    updated_at: AwareDatetime = Field(default_factory=lambda: datetime.now().astimezone())
