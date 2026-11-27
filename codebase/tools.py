
"""Công cụ chỉ đọc cho bản chạy thử Vintrip."""
from copy import deepcopy
from datetime import date, datetime, time, timedelta, timezone as datetime_timezone
from fractions import Fraction
from functools import lru_cache
import importlib.util
import json
from pathlib import Path
import re
import unicodedata
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from tracing import tool


DATA = Path(__file__).resolve().parents[1] / "data"
APPROVAL = "CHỜ NGƯỜI DÙNG DUYỆT"
UTC = datetime_timezone.utc
FIXED_OFFSETS = {
    "Asia/Ho_Chi_Minh": 7, "Asia/Tokyo": 9, "Asia/Singapore": 8,
    "Asia/Dubai": 4, "UTC": 0,
}


class _DefaultTimezone(str):
    """Distinguish an omitted timezone from an explicit hotel-zone override."""


DEFAULT_TIMEZONE = _DefaultTimezone("Asia/Ho_Chi_Minh")


@lru_cache
def flight_disruption_engine():
    """Load the shared stdlib engine without importing FastAPI or service packages."""
    path = (DATA.parent / "vintrip/ai/app/services/assistant/skills/c3_engine.py")
    spec = importlib.util.spec_from_file_location("vintrip_c3_engine", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@tool
def resolve_flight_disruption(text):
    """Tên: resolve_flight_disruption · đề xuất xử lý chuyến bay bị huỷ (C3).
    Input: yêu cầu chứa mã đặt chỗ mẫu, hành động và mã chuyến thay thế nếu cần.
    Output: phương án kiểm từ snapshot hoặc bản nháp PENDING_USER_APPROVAL.
    Tác động ra ngoài: không; không giữ chỗ, đổi vé, hoàn tiền hay gửi tin.
    """
    engine = flight_disruption_engine()
    return engine.evaluate(engine.parse_request(text))


@lru_cache
def _load(filename):
    return json.loads((DATA / filename).read_text(encoding="utf-8"))


def normalize(text):
    decomposed = unicodedata.normalize("NFD", text.casefold().replace("đ", "d"))
    folded = "".join(c for c in decomposed if not unicodedata.combining(c))
    return " ".join(re.findall(r"[a-z0-9]+", folded))


def contains_phrase(normalized, phrase):
    return f" {normalize(phrase)} " in f" {normalized} "


def _policies():
    return _load("policies_sample.json")


def room_names(text):
    """Find sample room names in mention order, returning canonical catalog names."""
    normalized = f" {normalize(text)} "
    mentions = []
    for room in _load("rooms_sample.json"):
        for identifier in (room["code"], room["name"]):
            token = f" {normalize(identifier)} "
            mentions.extend((match.start(), room["name"]) for match in
                            re.finditer(re.escape(token), normalized))
    return [name for _, name in sorted(mentions)]


def itinerary_cities(text):
    normalized = normalize(text)
    return [city for city in dict.fromkeys(row["city"] for row in _load("attractions_sample.json"))
            if contains_phrase(normalized, city)]


@tool
def lookup_cancel_policy(query: str) -> list[dict]:
    """Tên: Tra cứu chính sách hủy phòng mẫu.
    Input: Câu hỏi, mã chính sách hoặc mã trích dẫn.
    Output: Danh sách chính sách khớp, kèm điều khoản, múi giờ và các bậc phí.
    Tác động ra ngoài: Không, chỉ đọc dữ liệu mẫu cục bộ.
    """
    normalized = normalize(query)
    policies = _policies()
    matched = [row for row in policies if any(contains_phrase(normalized, term)
               for term in (row["code"], row["citation"], row["title"]))]
    has_explicit_code = (re.search(r"\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+\b", query)
                         or re.search(r"\b[a-z]+(?:-[a-z0-9]+)*-\d+[a-z]*\b|\[c\d+\]",
                                      query, re.I))
    if matched or has_explicit_code:
        return deepcopy(matched)
    aliases = {
        "FLEX-48H": ("linh hoạt", "flex"),
        "MOD-72H": ("tiêu chuẩn", "moderate"),
        "STRICT-NO-REFUND": ("không hoàn tiền", "non refundable", "strict"),
        "PARTIAL-50-24H": ("50% trong 24 giờ",),
        "RESORT-PEAK-7D": ("cao điểm",),
        "JAPAN-RYOKAN-72H": ("ryokan", "nhật bản", "tokyo"),
        "SG-BUSINESS-24H": ("singapore",),
        "UAE-CITY-48H": ("dubai",),
    }
    matched = [row for row in policies if any(contains_phrase(normalized, term)
               for term in aliases[row["code"]])]
    asks_catalog = any(contains_phrase(normalized, term) for term in
                       ("chính sách hủy", "điều khoản hủy", "cancellation policies",
                        "so sánh chính sách", "tổng hợp chính sách"))
    if not matched and asks_catalog:
        matched = policies
    return deepcopy(matched)


def _zone(name):
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        if name not in FIXED_OFFSETS:
            raise
        return datetime_timezone(timedelta(hours=FIXED_OFFSETS[name]), name)


def _local_datetime(value, zone, check_in_hour=None):
    value = value.strip()
    if len(value) == 10 and check_in_hour is not None:
        parsed = datetime.combine(date.fromisoformat(value), time(check_in_hour))
    elif re.fullmatch(r"\d{4}-\d{2}-\d{2}[Tt ]\d{2}:\d{2}.*", value):
        parsed = datetime.fromisoformat(value)
    else:
        raise ValueError("Cần thời điểm ISO, gồm giờ và phút nếu hủy.")
    if parsed.tzinfo is not None:
        return parsed.astimezone(zone)
    local = parsed.replace(tzinfo=zone)
    if local.utcoffset() != local.replace(fold=1).utcoffset():
        raise ValueError("Giờ địa phương không duy nhất hoặc không tồn tại.")
    return local


@tool
def calculate_cancel_fee(policy_code: str, check_in_iso: str, cancel_at_iso: str,
                         timezone: str = DEFAULT_TIMEZONE, total_vnd: int = 3000000,
                         nights: int = 2) -> dict:
    """Tên: Tính phí và tiền hoàn theo chính sách hủy.
    Input: Mã chính sách, giờ ISO, múi giờ tùy chọn, tổng giá và số đêm.
    Output: Trạng thái, phí, tiền hoàn, cutoff, căn cứ và trường cần bổ sung.
    Tác động ra ngoài: Không, chỉ tính toán trên dữ liệu mẫu.
    """
    code = (policy_code or "").strip().upper()
    policy = next((row for row in _policies() if row["code"] == code), None)
    missing = []
    result = {
        "status": "need_info", "fee_vnd": None, "refund_vnd": None,
        "cutoff_local": None, "hours_before_check_in": None,
        "citations": [{"code": policy["citation"].strip("[]"), "clause": policy["clause"]}]
        if policy else [], "missing_fields": missing,
    }
    if policy is None:
        missing.append("policy_code")
    zone_name = policy["timezone"] if timezone is DEFAULT_TIMEZONE and policy else timezone
    try:
        zone = _zone(zone_name)
    except (ValueError, TypeError, ZoneInfoNotFoundError):
        zone = None
        missing.append("timezone")
    parsed = {}
    for field, value, hour in (
        ("check_in_iso", check_in_iso, policy["check_in_hour"] if policy else 14),
        ("cancel_at_iso", cancel_at_iso, None),
    ):
        if not isinstance(value, str) or not value.strip():
            missing.append(field)
        elif zone is not None:
            try:
                parsed[field] = _local_datetime(value, zone, hour).astimezone(UTC)
            except (ValueError, OverflowError):
                missing.append(field)
    if type(total_vnd) is not int or total_vnd <= 0:
        missing.append("total_vnd")
    if type(nights) is not int or nights < 1:
        missing.append("nights")
    if missing:
        return result
    check_in_utc = parsed["check_in_iso"]
    cancel_utc = parsed["cancel_at_iso"]
    remaining = check_in_utc - cancel_utc
    tiers = policy["tiers"]
    tier = next(tier for tier in tiers if _matches_tier(tier, remaining))
    if tier["unit"] == "percent":
        charge = Fraction(total_vnd * tier["amount"], 100)
    else:
        charge = Fraction(total_vnd * tier["amount"], nights)
    fee = min(total_vnd, int(charge + Fraction(1, 2)))
    free_tier = next((tier for tier in tiers if tier["amount"] == 0), None)
    try:
        cutoff = (check_in_utc - timedelta(hours=free_tier["min_hours"])
                  ).astimezone(zone).isoformat() if free_tier else None
    except (ValueError, OverflowError):
        missing.append("check_in_iso")
        return result
    return dict(result, status="free" if fee == 0 else
                "non_refundable" if fee == total_vnd else "partial",
                fee_vnd=fee, refund_vnd=total_vnd - fee, cutoff_local=cutoff,
                hours_before_check_in=remaining / timedelta(hours=1))


def _matches_tier(tier, remaining):
    hours = tier["min_hours"]
    if hours is None:
        return True
    threshold = timedelta(hours=hours)
    return remaining > threshold if tier.get("exclusive") else remaining >= threshold


@tool
def draft_room_change(current_room: str, target_room: str, nights: int = 2,
                      guest_note: str = "") -> dict:
    """Tên: Soạn yêu cầu đổi hạng phòng.
    Input: Hạng hiện tại và hạng mới, số đêm, ghi chú khách đã ẩn thông tin cá nhân.
    Output: Trạng thái chờ duyệt, chênh lệch dự kiến và nội dung bản nháp.
    Tác động ra ngoài: Không, chỉ trả bản nháp để người dùng tự duyệt.
    """
    rooms = _load("rooms_sample.json")
    catalog = {normalize(identifier): room for room in rooms
               for identifier in (room["name"], room["code"])}
    current = catalog.get(normalize(current_room))
    target = catalog.get(normalize(target_room))
    result = {"status": APPROVAL, "price_diff_vnd": None, "draft_message": ""}
    if current is None or target is None or type(nights) is not int or nights < 1:
        return dict(result, draft_message="Vui lòng cung cấp hai hạng phòng trong danh mục mẫu và số đêm hợp lệ.")
    if current["hotel"] != target["hotel"] or current == target:
        return dict(result, draft_message="Vui lòng chọn hai hạng phòng khác nhau thuộc cùng một khách sạn.")
    difference = (target["nightly_rate_vnd"] - current["nightly_rate_vnd"]) * nights
    difference += target["change_surcharge_vnd"]
    message = (f"Kính gửi Bộ phận Đặt phòng, tôi muốn hỏi về việc đổi từ {current['name']} "
               f"sang {target['name']} cho {nights} đêm. Vui lòng xác nhận tình trạng phòng "
               "và tổng tiền trước khi tôi quyết định.")
    if guest_note.strip():
        message += f" Ghi chú của khách: {guest_note.strip()}"
    return dict(result, price_diff_vnd=difference, draft_message=message)


def _minutes(hours):
    return round(hours * 60)


def _slot_fits(place, start, end, available):
    return (max(8 * 60, _minutes(place["open_hour"])) <= start < end
            <= min(21 * 60, _minutes(place["close_hour"]))
            and end - start == _minutes(place["duration_hours"])
            and 0 <= place["estimated_cost_vnd"] <= available)


def _verify_itinerary(schedule, budget):
    used = violations = 0
    previous_end = {}
    for item in schedule:
        day, start, end = item["day"], item["start_minute"], item["end_minute"]
        place = item["place"]
        if start < previous_end.get(day, 0) or not _slot_fits(place, start, end, budget - used):
            violations += 1
        previous_end[day] = end
        used += place["estimated_cost_vnd"]
    return used, violations


@tool
def plan_and_verify_itinerary(city: str, days: int = 1, budget_vnd: int = 2000000,
                              interests: str = "") -> dict:
    """Tên: Lập và kiểm tra lịch trình tại một thành phố.
    Input: Thành phố, số ngày, ngân sách VND, sở thích và lưu ý thời tiết.
    Output: Lịch, tổng chi phí, số vi phạm và phạm vi lịch có đủ dữ liệu.
    Tác động ra ngoài: Không, chỉ dùng giờ và chi phí mô phỏng.
    """
    result = {"status": "need_info", "city": city, "days": days, "budget_vnd": budget_vnd,
              "itinerary": [], "estimated_total_vnd": 0, "violations_count": 0,
              "weather_sensitive_count": 0}
    if (type(days) is not int or days < 1 or type(budget_vnd) is not int or budget_vnd < 0):
        return result
    places = [row for row in _load("attractions_sample.json")
              if normalize(row["city"]) == normalize(city)]
    if not places:
        return dict(result, status="unsupported_city", unplanned_days=days)
    result["city"] = places[0]["city"]
    preferences = normalize(interests)
    if any(contains_phrase(preferences, term) for term in
           ("mưa", "trong nhà", "indoor", "rain")):
        places = [place for place in places if not place["weather_sensitive"]]
    places.sort(key=lambda place: not any(contains_phrase(preferences, term)
                for term in (place["name"], place["category"])))
    used = 0
    cursors = {day: 8 * 60 + 30 for day in range(1, min(days, len(places)) + 1)}
    schedule = []
    for _ in range(3):
        for day, cursor in cursors.items():
            for index, place in enumerate(places):
                start = max(cursor, _minutes(place["open_hour"]))
                end = start + _minutes(place["duration_hours"])
                if not _slot_fits(place, start, end, budget_vnd - used):
                    continue
                schedule.append({"day": day, "start_minute": start, "end_minute": end, "place": place})
                used += place["estimated_cost_vnd"]
                cursors[day] = end + 30
                places.pop(index)
                break
    schedule.sort(key=lambda slot: (slot["day"], slot["start_minute"]))
    total, violations = _verify_itinerary(schedule, budget_vnd)
    unplanned = days - len({slot["day"] for slot in schedule})
    status = "ok" if not unplanned else "partial" if schedule else "no_fit"
    return dict(result, status=status, itinerary=deepcopy(schedule), estimated_total_vnd=total,
                violations_count=violations, unplanned_days=unplanned,
                weather_sensitive_count=sum(slot["place"]["weather_sensitive"] for slot in schedule))
