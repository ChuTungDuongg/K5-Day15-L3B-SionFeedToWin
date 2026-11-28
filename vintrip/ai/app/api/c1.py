"""API lập lịch Công viên Mẫu cho phụ huynh."""

import os
import sys
from pathlib import Path
from threading import Lock
from typing import Annotated

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, StringConstraints

from app.clients.park_plans import (
    CoreSnapshotMismatchError,
    build_validate_payload,
    validate_park_plan_on_core,
)
from app.services.park_plan_reply import (
    INVALID_STATUS,
    STATUS_LABELS,
    TODAY_NOTE,
    build_chat_reply,
    build_input_hint,
)

router = APIRouter()
# tracing của khung giữ một danh sách sự kiện chung cho mỗi tiến trình.
_trace_lock = Lock()
_codebase = next(
    (
        root / "codebase"
        for root in Path(__file__).resolve().parents
        if (root / "codebase" / "park_engine.py").is_file()
    ),
    None,
)
MAX_QUESTION_CHARS = 4000
Message = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


class Question(BaseModel):
    text: Message
    # Câu phụ huynh đã gửi trước đó trong cùng khung chat C1 (cũ → mới), để trả lời bổ sung.
    previous: list[Message] = Field(default_factory=list, max_length=10)


def merge_turns(question: Question) -> str:
    """Ghép câu mới nhất lên đầu: luồng C1 đọc giá trị khớp đầu tiên, câu sau ghi đè câu trước."""
    merged = " ".join([question.text, *reversed(question.previous)])
    return merged[:MAX_QUESTION_CHARS]


def _core_api_url() -> str:
    return os.environ.get("CORE_API_URL", "http://localhost:3000")


def _check_on_core(planned: dict) -> dict:
    """Kiểm lại một lịch trên core-api; core không trả lời thì ghi UNAVAILABLE, không đoán."""
    payload = build_validate_payload(planned["request"], planned["items"], planned["snapshot_id"])
    try:
        checked = validate_park_plan_on_core(_core_api_url(), payload)
    except CoreSnapshotMismatchError as error:
        return {
            "status": "SNAPSHOT_MISMATCH",
            "snapshotId": planned["snapshot_id"],
            "currentSnapshotId": error.current_snapshot_id,
        }
    except (httpx.HTTPError, ValueError):
        return {"status": "UNAVAILABLE", "snapshotId": planned["snapshot_id"]}
    return {
        "status": "VALID" if checked.valid else "INVALID",
        **checked.model_dump(by_alias=True),
        "localValid": bool(planned["check"]["valid"]),
    }


def _merge_core_checks(result: dict, checks: list[dict]) -> dict:
    """VALID chỉ giữ khi core-api không bác lịch mà validator cục bộ đã cho qua."""
    rejected = [
        check
        for check in checks
        if check["status"] in ("INVALID", "SNAPSHOT_MISMATCH") and check.get("localValid", True)
    ]
    if result.get("status") != "VALID" or not rejected:
        return result
    reasons = []
    for check in rejected:
        if check["status"] == "SNAPSHOT_MISMATCH":
            reasons.append("dữ liệu công viên trên core-api đã đổi snapshot")
        else:
            reasons.extend(check["violations"])
    output = (
        f"{result['output']}\n"
        f"Trạng thái sau kiểm của core-api: {INVALID_STATUS}. " + "; ".join(reasons) + "."
    )
    return {**result, "status": INVALID_STATUS, "output": output}


@router.post("/c1/ask")
def ask(question: Question):
    if _codebase is None:
        raise HTTPException(503, "Dịch vụ chưa được cài bộ lập lịch C1.")
    with _trace_lock:
        if str(_codebase) not in sys.path:
            sys.path.insert(0, str(_codebase))
        import agent
        import c1_flow
        import park_engine
        import tracing

        tracing.begin("c1-web")
        c1_flow.start_plan_capture()
        try:
            result = agent.answer(merge_turns(question), include_status=True)
            planned = c1_flow.captured_plans()
        finally:
            _, events = tracing.end()
    # Gọi core-api ngoài khoá: không giữ khoá trace trong lúc chờ mạng.
    core_checks = [_check_on_core(plan) for plan in planned]
    result = _merge_core_checks(result, core_checks)
    return {
        **result,
        "trace": [
            {key: event[key] for key in ("kind", "name", "latency_s")}
            for event in events
            if event["kind"] in ("tool", "model")
        ],
        "snapshot_id": park_engine.snapshot()["snapshotId"],
        "reply": build_chat_reply(result["output"], result["status"]),
        "status_label": STATUS_LABELS.get(result["status"], result["status"]),
        "input_hint": build_input_hint(result["output"])
        if result["status"] == "NEEDS_INPUT" or TODAY_NOTE in result["output"]
        else "",
        "plan": planned[-1]["items"] if planned else [],
        "core_validation": core_checks[-1] if core_checks else None,
    }
