"""Build a room-change or hotel support draft for manual review."""

import asyncio
import re
from datetime import UTC, datetime
from uuid import NAMESPACE_URL, uuid5

import httpx

from app.services.assistant.schemas import Answer, Card, CardLine
from app.services.assistant.skills.stay import vnd

PENDING = "CHỜ NGƯỜI DÙNG DUYỆT"
ROOM_CHANGE_PER_NIGHT_VND = 450_000


def _slot(message: str, marker: str) -> str:
    found = re.search(rf"(?:{marker})\s*[:=]\s*([^;\n]+)", message, re.I)
    return found[1].strip()[:120] if found else ""


async def booking_draft(core: httpx.AsyncClient, message: str) -> Answer:
    code = re.search(r"\bVT-[\w-]+\b", message, re.I)
    nights_match = re.search(r"\b(\d{1,2})\s*(?:đêm|dem|nights?)\b", message, re.I)
    current = _slot(message, r"phòng hiện tại|current[_ ]?room")
    target = _slot(message, r"phòng muốn đổi|phòng mới|target[_ ]?room")
    if not (current and target):
        rooms = re.search(
            r"\btừ\s+(?:phòng\s+)?([^,;\n]+?)\s+(?:sang|lên|→)\s+(?:phòng\s+)?"
            r"([^,;()\n]+?)(?=\s+\d+\s*(?:đêm|dem)|[,;()\n]|$)",
            message,
            re.I,
        )
        if rooms:
            current = current or rooms[1].strip()[:120]
            target = target or rooms[2].strip()[:120]
    note = _slot(message, r"ghi chú|guest[_ ]?note")
    nights = int(nights_match[1]) if nights_match else None
    booking_code = code[0].upper() if code else ""
    payload = {
        "bookingCode": booking_code, "currentRoom": current, "targetRoom": target,
        "nights": nights, "guestNote": note or None,
    }
    draft_id = f"DRAFT-{uuid5(NAMESPACE_URL, message)}"
    price = None
    if current and target and nights:
        price = 0 if current == target else nights * ROOM_CHANGE_PER_NIGHT_VND
    room_change = bool(current or target or re.search(r"đổi phòng|nâng hạng|doi phong", message, re.I))
    change = f"{current or '[phòng hiện tại]'} → {target or '[phòng muốn đổi]'}"
    if nights:
        change += f" ({nights} đêm)"
    if not room_change:
        change = "Yêu cầu hỗ trợ khách sạn"
    if room_change:
        subject = f"Tôi muốn đổi phòng cho đơn {booking_code or '[mã đặt phòng]'}: {change}."
    else:
        subject = f"Tôi cần hỗ trợ cho đơn {booking_code or '[mã đặt phòng]'}. Nội dung: {note or message}"
    draft = f"Kính gửi Bộ phận Đặt phòng,\n{subject}"
    if room_change and note:
        draft += f"\nGhi chú của khách: {note}."
    draft += "\nVui lòng xác nhận tình trạng phòng và báo giá chính thức nếu có."
    if booking_code and current and target and nights:
        try:
            async with asyncio.timeout(1.5):
                response = await core.post("/api/commerce/bookings/draft-change", json=payload)
                response.raise_for_status()
                result = response.json()
                if (
                    isinstance(result, dict)
                    and result.get("bookingCode") == booking_code
                    and result.get("actionType") == "ROOM_CHANGE_DRAFT"
                    and result.get("status") == "PENDING_USER_APPROVAL"
                    and result.get("requiresConfirmation") is True
                    and type(result.get("priceDiffVnd")) is int and result["priceDiffVnd"] >= 0
                    and isinstance(result.get("draftId"), str) and result["draftId"]
                    and isinstance(result.get("draftMessageVi"), str) and result["draftMessageVi"]
                ):
                    price = result["priceDiffVnd"]
                    draft_id, draft = result["draftId"], result["draftMessageVi"]
        except (TimeoutError, httpx.HTTPError, ValueError):
            pass

    lines = [
        CardLine(label="Trạng thái", detail=PENDING),
        CardLine(label="Thay đổi phòng", detail=change),
        CardLine(label="Chênh lệch ước tính",
                 detail=f"+{vnd(price)}" if price else "0đ" if price == 0 else "Chờ báo giá"),
        CardLine(label="Nội dung bản nháp", detail=draft),
        CardLine(label="Lưu ý an toàn", detail="Vui lòng kiểm tra và tự xác nhận trước khi gửi."),
    ]
    subject = "đổi phòng" if room_change else "hỗ trợ khách sạn"
    return Answer(kind="answer", text=f"Vini đã soạn bản nháp {subject}. {PENDING}.", cards=[
        Card(
            ref="r1", id=draft_id, kind="approval_draft", title=f"Bản nháp {subject} · {PENDING}",
            price_from=price, price_basis="per_night_per_room", observed_at=datetime.now(UTC),
            source=f"{PENDING} · Không tự động gửi", lines=lines,
        )
    ])
