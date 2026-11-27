"""A deterministic sightseeing schedule using the Vintrip demo catalog."""

from datetime import UTC, datetime

from app.services.assistant.schemas import Answer, Card, CardLine
from app.services.assistant.skills.stay import vnd
from app.services.assistant.verifier import ScheduledStop, verify_schedule
from app.services.summary.vi_text import normalize_text

# Opening windows, travel buffers and activity costs are demo assumptions.
# Costs include the activity/meal and local travel, per person.
DANANG = (
    ScheduledStop(1, "Sáng", "08:30", "11:00", "Biển Mỹ Khê", "06:00", "18:00", 150_000),
    ScheduledStop(1, "Trưa", "11:45", "13:15", "Ăn trưa khu An Thượng", "11:00", "14:00", 150_000),
    ScheduledStop(1, "Chiều", "14:00", "16:00", "Công viên APEC", "06:00", "21:00", 50_000),
    ScheduledStop(2, "Sáng", "08:30", "11:00", "Ngũ Hành Sơn", "07:00", "17:00", 180_000),
    ScheduledStop(2, "Trưa", "11:45", "13:15", "Ăn trưa khu Non Nước", "11:00", "14:00", 150_000),
    ScheduledStop(2, "Chiều", "14:00", "16:00", "Dạo bờ sông Hàn", "06:00", "21:00", 70_000),
)


def verified_itinerary(place: str, days: int, budget: int | None) -> Answer:
    if not place:
        return Answer(kind="clarify", text="Bạn muốn Vini xếp lịch trình ở đâu?")
    if normalize_text(place) != "da nang" or not 1 <= days <= 2:
        return Answer(
            kind="no_result",
            text="Dữ liệu kiểm tra giờ mở cửa và chi phí hiện có cho Đà Nẵng trong 1–2 ngày.",
        )
    if budget is None:
        return Answer(
            kind="clarify",
            text="Ngân sách cho mỗi người (tham quan, ăn uống và đi lại nội thành) là bao nhiêu?",
        )

    stops = tuple(stop for stop in DANANG if stop.day <= days)
    total = verify_schedule(stops, days, budget)
    if total is None:
        return Answer(
            kind="clarify",
            text="Lịch trình mẫu vượt ngân sách. Bạn muốn giảm số ngày hay điều chỉnh ngân sách?",
        )

    lines = [
        CardLine(
            label=f"Ngày {stop.day} · {stop.part} ({stop.start}–{stop.end})",
            detail=f"{stop.name} · ~{vnd(stop.cost_vnd)}",
        )
        for stop in stops
    ]
    lines += [
        CardLine(
            label="Ngân sách",
            detail=f"~{vnd(total)} / {vnd(budget)} mỗi người. "
            "Tự ước tính theo dữ liệu demo, gồm tham quan, ăn uống và di chuyển nội thành.",
        ),
        CardLine(label="Thời tiết", detail="Chưa có dự báo cho lịch trình này."),
    ]
    return Answer(
        kind="answer",
        text=f"Vini xếp lịch trình Đà Nẵng {days} ngày, chi phí tự ước tính {vnd(total)} mỗi người. "
        "Các khung giờ đã được kiểm tra theo dữ liệu demo.",
        cards=[
            Card(
                ref="r1", id=f"verified-itinerary:da-nang:{days}", kind="verified_itinerary",
                title=f"Lịch trình Đà Nẵng {days} ngày · 0 xung đột",
                price_from=total, total_price=budget, price_basis="estimated_per_person",
                source="Vintrip Verifier · 0 xung đột · Đúng ngân sách",
                observed_at=datetime.now(UTC), lines=lines,
            )
        ],
    )
