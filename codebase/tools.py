
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
import park_engine


DATA = Path(__file__).resolve().parents[1] / "data"
APPROVAL = "CHỜ NGƯỜI DÙNG DUYỆT"
UTC = datetime_timezone.utc
FIXED_OFFSETS = {
    "Asia/Ho_Chi_Minh": 7, "UTC": 0,
}


class _DefaultTimezone(str):
    """Distinguish an omitted timezone from an explicit hotel-zone override."""


DEFAULT_TIMEZONE = _DefaultTimezone("Asia/Ho_Chi_Minh")


@lru_cache
def _vintrip_skill(name):
    """Load a shared stdlib skill without importing FastAPI or service packages."""
    # Repo: <gốc>/vintrip/ai/app/...; image ai-service (Dockerfile.vintrip): /app/codebase cạnh /app/app/...
    candidates = [DATA.parent / f"{prefix}app/services/assistant/skills/{name}.py"
                  for prefix in ("vintrip/ai/", "")]
    path = next((p for p in candidates if p.is_file()), candidates[0])
    spec = importlib.util.spec_from_file_location(f"vintrip_{name}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def flight_disruption_engine():
    return _vintrip_skill("c3_engine")


def flight_flow_module():
    return _vintrip_skill("c3_flow")


# C3 có trạng thái: 10 công cụ (docstring ở c3_flow.py) chạy trên adapter mô phỏng.
C3_TOOLS = {name: tool(getattr(flight_flow_module(), name))
            for name in flight_flow_module().TOOL_NAMES}
globals().update(C3_TOOLS)


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


PLACES_FILE = "ocean_park_places.json"
CITY_ALIASES = ("ocean park", "ocean city", "vinhomes ocean park", "grand world")


def _places():
    """Địa điểm khách vãng lai dùng được (bỏ tiện ích chỉ dành cho cư dân)."""
    return [row for row in _load(PLACES_FILE)["places"] if not row["requires_resident"]]


def _match_scope(city):
    """Trả (tên hiển thị, hàm lọc) cho 'Ocean Park' hoặc một khu 'Ocean Park 1/2/3'."""
    key = normalize(city)
    for area in dict.fromkeys(row["area"] for row in _places()):
        if key == normalize(area):
            return area, lambda row, area=area: row["area"] == area
    if key in {normalize(alias) for alias in CITY_ALIASES}:
        return "Ocean Park", lambda row: True
    return None, None


def itinerary_cities(text):
    normalized = normalize(text)
    for area in dict.fromkeys(row["area"] for row in _places()):
        # "Ocean Park 2 ngày" là số ngày, không phải khu Ocean Park 2.
        pattern = r"\b" + re.escape(normalize(area)) + r"\b(?! (?:ngay|dem|days?|nights?)\b)"
        if re.search(pattern, normalized):
            return [area]
    return ["Ocean Park"] if any(contains_phrase(normalized, alias)
                                 for alias in CITY_ALIASES) else []


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
    """Tên: Lập và kiểm tra lịch trình vui chơi tại Ocean Park (Ocean City).
    Input: Khu (Ocean Park hoặc Ocean Park 1/2/3), số ngày, ngân sách VND, sở thích và lưu ý thời tiết.
    Output: Lịch, tổng chi phí, số vi phạm và phạm vi lịch có đủ dữ liệu.
    Tác động ra ngoài: Không, chỉ đọc data/ocean_park_places.json (giá cào từ VinWonders).
    """
    result = {"status": "need_info", "city": city, "days": days, "budget_vnd": budget_vnd,
              "itinerary": [], "estimated_total_vnd": 0, "violations_count": 0,
              "weather_sensitive_count": 0}
    if (type(days) is not int or days < 1 or type(budget_vnd) is not int or budget_vnd < 0):
        return result
    scope, keep = _match_scope(city)
    places = [row for row in _places() if keep and keep(row)]
    if not places:
        return dict(result, status="unsupported_city", unplanned_days=days)
    result["city"] = scope
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


FOOD_KINDS = ("nhà hàng", "quán ăn", "quán nhậu", "cà phê / giải khát", "bar / pub", "karaoke",
              "vui chơi")
HANOI_DISTRICTS = ("Hoàn Kiếm", "Ba Đình", "Đống Đa", "Hai Bà Trưng", "Cầu Giấy", "Thanh Xuân",
                   "Hoàng Mai", "Long Biên", "Tây Hồ", "Nam Từ Liêm", "Bắc Từ Liêm", "Hà Đông",
                   "Gia Lâm", "Đông Anh", "Thanh Trì")
VIN_AREAS = ("Times City", "Royal City", "Vinhomes Riverside", "The Harmony", "Smart City",
             "Aeon Mall Long Biên", "Grand World", "Vincom")


def venue_scopes(text):
    """Khu người dùng nhắc trong câu: khu Ocean Park, khu Vin, quận Hà Nội hoặc 'Hà Nội'."""
    normalized = normalize(text)
    found = itinerary_cities(text)
    found += [name for name in VIN_AREAS + HANOI_DISTRICTS if contains_phrase(normalized, name)]
    if not found and contains_phrase(normalized, "hà nội"):
        found.append("Hà Nội")
    return list(dict.fromkeys(found))


def _venue_filter(area):
    scope, keep = _match_scope(area)
    if scope:
        return scope, lambda row: scope == "Ocean Park" and row["area"].startswith("Ocean Park")             or row["area"] == scope
    key = normalize(area)
    if key in (normalize("Hà Nội"), "ha noi"):
        return "Hà Nội", lambda row: True
    for name in HANOI_DISTRICTS:
        if key == normalize(name):
            return name, lambda row, n=name: row["district"] == n or contains_phrase(
                normalize(row["address"] or ""), n)
    for name in VIN_AREAS:
        if key == normalize(name):
            return name, lambda row, n=name: row["vin_area"] == n or contains_phrase(
                normalize(row["address"] or ""), n)
    return None, None


@tool
def find_venues(area: str = "Ocean Park", kind: str = "", budget_vnd: int | None = None,
                open_late: bool = False, tag: str = "", limit: int = 5) -> dict:
    """Tên: Tìm chỗ ăn, uống, cà phê, bar, karaoke, chỗ chơi ở Ocean Park và Hà Nội.
    Input: Khu (Ocean Park, Ocean Park 1/2/3, Hà Nội, một quận Hà Nội hoặc khu Vin như Times City),
    loại (nhà hàng, quán ăn, quán nhậu, cà phê / giải khát, bar / pub, karaoke, vui chơi hoặc rỗng),
    ngân sách VND mỗi người (tùy chọn), chỉ lấy chỗ mở khuya (true/false), nhãn (vd chay, buffet,
    lẩu, ăn đêm, làm việc, nhạc sống), số chỗ tối đa.
    Output: Danh sách chỗ (tên, loại, khu, quận, địa chỉ, giờ, khoảng giá, nguồn) và số chỗ bị loại
    vì nguồn không có giá khi đã đặt ngân sách.
    Tác động ra ngoài: Không, chỉ đọc data/ocean_park_places.json (cào từ VinWonders, GreenSM,
    Vinhomes Market); không đặt bàn, không đặt phòng hát.
    """
    scope, keep = _venue_filter(area)
    result = {"status": "unsupported_area", "area": area, "kind": kind, "budget_vnd": budget_vnd,
              "open_late": open_late, "tag": tag, "venues": [], "unpriced_skipped": 0}
    if scope is None:
        return result
    if kind and kind not in FOOD_KINDS:
        return dict(result, status="need_info")
    tag_key = normalize(tag)
    rows = [row for row in _load(PLACES_FILE)["venues"]
            if keep(row) and (not kind or row["kind"] == kind)
            and (not open_late or row["open_late"])
            and (not tag_key or any(normalize(t) == tag_key for t in row["tags"])
                 or contains_phrase(normalize(row["name"]), tag))]
    if budget_vnd is not None:
        priced = [row for row in rows if row.get("price_min_vnd") is not None]
        result["unpriced_skipped"] = len(rows) - len(priced)
        rows = [row for row in priced if row["price_min_vnd"] <= budget_vnd]
    # Chỗ có giá và giờ lên trước để người dùng có đủ dữ kiện quyết định.
    rows.sort(key=lambda row: (row.get("price_min_vnd") is None, row.get("open_hour") is None,
                               row.get("price_min_vnd") or 0, row["name"]))
    picked = [{field: row.get(field) for field in
               ("name", "kind", "area", "district", "vin_area", "address", "hours", "open_late",
                "price_min_vnd", "price_max_vnd", "must_try")} | {"source_url": row["sources"][0]["url"]}
              for row in rows[:max(1, limit)]]
    return dict(result, status="ok" if picked else "no_match", area=scope, venues=picked)


@tool
def list_transport(free_only: bool = False) -> dict:
    """Tên: Tra tuyến xe buýt và xe điện đến, đi trong Ocean Park.
    Input: Chỉ lấy tuyến miễn phí (true/false).
    Output: Danh sách tuyến (mã, loại, lộ trình, giờ chạy, giá vé, nguồn).
    Tác động ra ngoài: Không, chỉ đọc data/ocean_park_places.json; không đặt vé, không gọi xe.
    """
    routes = [{field: row.get(field) for field in
               ("code", "kind", "route", "hours", "price_vnd", "price_note", "source_url")}
              for row in _load(PLACES_FILE)["transport"]
              if not free_only or row["price_vnd"] == 0]
    return {"status": "ok" if routes else "no_match", "free_only": free_only, "routes": routes}


LODGING_KINDS = ("khách sạn", "homestay", "biệt thự")


@tool
def find_lodging(area: str = "Ocean Park", kind: str = "", budget_per_night_vnd: int | None = None,
                 limit: int = 5) -> dict:
    """Tên: Tìm chỗ lưu trú (khách sạn, homestay, biệt thự) ở Ocean Park.
    Input: Khu (Ocean Park hoặc Ocean Park 1/2/3), loại chỗ ở (khách sạn, homestay, biệt thự
    hoặc rỗng), ngân sách VND mỗi đêm cho cả căn/phòng (tùy chọn), số chỗ tối đa.
    Output: Danh sách chỗ ở (tên, loại, khu, địa chỉ, giá ngày thường và cuối tuần, độ tin cậy
    nguồn, link) và số chỗ bị loại vì nguồn không có giá khi đã đặt ngân sách.
    Tác động ra ngoài: Không, chỉ đọc data/ocean_park_places.json; không đặt hay giữ phòng.
    """
    scope, _ = _match_scope(area)
    result = {"status": "unsupported_area", "area": area, "kind": kind,
              "budget_per_night_vnd": budget_per_night_vnd, "lodging": [], "unpriced_skipped": 0}
    if scope is None:
        return result
    if kind and kind not in LODGING_KINDS:
        return dict(result, status="need_info")
    # Chỗ ở chỉ biết chung "Ocean Park" vẫn hiện khi hỏi một khu cụ thể, kèm khu để người dùng tự đối chiếu.
    rows = [row for row in _load(PLACES_FILE)["lodging"]
            if (scope == "Ocean Park" or row["area"] in (scope, "Ocean Park"))
            and (not kind or row["kind"] == kind)]
    if budget_per_night_vnd is not None:
        priced = [row for row in rows if row["price_min_vnd"] is not None]
        result["unpriced_skipped"] = len(rows) - len(priced)
        rows = [row for row in priced if row["price_min_vnd"] <= budget_per_night_vnd]
    rows.sort(key=lambda row: (row["confidence"] != "nguồn chính", row["area"] != scope,
                               row["price_min_vnd"] is None, row["price_min_vnd"] or 0))
    picked = [{field: row.get(field) for field in
               ("name", "kind", "area", "address", "stars", "price_min_vnd", "price_max_vnd",
                "weekend_price_min_vnd", "weekend_price_max_vnd", "price_note", "confidence",
                "source_url")} for row in rows[:max(1, limit)]]
    return dict(result, status="ok" if picked else "no_match", area=scope, lodging=picked)


PARK_ALIASES = {
    "VinWonders Wave Park": ("wave park", "cong vien song", "bien nhan tao hung yen",
                             "bien nhan tao ocean park 2", "royal wave"),
    "VinWonders Water Park": ("water park", "cong vien nuoc", "paradise bay", "aqua bay"),
    "Grand World": ("grand world",),
}
COMBO = "Combo Wave Park & Water Park"


def resolve_park(text):
    """Tên công viên chuẩn từ câu người dùng; None nếu không có trong dữ liệu."""
    normalized = normalize(text)
    if contains_phrase(normalized, "combo") or (
            contains_phrase(normalized, "wave park") and contains_phrase(normalized, "water park")):
        return COMBO
    return next((park for park, aliases in PARK_ALIASES.items()
                 if any(contains_phrase(normalized, alias) for alias in aliases)), None)


def _snapshot_id():
    import hashlib
    return "OP-" + hashlib.sha1((DATA / PLACES_FILE).read_bytes()).hexdigest()[:10]


def _ticket_tier(height_cm):
    if height_cm is None:
        return None
    return "<80cm" if height_cm < 80 else "80–140cm" if height_cm < 140 else "≥140cm"


@tool
def get_park_catalog(park: str, visit_date: str = "", guests: list | None = None) -> dict:
    """Tên: Lấy danh mục trò chơi, quy định và giá vé của một khu vui chơi Ocean Park.
    Input: Công viên (Công viên Mẫu — snapshot mô phỏng C1; VinWonders Wave Park, VinWonders Water
    Park, combo hai công viên hoặc Grand World — dữ liệu thật), ngày đi ISO YYYY-MM-DD hoặc "cuối tuần" / "ngày thường" (tùy chọn), nhóm khách: danh sách {"label", "height_cm"}.
    Output: Trạng thái (OK, NEEDS_INPUT khi thiếu chiều cao để tính vé, MISSING_DATA khi công viên
    không có trong dữ liệu), snapshot_id, loại ngày, vé từng khách và tổng, quy định vé, dịch vụ
    thu thêm, danh sách hoạt động (khu, trong nhà, cho trẻ em, cảm giác mạnh, gồm trong vé, điều
    kiện) và các trường còn thiếu dữ liệu.
    Tác động ra ngoài: Không, chỉ đọc data/ocean_park_places.json (bảng giá chính thức VinWonders);
    không mua vé.
    """
    if normalize(park) == normalize(park_engine.MOCK_PARK):
        return _mock_catalog(guests)
    catalog = _load(PLACES_FILE)["park_catalog"]
    canonical = resolve_park(park) or next((p for p in PARK_ALIASES if normalize(p) == normalize(park)),
                                           None)
    result = {"status": "MISSING_DATA", "park": park, "snapshot_id": _snapshot_id(), "is_mock": False,
              "day_type": None, "tickets": [], "ticket_total_vnd": None, "missing_heights": [],
              "rules": [], "add_ons": [], "activities": [],
              "not_in_data": ["thời lượng từng trò", "thời gian chờ", "phút đi bộ giữa các khu",
                              "giới hạn chiều cao từng trò", "sự cố trong ngày"]}
    if canonical is None:
        return result
    day_type = None
    if normalize(visit_date) in ("cuoi tuan", "ngay le", "ngay thuong"):
        day_type = "ngày thường" if normalize(visit_date) == "ngay thuong" else "cuối tuần"
    elif visit_date:
        try:
            day_type = "cuối tuần" if date.fromisoformat(visit_date).weekday() >= 5 else "ngày thường"
        except ValueError:
            return dict(result, status="NEEDS_INPUT", park=canonical, missing_heights=[],
                        not_in_data=result["not_in_data"] + ["ngày đi hợp lệ"])
    parks = ("VinWonders Wave Park", "VinWonders Water Park") if canonical == COMBO else (canonical,)
    prices = {(t["park"], t["guest"]): t for t in catalog["tickets"]}
    tickets, missing, total = [], [], 0
    if canonical != "Grand World":  # Grand World vào cổng miễn phí, trò tính riêng
        for index, guest in enumerate(guests or []):
            label = guest.get("label") or f"khách {index + 1}"
            tier = _ticket_tier(guest.get("height_cm"))
            if tier is None:
                missing.append(label)
                continue
            row = prices.get((canonical, tier)) or prices.get(("Wave Park / Water Park", tier))
            price = None
            if row and day_type:
                price = row["weekday_vnd"] if day_type == "ngày thường" else row["weekend_holiday_vnd"]
            tickets.append({"label": label, "height_cm": guest["height_cm"], "tier": tier,
                            "weekday_vnd": row["weekday_vnd"], "weekend_holiday_vnd":
                            row["weekend_holiday_vnd"], "price_vnd": price})
            total = None if price is None or total is None else total + price
    activities = [{field: row.get(field) for field in
                   ("park", "area", "name", "description", "indoor", "kid_zone", "thrill",
                    "included_in_ticket", "min_height_cm", "height_note", "price_note",
                    "duration_min", "source_url")} | {"wait_min": None}
                  for row in catalog["activities"] if row["park"] in parks]
    status = "NEEDS_INPUT" if missing else "OK"
    return dict(result, status=status, park=canonical, day_type=day_type, tickets=tickets,
                ticket_total_vnd=total if tickets and not missing and day_type else None,
                missing_heights=missing,
                rules=[r["rule"] for r in catalog["ticket_rules"]] if canonical != "Grand World" else [],
                add_ons=[a for a in catalog["add_ons"] if a["park"] in parks],
                activities=activities)


def _mock_catalog(guests):
    snap = park_engine.snapshot()
    members = guests or []
    activities = []
    for act in snap["activities"]:
        reasons = park_engine.eligibility(act, members) if members else []
        activities.append({**{k: act.get(k) for k in ("id", "name", "zone", "duration_min", "wait_min",
                                                   "indoor", "intensity", "tags", "surcharge_vnd")},
                           "zone_name": park_engine.zone_name(act["zone"]),
                           "conditions": act["conditions"],
                           "missing_conditions": act["conditions"] is None,
                           "eligible": None if not members else not reasons, "ineligible_reasons": reasons})
    return {"status": "OK", "park": park_engine.MOCK_PARK, "snapshot_id": snap["snapshotId"],
            "is_mock": True, "open": snap["open"], "close": snap["close"],
            "prices": snap["prices"], "activities": activities}


@tool
def get_show_schedule(park: str, visit_date: str = "") -> dict:
    """Tên: Lấy lịch suất diễn của khu vui chơi.
    Input: Công viên, ngày đi (tùy chọn).
    Output: Trạng thái, snapshot_id, tên show, sân khấu, số phút cần đến sớm và từng suất
    (mã, giờ bắt đầu, kết thúc, trạng thái theo lịch), hoặc MISSING_DATA nếu không có công viên.
    Tác động ra ngoài: Không, chỉ đọc snapshot mô phỏng Công viên Mẫu.
    """
    if normalize(park) != normalize(park_engine.MOCK_PARK):
        return {"status": "MISSING_DATA", "park": park, "sessions": []}
    snap = park_engine.snapshot()
    shows = snap["shows"]
    return {"status": "OK", "park": park_engine.MOCK_PARK, "snapshot_id": snap["snapshotId"],
            "is_mock": True, "visit_date": visit_date or snap["date"], "show": shows["name"],
            "venue": park_engine.zone_name(shows["venue_zone"]), "indoor": shows["indoor"],
            "arrive_early_min": shows["arrive_early_min"],
            "sessions": [dict(s, status="theo lịch") for s in shows["sessions"]]}


@tool
def get_park_incidents(park: str, at_time: str = "") -> dict:
    """Tên: Lấy sự cố trong ngày của khu vui chơi (show huỷ, điểm đóng).
    Input: Công viên, thời điểm HH:MM (tùy chọn).
    Output: Trạng thái, snapshot_id, danh sách sự cố hôm nay (loại, suất bị huỷ kèm giờ, lý do).
    Mưa do phụ huynh báo tại chỗ được luồng chính ghi riêng, công cụ không tự sinh mưa.
    Tác động ra ngoài: Không, chỉ đọc nguồn sự cố mô phỏng trong snapshot.
    """
    if normalize(park) != normalize(park_engine.MOCK_PARK):
        return {"status": "MISSING_DATA", "park": park, "incidents": []}
    snap = park_engine.snapshot()
    incidents = []
    for row in snap["incidents_today"]:
        ses = park_engine.session(row["session_id"]) if row.get("session_id") else None
        incidents.append(dict(row, start=ses["start"] if ses else None, end=ses["end"] if ses else None))
    return {"status": "OK", "park": park_engine.MOCK_PARK, "snapshot_id": snap["snapshotId"],
            "is_mock": True, "at_time": at_time, "incidents": incidents}


@tool
def estimate_walk(from_zone: str, to_zone: str) -> dict:
    """Tên: Ước tính phút đi bộ giữa hai khu của Công viên Mẫu.
    Input: Mã khu đi và đến (GATE, KHU_A…KHU_E, STAGE, FOOD).
    Output: Số phút đi bộ theo ma trận snapshot, tên hai khu, hoặc MISSING_DATA nếu không có cặp khu.
    Tác động ra ngoài: Không, chỉ đọc snapshot.
    """
    minutes = park_engine.walk(from_zone, to_zone)
    zones = park_engine.snapshot()["zones"]
    if minutes is None or from_zone not in zones or to_zone not in zones:
        return {"status": "MISSING_DATA", "from": from_zone, "to": to_zone, "minutes": None}
    return {"status": "OK", "from": from_zone, "to": to_zone, "minutes": minutes,
            "from_name": zones[from_zone]["name"], "to_name": zones[to_zone]["name"],
            "snapshot_id": park_engine.snapshot()["snapshotId"]}


@tool
def build_park_plan(request: dict) -> dict:
    """Tên: Lập lịch một ngày tại Công viên Mẫu từ yêu cầu đã chuẩn hoá.
    Input: Yêu cầu: thành viên (người lớn / trẻ kèm tuổi, chiều cao), khung giờ, ngân sách, vị trí
    xuất phát, có tính vé cổng không, show (bắt buộc / ưu tiên), ăn trưa, ưu tiên, trò bắt buộc,
    khoảng mưa, suất đã huỷ.
    Output: Trạng thái tìm kiếm (FOUND / MISSING_DATA / INFEASIBLE có cơ sở / SEARCH_TIMEOUT), danh sách mục lịch
    (loại, mã, khu, giờ bắt đầu, kết thúc), đã chứng minh hay chưa, lý do.
    Tác động ra ngoài: Không, chỉ tính toán.
    """
    return park_engine.build_plan(request)


@tool
def validate_park_plan(items: list, request: dict) -> dict:
    """Tên: Kiểm độc lập một lịch trên cùng snapshot trước khi gọi là VALID.
    Input: Danh sách mục lịch, yêu cầu đã chuẩn hoá.
    Output: valid (true/false), danh sách vi phạm (khung giờ, đi bộ, suất diễn, đến sớm, điều kiện
    từng thành viên, ăn trưa, mưa, yêu cầu bắt buộc, ngân sách), bảng tiền và tổng tính lại, snapshot_id.
    Tác động ra ngoài: Không, chỉ tính toán.
    """
    return park_engine.validate_plan(items, request)
