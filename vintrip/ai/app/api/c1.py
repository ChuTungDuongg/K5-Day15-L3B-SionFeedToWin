"""API lập lịch Công viên Mẫu cho phụ huynh."""

import sys
from pathlib import Path
from threading import Lock
from typing import Annotated

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, StringConstraints

router = APIRouter()
# tracing của khung giữ một danh sách sự kiện chung cho mỗi tiến trình.
_trace_lock = Lock()
_codebase = next((root / "codebase" for root in Path(__file__).resolve().parents
                  if (root / "codebase" / "park_engine.py").is_file()), None)


class Question(BaseModel):
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=4000)]


@router.post("/c1/ask")
def ask(question: Question):
    if _codebase is None:
        raise HTTPException(503, "Dịch vụ chưa được cài bộ lập lịch C1.")
    with _trace_lock:
        if str(_codebase) not in sys.path:
            sys.path.insert(0, str(_codebase))
        import agent
        import park_engine
        import tracing

        tracing.begin("c1-web")
        try:
            result = agent.answer(question.text, include_status=True)
        finally:
            _, events = tracing.end()
    return {
        **result,
        "trace": [{key: event[key] for key in ("kind", "name", "latency_s")}
                  for event in events if event["kind"] in ("tool", "model")],
        "snapshot_id": park_engine.snapshot()["snapshotId"],
    }
