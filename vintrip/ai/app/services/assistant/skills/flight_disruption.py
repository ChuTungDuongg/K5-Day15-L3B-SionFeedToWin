"""Present the read-only C3 snapshot and pending drafts as SSE cards."""

from datetime import datetime
from typing import Any

from app.services.assistant.schemas import Answer, Card, CardLine
from app.services.assistant.skills.c3_engine import evaluate, result_lines


def flight_disruption(request: dict[str, Any]) -> Answer:
    result = evaluate(request)
    clarify = result["status"] in {"NEEDS_INPUT", "OPTION_UNAVAILABLE"}
    failed = result["status"] in {"MISSING_DATA", "NOT_ELIGIBLE", "STALE_DATA"}
    draft = result.get("draft")
    title = (
        "Bản nháp xử lý huỷ chuyến · CHỜ NGƯỜI DÙNG DUYỆT"
        if draft
        else "Chuyến bay bị huỷ · Phương án mô phỏng"
    )
    suggestions = ["C3 xem phương án DEMO-C3-001"]
    if result.get("booking") and result["status"] != "NOT_ELIGIBLE":
        if result["options"]:
            target = result["options"][0]["id"]
            suggestions = [f"Giữ chỗ {target}", f"Đổi vé {target}", "Hoàn tiền vé C3"]
        else:
            suggestions = ["Xem phương án C3", "Hoàn tiền vé C3"]
    return Answer(
        kind="clarify" if clarify else "no_result" if failed else "answer",
        text=f"{result['summaryVi']} {result['notice']}",
        cards=[
            Card(
                ref="r1",
                id=draft["draftId"] if draft else f"c3:{result['snapshotId']}",
                kind="flight_disruption",
                title=title,
                price_from=None,
                price_basis="unavailable",
                observed_at=datetime.fromisoformat(result["observedAt"]),
                source="Vintrip C3 · MÔ PHỎNG · Không tự động gửi",
                lines=[
                    CardLine(label=label, detail=detail) for label, detail in result_lines(result)
                ],
            )
        ],
        suggestions=suggestions,
    )
