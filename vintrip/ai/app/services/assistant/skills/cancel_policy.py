"""Evaluate hotel cancellation in the property's time zone."""

import asyncio
import re
from datetime import UTC, date, datetime, time, timedelta, timezone, tzinfo
from decimal import Decimal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from app.services.assistant.schemas import Answer, Card, CardLine, Cancellation
from app.services.assistant.skills.stay import vnd
from app.services.assistant.verifier import verified_policy_result
from app.services.summary.vi_text import normalize_text

POLICIES = {
    "FLEX-48H": (48, 100, "Hoàn 100% nếu hủy trước hoặc đúng 48 giờ so với giờ nhận phòng."),
    "MOD-72H": (72, 100, "Hoàn 100% nếu hủy trước hoặc đúng 72 giờ so với giờ nhận phòng."),
    "STRICT-NO-REFUND": (0, 0, "Đặt phòng áp dụng điều khoản không hoàn tiền."),
    "PARTIAL-50-24H": (24, 50, "Hoàn 50% nếu hủy trước hoặc đúng 24 giờ so với giờ nhận phòng."),
}
LABELS = {
    "checkInIso": "ngày nhận phòng",
    "cancelAtIso": "thời điểm hủy dự kiến (ngày và giờ)",
    "timezone": "múi giờ khách sạn",
    "policyCode": "mã chính sách hủy",
    "totalVnd": "tổng tiền đặt phòng",
    "nights": "số đêm đặt phòng",
}
STATUS = {
    "free": "Miễn phí hủy",
    "partial": "Phí một phần",
    "non_refundable": "Không hoàn tiền",
    "need_info": "Cần bổ sung thông tin",
}
POLICY_CODE = re.compile("|".join(POLICIES), re.I)
ZONE = re.compile(r"\b(?:[A-Za-z]+/[A-Za-z_+-]+(?:/[A-Za-z_+-]+)?|UTC(?:[+-]\d{1,2}(?::?\d{2})?)?)\b")
CLOCK = r"\d{1,2}(?::\d{2}(?::\d{2})?|h(?:\d{2})?)"
DATE = r"(?:\d{4}-\d{2}-\d{2}|\d{1,2}/\d{1,2}(?:/\d{2,4})?)"
OFFSET = r"(?:Z|[+-]\d{2}:?\d{2})"
STAMP = re.compile(
    rf"(?<!\d)(?:(?P<before>{CLOCK})(?:\s+ngày)?\s+)?(?P<date>{DATE})"
    rf"(?:(?:T|\s+(?:lúc\s+)?)(?P<after>{CLOCK}))?(?P<offset>\s*{OFFSET})?(?!\d)",
    re.I,
)
FIELD = re.compile(
    r"check[\s_-]?in(?:iso)?|nhận\s+phòng|cancel[\s_-]?at(?:iso)?|h[uủ]y(?:\s+dự\s+kiến)?",
    re.I,
)
MONEY = re.compile(
    r"(?<![\d.,])(\d{1,15}(?:[.,]\d+)*(?:\s+(?!0\d)\d{3}(?!\d))*)\s*"
    r"(triệu|million|nghìn|ngàn|k|vnd|đồng|đ|₫)(?!\w)",
    re.I,
)


def parse_vnd(text: str) -> int | None:
    match = MONEY.search(text)
    if not match:
        return None
    number, unit = match.groups()
    multiplier = {"trieu": 1_000_000, "million": 1_000_000, "nghin": 1000, "ngan": 1000, "k": 1000}
    scale = multiplier.get(normalize_text(unit), 1)
    if scale > 1 and re.fullmatch(r"\d+[.,]\d{1,2}", number):
        value = int(Decimal(number.replace(",", ".")) * scale)
    else:
        value = int(re.sub(r"[.,\s]", "", number)) * scale
    return value if value <= 10**12 else None


def cancellation_request(
    message: str, today: date | None = None, *, previous: Cancellation | None = None
) -> Cancellation:
    year = (today or datetime.now(UTC)).year
    code = POLICY_CODE.search(message)
    zone = ZONE.search(message)
    nights = re.search(r"\b(\d{1,2})\s*(?:đêm|dem|nights?)\b", message, re.I)
    hotel = re.search(r"\bhotel[_ ]?slug\s*[:=]\s*([\w-]+)", message, re.I)
    explicit_total = re.search(r"\btotal[_ ]?vnd\s*[:=]\s*(\d{1,12})(?!\d)", message, re.I)
    total = int(explicit_total[1]) if explicit_total else parse_vnd(message)
    result = Cancellation(
        policy_code=code[0].upper() if code else None,
        timezone=zone[0] if zone else None,
        total_vnd=total,
        nights=int(nights[1]) if nights and 1 <= int(nights[1]) <= 30 else None,
        hotel_slug=hotel[1][:100] if hotel else None,
    )
    end = 0
    for stamp in STAMP.finditer(message):
        labels = list(FIELD.finditer(message[end:stamp.start()]))
        field = normalize_text(labels[-1][0]) if labels else ""
        end = stamp.end()
        clock = stamp["after"] or stamp["before"]
        try:
            if "/" in stamp["date"]:
                day, month, *years = map(int, stamp["date"].split("/"))
                yyyy = years[0] if years else year
                when = datetime(yyyy + 2000 if yyyy < 100 else yyyy, month, day)
            else:
                when = datetime.fromisoformat(stamp["date"])
            if clock:
                parts = re.split(r"[:h]", clock.lower().rstrip("h"))
                when = when.replace(hour=int(parts[0]), minute=int(parts[1]) if len(parts) > 1 else 0,
                                    second=int(parts[2]) if len(parts) > 2 else 0)
            if stamp["offset"]:
                when = datetime.fromisoformat(when.isoformat() + stamp["offset"].strip().upper())
        except ValueError:
            continue
        if field.startswith(("nhan", "check")) or (
            not field and result.check_in is None and not (previous and previous.check_in)
        ):
            result.check_in = when
        elif clock and (not field or field.startswith(("huy", "cancel"))):
            result.cancel_at = when
    return result


def property_zone(name: str) -> tzinfo:
    offset = re.fullmatch(r"UTC([+-])(\d{1,2})(?::?(\d{2}))?", name)
    if offset:
        hours, minutes = int(offset[2]), int(offset[3] or 0)
        if hours > 23 or minutes > 59:
            raise ValueError("invalid UTC offset")
        return timezone(timedelta(minutes=(hours * 60 + minutes) * (-1 if offset[1] == "-" else 1)))
    return ZoneInfo(name)


def evaluate_policy(data: Cancellation) -> tuple[dict, dict]:
    zone_name = data.timezone or "Asia/Ho_Chi_Minh"
    missing = []
    try:
        zone = property_zone(zone_name)
    except (ZoneInfoNotFoundError, ValueError):
        zone = UTC
        missing.append("timezone")
    cancel_at = data.cancel_at
    check_in = datetime.combine(data.check_in.date(), time(14), zone) if data.check_in else None
    if data.check_in and data.check_in.tzinfo is not None:
        check_in = data.check_in.astimezone(zone)
    if cancel_at and cancel_at.tzinfo is None:
        candidate = cancel_at.replace(tzinfo=zone)
        if candidate.astimezone(UTC).astimezone(zone).replace(tzinfo=None) == cancel_at:
            cancel_at = candidate
        else:
            cancel_at = None  # A wall time skipped by a daylight-saving transition.
    if data.check_in is None:
        missing.append("checkInIso")
    if cancel_at is None:
        missing.append("cancelAtIso")
    if data.policy_code not in POLICIES:
        missing.append("policyCode")
    if data.total_vnd is None and not missing:
        missing.append("totalVnd")

    payload = {
        "policyCode": data.policy_code,
        "hotelSlug": data.hotel_slug,
        "checkInIso": check_in.isoformat() if check_in else None,
        "cancelAtIso": cancel_at.isoformat() if cancel_at else None,
        "timezone": zone_name,
        "totalVnd": data.total_vnd,
        "nights": data.nights,
    }
    code = data.policy_code or ""
    hours, percent, clause = POLICIES.get(code, (0, 0, "Cần mã chính sách để tra điều khoản."))
    result = {
        "policyCode": code, "status": "need_info", "hoursBeforeCheckIn": None,
        "cutoffLocal": None, "feeVnd": None, "refundVnd": None, "refundPercent": None,
        "citations": [{"code": "C1", "clause": clause}], "missingFields": missing,
    }
    if not missing and check_in and cancel_at and data.total_vnd is not None:
        delta = check_in.astimezone(UTC) - cancel_at.astimezone(UTC)
        cutoff = (check_in.astimezone(UTC) - timedelta(hours=hours)).astimezone(zone)
        percent = percent if delta >= timedelta(hours=hours) else 0
        status = {0: "non_refundable", 50: "partial", 100: "free"}[percent]
        refund = data.total_vnd * percent // 100
        if code in {"FLEX-48H", "MOD-72H"} and timedelta(0) < delta < timedelta(hours=hours):
            if data.nights is None:
                missing.append("nights")
                return payload, result
            if data.nights > 1:
                fee = (2 * data.total_vnd + data.nights) // (2 * data.nights)
                refund = data.total_vnd - fee
                percent = round(100 * refund / data.total_vnd, 2) if data.total_vnd else 0
                status = "partial"
        result.update(
            status=status,
            hoursBeforeCheckIn=delta.total_seconds() / 3600,
            cutoffLocal=cutoff.isoformat() if hours else None,
            feeVnd=data.total_vnd - refund,
            refundVnd=refund,
            refundPercent=percent,
        )
    return payload, result


async def cancel_policy(core: httpx.AsyncClient, data: Cancellation) -> Answer:
    payload, result = evaluate_policy(data)
    try:
        async with asyncio.timeout(1.5):
            response = await core.post("/api/commerce/policies/evaluate", json=payload)
            response.raise_for_status()
            candidate = response.json()
            if verified_policy_result(candidate, result):
                result["citations"] = candidate["citations"]
    except (TimeoutError, httpx.HTTPError, ValueError):
        pass
    status = result["status"]
    missing = result["missingFields"]
    code = result["policyCode"]
    fee, refund = result["feeVnd"], result["refundVnd"]
    cutoff = result["cutoffLocal"]
    if cutoff:
        stamp = datetime.fromisoformat(cutoff)
        offset = stamp.strftime("%z")
        local = f"{stamp:%H:%M %d/%m/%Y} ({offset[:3]}:{offset[3:]})"
    else:
        local = "Chưa xác định" if missing else "Không áp dụng"
    clause = next(c["clause"] for c in result["citations"] if c["code"] == "C1")
    if code in {"FLEX-48H", "MOD-72H"}:
        clause += " Sau hạn miễn phí và trước giờ nhận phòng, phí hủy bằng giá bình quân một đêm."
    lines = [
        CardLine(label="Trạng thái", detail=STATUS[status]),
        CardLine(label="Phí hủy", detail=vnd(fee) if fee is not None else "Chưa xác định"),
        CardLine(label="Hoàn lại dự kiến", detail=vnd(refund) if refund is not None else "Chưa xác định"),
        CardLine(label="Mốc giờ địa phương (cutoff)", detail=local),
        CardLine(label="[C1] Điều khoản trích dẫn", detail=clause),
    ]
    if missing:
        fields = ", ".join(LABELS[key] for key in missing)
        lines.append(CardLine(label="Thông tin cần bổ sung", detail=fields[0].upper() + fields[1:]))
        text = f"Bạn cho Vini biết {fields} nhé?"
    else:
        text = (
            f"{STATUS[status]}, phí hủy {vnd(fee)}, hoàn {result['refundPercent']}% "
            f"({vnd(refund)}). Mốc giờ địa phương: {local}. [C1]"
        )
    return Answer(kind="clarify" if missing else "answer", text=text, cards=[
        Card(
            ref="r1", id=f"cancel-policy:{code}", kind="cancel_policy",
            title=f"Chính sách hủy · {code or 'Vintrip'} ({STATUS[status]})",
            price_from=fee, total_price=refund,
            price_basis="unavailable" if missing else "per_night_per_room",
            observed_at=datetime.now(UTC), source="Vintrip Policy Engine · [C1]", lines=lines,
        )
    ])
