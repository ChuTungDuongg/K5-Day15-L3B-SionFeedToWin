"""Read-only flight disruption demo, shared by SSE and the stdlib hackathon bridge.

This module has no service dependencies. Client memory contains request fields only;
fares, eligibility and inventory are always read again from the versioned snapshot.
"""

import hashlib
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REQUEST_FIELDS = {"bookingCode", "action", "targetFlightId", "arrivalBefore"}
PENDING = "CHỜ NGƯỜI DÙNG DUYỆT"
NOTICE = "MÔ PHỎNG · Chưa giữ chỗ, đổi vé, hoàn tiền hoặc gửi yêu cầu cho hãng."


def fold(text: str) -> str:
    value = unicodedata.normalize("NFD", text.lower().replace("đ", "d"))
    return "".join(c for c in value if not unicodedata.combining(c))


def is_disruption(message: str) -> bool:
    text = fold(message)
    return bool(
        re.search(r"(?<![\w\[-])c3\b(?!\])", text)
        or re.search(
            r"\b(?:demo-c3-\d+|doi ve|hoan ve|hoan tien ve|giu cho.*(?:chuyen|bay)|"
            r"(?:chuyen bay|ve may bay|flight).*(?:huy|cancel)|"
            r"(?:huy|cancel).*(?:chuyen bay|ve may bay|flight))\b",
            text,
        )
    )


def is_followup(message: str) -> bool:
    text = fold(message)
    if re.search(r"\b(?:phong|khach san|hotel|flex|resort)\b", text):
        return False
    return bool(
        re.search(
            r"\b(?:doi ve|hoan tien|hoan ve|giu cho|xem phuong an|demo-vt\d+|"
            r"den truoc|arrivalbefore|da duyet|xac nhan|"
            r"(?:bo|khong) gioi han gio den|pnr|ma dat (?:cho|ve))\b",
            text,
        )
        or re.fullmatch(r"\d{4}-\d{2}-\d{2}t\S+", text.strip())
    )


def parse_request(message: str, previous: dict[str, Any] | None = None) -> dict[str, Any]:
    result: dict[str, Any] = {
        k: v for k, v in (previous or {}).items() if k in REQUEST_FIELDS and v is not None
    }
    text = fold(message)
    bookings = set(re.findall(r"\bdemo-c3-\d{3}\b", text))
    bookings.update(
        re.findall(
            r"\b(?:pnr|booking|ma dat (?:cho|ve))\s*[:=]?\s*([a-z0-9-]{5,32})\b",
            text,
        )
    )
    if len(bookings) > 1:
        result = {"bookingCode": None}
    elif bookings:
        booking = next(iter(bookings)).upper()
        if booking != result.get("bookingCode"):
            result = {}
        result["bookingCode"] = booking
    actions: set[str] = set()
    negated = False
    for name, pattern in (
        ("hold", r"\bgiu cho\b"),
        ("change", r"\b(?:doi ve|doi chuyen|chuyen sang)\b"),
        ("refund", r"\b(?:hoan tien|hoan ve)\b"),
    ):
        for match in re.finditer(pattern, text):
            if re.search(
                r"\b(?:khong(?: muon| can| duoc)?|dung|chua(?: muon| can)?)\s*$",
                text[: match.start()],
            ):
                negated = True
            else:
                actions.add(name)
    if actions:
        result["action"] = next(iter(actions)) if len(actions) == 1 else "choose"
    elif negated:
        result["action"] = "review"
        result.pop("targetFlightId", None)
    elif re.search(r"\b(?:xem phuong an|tim phuong an|so sanh)\b", text):
        result["action"] = "review"
    flights = set(re.findall(r"\bdemo-vt\d+\b", text))
    if len(flights) > 1:
        result.pop("targetFlightId", None)
    elif flights:
        result["targetFlightId"] = next(iter(flights)).upper()
    deadline = re.search(r"(?:den truoc|arrivalbefore)\s*[:=]?\s*([^\s,;]+)", text)
    if deadline:
        result["arrivalBefore"] = deadline[1]
    elif result.get("arrivalBefore") and re.fullmatch(r"\d{4}-\d{2}-\d{2}t\S+", text.strip()):
        result["arrivalBefore"] = text.strip()
    elif re.search(r"\b(?:khong|bo) gioi han gio den\b", text):
        result.pop("arrivalBefore", None)
    result.setdefault("action", "review")
    return result


def load_snapshot() -> dict[str, Any]:
    return json.loads(Path(__file__).with_name("c3_snapshot.json").read_text(encoding="utf-8"))


def timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("z", "+00:00").replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("timestamp needs UTC offset")
    return parsed


def evaluate(
    request: dict[str, Any],
    *,
    snapshot: dict[str, Any] | None = None,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Return options or a deterministic draft. Never mutate inventory or call a supplier."""
    snapshot = load_snapshot() if snapshot is None else snapshot
    now = now or datetime.now(timezone.utc)  # noqa: UP017 -- stdlib bridge supports Python 3.10
    result: dict[str, Any] = {
        "status": "NEEDS_INPUT",
        "isMock": True,
        "snapshotId": snapshot["snapshotId"],
        "observedAt": snapshot["observedAt"],
        "options": [],
        "rejectedOptions": [],
        "missingFields": [],
        "requiresConfirmation": True,
        "notice": NOTICE,
    }
    code = request.get("bookingCode")
    if not code:
        result.update(
            missingFields=["bookingCode"], summaryVi="Cần một mã đặt chỗ mẫu (ví dụ DEMO-C3-001)."
        )
        return result
    booking = next((b for b in snapshot["bookings"] if b["bookingCode"] == code), None)
    if booking is None:
        result.update(
            status="MISSING_DATA", summaryVi="Không có mã đặt chỗ này trong snapshot mô phỏng."
        )
        return result
    result["booking"] = dict(booking)
    if booking["status"] != "cancelled":
        result.update(
            status="NOT_ELIGIBLE", summaryVi="Dữ liệu mẫu chưa ghi nhận chuyến bay bị huỷ."
        )
        return result
    action = request.get("action", "review")
    if action not in {"review", "hold", "change", "refund"}:
        result.update(
            missingFields=["action"],
            summaryVi="Bạn muốn xem phương án, giữ chỗ, đổi vé hay hoàn tiền?",
        )
        return result
    deadline = None
    if action != "refund" and request.get("arrivalBefore"):
        try:
            deadline = timestamp(request["arrivalBefore"])
        except (ValueError, TypeError, AttributeError):
            result.update(
                missingFields=["arrivalBefore"],
                summaryVi=(
                    "Cần giờ đến tối đa dạng ISO có múi giờ, ví dụ 2026-12-10T15:00:00+07:00."
                ),
            )
            return result
    policy = snapshot["policy"]
    result.update(policy=dict(policy), refundVnd=booking["unusedFareVnd"], feeVnd=0)
    # Refund needs no inventory quote; no promise of a real payment is made.
    if action != "refund":
        if now >= timestamp(snapshot["quoteExpiresAt"]):
            result.update(
                status="STALE_DATA",
                summaryVi=(
                    "Báo giá mô phỏng đã hết hạn; cần snapshot mới "
                    "trước khi đề nghị giữ chỗ hoặc đổi vé."
                ),
            )
            return result
        for flight in snapshot["flights"]:
            reasons = []
            departure, arrival = timestamp(flight["departure"]), timestamp(flight["arrival"])
            if (flight["fromAirport"], flight["toAirport"]) != (
                booking["fromAirport"],
                booking["toAirport"],
            ):
                reasons.append("Khác hành trình")
            if flight["status"] != "scheduled":
                reasons.append("Chuyến không khai thác")
            if flight["seats"] < booking["passengers"]:
                reasons.append("Không đủ chỗ cho cả nhóm")
            if (
                departure <= now
                or departure < timestamp(booking["departure"])
                or arrival <= departure
            ):
                reasons.append("Giờ bay không hợp lệ")
            if deadline and arrival > deadline:
                reasons.append("Đến sau giờ yêu cầu")
            if reasons:
                result["rejectedOptions"].append({"id": flight["id"], "reasons": reasons})
                continue
            total = flight["farePerPersonVnd"] * booking["passengers"]
            result["options"].append(
                {
                    **flight,
                    "totalVnd": total,
                    "additionalVnd": max(0, total - booking["unusedFareVnd"]),
                    "residualVnd": max(0, booking["unusedFareVnd"] - total),
                }
            )
        result["options"].sort(key=lambda f: (timestamp(f["arrival"]), f["totalVnd"], f["id"]))
    if action == "review":
        result.update(
            status="OPTIONS_READY" if result["options"] else "NO_OPTIONS",
            summaryVi=(
                "Các phương án mô phỏng; hãy chọn giữ chỗ, đổi vé hoặc hoàn tiền để soạn bản nháp."
            ),
        )
        return result
    target = None
    if action in {"hold", "change"}:
        target_id = request.get("targetFlightId")
        target = next((f for f in result["options"] if f["id"] == target_id), None)
        if target is None:
            result.update(
                status="OPTION_UNAVAILABLE" if target_id else "NEEDS_INPUT",
                missingFields=["targetFlightId"],
                summaryVi=(
                    "Cần chọn mã chuyến thay thế đáp ứng điều kiện trong snapshot; "
                    "chưa tạo bản nháp."
                ),
            )
            return result
    identity = {"bookingCode": code, "snapshotId": snapshot["snapshotId"], "action": action}
    if target:
        identity.update(targetFlightId=target["id"], arrivalBefore=request.get("arrivalBefore"))
    digest = hashlib.sha256(json.dumps(identity, sort_keys=True).encode()).hexdigest()[:24]
    subject = {
        "hold": f"Đề nghị giữ chỗ {policy['holdMinutes']} phút",
        "change": "Đề nghị đổi vé",
        "refund": "Đề nghị hoàn tiền vé chưa sử dụng",
    }[action]
    detail = f" sang {target['id']} cho {booking['passengers']} khách" if target else ""
    amounts = (
        f"\nGiờ bay dự kiến: {target['departure']} → {target['arrival']}. "
        f"Tổng giá mẫu {vnd(target['totalVnd'])}; bù thêm {vnd(target['additionalVnd'])}; "
        f"giá vé dư {vnd(target['residualVnd'])}, chờ hãng xác nhận cách xử lý."
        if target
        else f"\nSố tiền đề nghị hoàn theo quy tắc mẫu: {vnd(booking['unusedFareVnd'])}."
    )
    draft = {
        "draftId": f"C3-DRAFT-{digest}",
        "actionType": f"FLIGHT_{action.upper()}_DRAFT",
        "status": "PENDING_USER_APPROVAL",
        "bookingCode": code,
        "targetFlightId": target["id"] if target else None,
        "additionalVnd": target["additionalVnd"] if target else None,
        "residualVnd": target["residualVnd"] if target else None,
        "refundVnd": booking["unusedFareVnd"] if action == "refund" else None,
        "draftMessageVi": (
            f"Kính gửi Bộ phận Hỗ trợ (bản nháp mô phỏng),\n{subject} cho mã {code}{detail}. "
            f"Chuyến cũ {booking['flightId']} bị huỷ.{amounts}\n"
            "Vui lòng kiểm tra lại tồn chỗ, điều kiện, "
            f"giá và xác nhận trước khi xử lý.\n{NOTICE}"
        ),
    }
    result.update(status="PENDING_USER_APPROVAL", draft=draft, summaryVi=f"{subject} · {PENDING}.")
    return result


def vnd(amount: int) -> str:
    return f"{amount:,}".replace(",", ".") + "đ"


def result_lines(result: dict[str, Any]) -> list[tuple[str, str]]:
    """Identical grounded facts for CLI text and SSE CardLine rendering."""
    lines = [("Trạng thái", result["status"]), ("Kết quả", result["summaryVi"])]
    booking = result.get("booking")
    if booking:
        lines.append(
            (
                "Đặt chỗ mẫu",
                (
                    f"{booking['bookingCode']} · "
                    f"{booking['fromAirport']} → {booking['toAirport']} · "
                    f"{booking['passengers']} khách"
                ),
            )
        )
    for option in result["options"]:
        lines.append(
            (
                option["id"],
                (
                    f"{option['departure']} → {option['arrival']} · "
                    f"Tổng {vnd(option['totalVnd'])} · Bù thêm {vnd(option['additionalVnd'])} · "
                    f"Dư giá vé {vnd(option['residualVnd'])} "
                    "(chờ hãng xác nhận cách xử lý)"
                ),
            )
        )
    for rejected in result["rejectedOptions"]:
        lines.append((f"Loại {rejected['id']}", "; ".join(rejected["reasons"])))
    if "policy" in result:
        lines.extend(
            [
                ("Hoàn dự kiến (mô phỏng)", vnd(result["refundVnd"])),
                ("[C3] Quy tắc mẫu", result["policy"]["clause"]),
            ]
        )
    if "draft" in result:
        lines.extend(
            [
                ("Mã bản nháp", result["draft"]["draftId"]),
                ("Nội dung bản nháp", result["draft"]["draftMessageVi"]),
            ]
        )
    lines.extend(
        [
            ("Snapshot", f"{result['snapshotId']} · isMock=true · {result['observedAt']}"),
            ("Lưu ý an toàn", result["notice"]),
        ]
    )
    return lines
