"""core-api C1 (park-plans): independent server-side check of a park day plan.

POST {CORE_API_URL}/api/commerce/park-plans/validate — public, read-only computation on core's
snapshot of Công viên Mẫu (isMock). Core recomputes times, eligibility and money; vintrip-ai
never trusts its own planner numbers as final when core is reachable (RULES §10: business data
lives in core).
"""

import httpx
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

TIMEOUT_SECONDS = 5.0
PARK_ID = "cong-vien-mau"


class _CoreModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="ignore")


class BreakdownLine(_CoreModel):
    label: str
    amount_vnd: int


class ParkPlanValidationResponse(_CoreModel):
    valid: bool
    violations: list[str]
    warnings: list[str] = Field(default_factory=list)
    total_vnd: int
    breakdown: list[BreakdownLine]
    snapshot_id: str
    is_mock: bool
    validated_by: str


class CoreSnapshotMismatchError(Exception):
    """Core holds a different snapshot than the planner used: the plan cannot be confirmed."""

    def __init__(self, current_snapshot_id: str | None) -> None:
        super().__init__("snapshot mismatch")
        self.current_snapshot_id = current_snapshot_id


def build_validate_payload(request: dict, items: list[dict], snapshot_id: str) -> dict:
    """Map the planner's snake_case request (codebase/c1_flow) to core's camelCase contract."""
    lunch = request.get("lunch")
    show = request.get("show")
    return {
        "parkId": PARK_ID,
        "snapshotId": snapshot_id,
        "request": {
            "members": [
                {
                    "kind": member["kind"],
                    "label": member["label"][:60],
                    "age": member.get("age"),
                    "heightCm": member.get("height_cm"),
                }
                for member in request["members"]
            ],
            "window": list(request["window"]),
            "budgetVnd": int(request["budget_vnd"]),
            "includeGate": bool(request.get("include_gate", True)),
            "startZone": request.get("start_zone", "GATE"),
            "lunch": None
            if not lunch
            else {
                "minDurationMin": int(lunch["min_duration"]),
                "window": list(lunch["window"]),
                "beforeShow": bool(lunch.get("before_show")),
            },
            "show": None if not show else {"required": bool(show.get("required"))},
            "requiredActivities": list(request.get("required_activities", [])),
            "rain": [list(window) for window in request.get("rain", [])],
            "cancelledSessions": list(request.get("cancelled_sessions", [])),
        },
        "items": [
            {key: item[key] for key in ("kind", "id", "zone", "start", "end")} for item in items
        ],
    }


def validate_park_plan_on_core(core_api_url: str, payload: dict) -> ParkPlanValidationResponse:
    """Raises httpx.HTTPError when core is unreachable or rejects the body."""
    url = f"{core_api_url.rstrip('/')}/api/commerce/park-plans/validate"
    response = httpx.post(url, json=payload, timeout=TIMEOUT_SECONDS)
    if response.status_code == httpx.codes.CONFLICT:
        raise CoreSnapshotMismatchError(response.json().get("currentSnapshotId"))
    response.raise_for_status()
    return ParkPlanValidationResponse.model_validate(response.json())
