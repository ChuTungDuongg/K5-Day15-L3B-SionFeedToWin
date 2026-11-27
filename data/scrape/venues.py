"""Bóc quán ăn, cà phê, bar, karaoke, chỗ chơi ở Hà Nội và quanh Ocean Park từ các trang đã cào.

Các bài tổng hợp trên VinWonders / GreenSM dùng chung một khuôn: '## Tên quán' rồi trong vài
dòng sau có 'Địa chỉ:', 'Giờ mở cửa:' (hoặc 'Giờ phục vụ', 'Thời gian mở cửa'…), 'Giá tham khảo:'
(hoặc 'Mức giá', 'Khoảng giá'…). `parse_generic` đọc khuôn đó; trang không theo khuôn thì
khai báo tay trong MANUAL kèm một đoạn evidence chép nguyên văn.
Không lấy số điện thoại.
"""
import re
import unicodedata

VW = "https://vinwonders.com/vi/wonderpedia/news/"
GS = "https://www.greensm.com/vn-vi/news/"
MARKET_OP2 = "https://market.vinhomes.vn/blog/vinhomes-ocean-park-2-kinh-nghiem-an-choi-cac-diem-den-hap-dan"
THU_BAO = GS + "tiem-ca-phe-thu-bao-gia-lam"

CAFE, BAR, KARAOKE, NHAU, FOOD, NIGHT_FOOD, PLAY = (
    "cà phê / giải khát", "bar / pub", "karaoke", "quán nhậu", "nhà hàng", "quán ăn", "vui chơi")

# (url, loại mặc định, nhãn thêm). Loại None = đoán theo tên quán.
GENERIC_PAGES = [
    (GS + "quan-ngon-long-bien", FOOD, []),
    (GS + "cafe-long-bien", CAFE, []),
    (GS + "quan-nuong-long-bien", FOOD, ["nướng"]),
    (GS + "quan-lau-long-bien", FOOD, ["lẩu"]),
    (GS + "buffet-long-bien", FOOD, ["buffet"]),
    (GS + "quan-chay-long-bien", FOOD, ["chay"]),
    (VW + "check-in-13-quan-cafe-long-bien-ha-noi/", CAFE, ["check-in"]),
    (VW + "7-quan-chay-long-bien-ha-noi-noi-tieng/", FOOD, ["chay"]),
    (VW + "quan-an-ngon-ha-noi/", FOOD, []),
    (VW + "an-toi-ha-noi/", FOOD, ["ăn tối"]),
    (VW + "quan-lau-ngon-ha-noi/", FOOD, ["lẩu"]),
    (VW + "quan-dimsum-ngon-o-ha-noi/", FOOD, ["dimsum"]),
    (VW + "buffet-hai-san-ha-noi/", FOOD, ["buffet", "hải sản"]),
    (VW + "quan-cafe-lam-viec-o-ha-noi/", CAFE, ["làm việc"]),
    (VW + "cafe-nhac-song-ha-noi/", CAFE, ["nhạc sống"]),
    (VW + "cafe-trung-ha-noi/", CAFE, ["cà phê trứng"]),
    (GS + "bar-cau-giay", BAR, ["chơi đêm"]),
    (GS + "pub-cau-giay-ha-noi", BAR, ["chơi đêm"]),
    (GS + "top-of-ha-noi", BAR, ["rooftop"]),
    (VW + "quan-nhau-ngon-ha-noi/", NHAU, []),
    (VW + "quan-bia-hoi-ha-noi/", NHAU, ["bia hơi"]),
    (VW + "oc-dem-ha-noi/", NHAU, ["ốc", "ăn đêm"]),
    (VW + "an-dem-ha-noi/", NIGHT_FOOD, ["ăn đêm"]),
    (GS + "karaoke-hoang-mai-ha-noi", KARAOKE, ["chơi đêm"]),
    (GS + "quan-karaoke-cau-giay", KARAOKE, ["chơi đêm"]),
    (GS + "karaoke-ba-dinh", KARAOKE, ["chơi đêm"]),
    (GS + "music-box-dong-da", KARAOKE, ["chơi đêm"]),
    (VW + "dia-diem-vui-choi-ha-noi-cho-nhom-ban/", PLAY, ["nhóm bạn"]),
    (VW + "dia-diem-vui-choi-ha-noi-buoi-toi/", PLAY, ["chơi đêm"]),
]
# Trang tiếng Anh: dòng tên quán rồi ngay dưới là 'Address: ...'.
NAME_ADDRESS_PAGES = ["https://vinwonders.com/en/wonderpedia/news/vinhomes-ocean-park-3/"]

# Trang Vinhomes Market OP2: dòng 'Tên: mô tả' trong mục 'Ăn Gì Khi Đến…'.
COLON_LIST_PAGES = [(MARKET_OP2, "## Ăn Gì Khi Đến", "## Kinh Nghiệm")]
NOT_A_VENUE = {"Bún chả Hà Nội"}  # dòng gợi ý món ăn chung, không phải một quán

MANUAL = [
    dict(name="Tiệm cà phê Thư Báo", kind=CAFE, tags=["hoài cổ"],
         address="Số 6 ngõ 283 Ngô Xuân Quảng, Cửu Việt, Gia Lâm, Hà Nội",
         hours="07h30 – 23h00 hàng ngày", price="30.000đ – 60.000VNĐ", source_url=THU_BAO,
         evidence="số 6 ngõ 283 Ngô Xuân Quảng, Cửu Việt, Gia Lâm, Hà Nội"),
]

LABELS = {
    "address": r"(?:📍\s*)?(?:Địa chỉ(?: cụ thể)?|Address)",
    "hours": r"(?:Giờ (?:mở cửa|mở bán|phục vụ|hoạt động)|Thời gian (?:mở cửa|hoạt động|phục vụ)"
             r"|Opening hours)",
    "price": r"(?:Mức giá(?: tham khảo)?|Giá tham khảo(?: \(\*\))?|Khoảng giá|Giá bán|Giá vé"
             r"|Giá thành|Giá cả|Price)",
}
SKIP_HEADING = re.compile(r"^(?:địa chỉ|gợi ý|top \d|kinh nghiệm|lưu ý|câu hỏi|faq|bài viết|"
                          r"tìm kiếm|ưu đãi|lịch sử|phổ biến|mục lục)", re.I)
DISTRICTS = ("Hoàn Kiếm", "Ba Đình", "Đống Đa", "Hai Bà Trưng", "Cầu Giấy", "Thanh Xuân",
             "Hoàng Mai", "Long Biên", "Tây Hồ", "Nam Từ Liêm", "Bắc Từ Liêm", "Hà Đông",
             "Gia Lâm", "Đông Anh", "Thanh Trì")
VIN_AREAS = ("Times City", "Royal City", "Vinhomes Riverside", "The Harmony", "Smart City",
             "Vinhomes Metropolis", "Gardenia", "Skylake", "Grand World", "Ocean Park",
             "Vincom", "Aeon Mall Long Biên")


def fold(text):
    plain = unicodedata.normalize("NFD", text.lower().replace("đ", "d"))
    return "".join(c for c in plain if not unicodedata.combining(c))


def price_range(text):
    if not text:
        return None, None
    numbers = [int(n.replace(".", "").replace(",", ""))
               for n in re.findall(r"\d{1,3}(?:[.,]\d{3})+", text)]
    numbers += [int(n) * 1000 for n in re.findall(r"(?<![\d.,])(\d{1,4})\s*k\b", text, re.I)]
    return (min(numbers), max(numbers)) if numbers else (None, None)


def hours_range(text):
    """(mở, đóng) theo giờ thập phân; đóng < mở nghĩa là qua nửa đêm. Cả ngày = (0, 24)."""
    if not text:
        return None, None
    if re.search(r"24/24|24/7|cả ngày|xuyên đêm", text, re.I):
        return 0.0, 24.0
    match = re.search(r"(\d{1,2})\s*[:hH](\d{2})?\s*(?:[–\-]|đến)\s*(\d{1,2})\s*[:hH]?(\d{2})?", text)
    if not match:
        return None, None
    h1, m1, h2, m2 = match.groups()
    return int(h1) + int(m1 or 0) / 60, int(h2) % 24 + int(m2 or 0) / 60 if int(h2) != 24 else 24.0


def open_late(open_hour, close_hour):
    """Mở tới 23:00 trở đi hoặc qua nửa đêm."""
    if open_hour is None or close_hour is None:
        return None
    return close_hour >= 23 or close_hour < open_hour or (open_hour, close_hour) == (0.0, 24.0)


def locate(address, default_area="Hà Nội"):
    text = address or ""
    if re.search(r"Grand World|Ocean Park 3", text, re.I):
        area = "Ocean Park 3"
    elif re.search(r"Ocean Park 2|Ocean City", text, re.I):
        area = "Ocean Park 2"
    elif re.search(r"Ocean Park", text, re.I):
        area = "Ocean Park 1"
    else:
        area = default_area
    district = next((d for d in DISTRICTS if fold(d) in fold(text)), None)
    vin_area = next((v for v in VIN_AREAS if fold(v) in fold(text)), None)
    return area, district, vin_area


def clean_name(heading):
    name = re.sub(r"^#+\s*", "", heading)
    name = re.sub(r"^(?:\d+(?:\.\d+)*\.?|[IVX]+\.)\s*", "", name).strip()
    name = re.sub(r"^(?:giới thiệu|review)\s+", "", name, flags=re.I)
    for sep in (" – ", " - ", ": "):
        if sep in name:
            head, tail = name.split(sep, 1)
            # "Quán bia hơi Hà Nội nổi tiếng – Bia Hơi Hải Xồm": vế đầu là lời mô tả, tên ở vế sau.
            if len(tail) <= 30 and re.search(
                    r"hà nội|long biên|ngon|review|địa chỉ|nổi tiếng|quen thuộc|bình dân|sang chảnh|"
                    r"mở đêm|giá rẻ|cao cấp|yêu thích|không gian|thưởng thức|hút khách|đắt khách|"
                    r"nên thử|bỏ qua|sống ảo|view|ruột|địa điểm|vui chơi|làm việc|"
                    + "|".join(DISTRICTS), head, re.I):
                name = tail
            elif len(tail) > 22 or re.search(r"quán|địa chỉ|hương vị|nơi|điểm|ngon|giữa|chất|đỉnh",
                                             tail, re.I):
                name = head
            break
    # "Thưởng thức dimsum … ghé Meiwei Hà Nội", "Ngắm view … tại cafe Long Biên Treeving Coffee"
    lead = re.search(r"^(.{12,}?)\s+(?:tại|ghé|đến)\s+(.{3,})$", name)
    if lead and len(lead.group(1).split()) >= 3:
        name = lead.group(2)
    # "My Way Café & Lounge theo phong cách châu Âu" → bỏ phần mô tả phía sau tên.
    name = re.sub(r"\s+(?:với|theo phong cách|mang phong cách|phong cách|nằm trong|menu|view|"
                  r"mở cả ngày|mở xuyên đêm|trên phố|đường|ngon nức tiếng|lãng mạn|ấm cúng)\b.*$",
                  "", name, flags=re.I)
    name = re.sub(r"^(?:quán ngon|quán nướng|quán lẩu|buffet|cafe|quán chay)\s+(?:long biên|hà nội)\s+",
                  "", name, flags=re.I)
    name = re.sub(r"^cafe long biên\s+", "", name, flags=re.I)
    return name.strip(" .:")


def kind_from_name(name, default):
    low = name.lower()
    if re.search(r"karaoke|music box", low):
        return KARAOKE
    if re.search(r"\bbar\b|pub|lounge|club|rooftop", low):
        return BAR
    if re.search(r"nhậu|bia hơi|beer", low):
        return NHAU
    if re.search(r"cafe|café|cà phê|coffee|kafe|trà sữa|tea", low):
        return CAFE
    return default or FOOD


def _field(block, label):
    pattern = re.compile(rf"^\s*(?:[-•*]\s*)?{LABELS[label]}\s*:\s*(.*)$", re.I)
    for i, line in enumerate(block):
        match = pattern.match(line)
        if match:
            value = match.group(1).strip() or (block[i + 1].strip() if i + 1 < len(block) else "")
            return value or None
    return None


def parse_generic(lines, default_kind, tags):
    rows = []
    for i, line in enumerate(lines):
        if not line.startswith("## "):
            continue
        block, next_heading = [], ""
        for following in lines[i + 1:i + 16]:
            if following.startswith("## "):
                next_heading = following
                break
            block.append(following)
        # "## 1. Phở – món ăn đêm…" là tiêu đề nhóm khi ngay sau là "## 1.1. …".
        group = re.match(r"## (\d+)\. ", line)
        if not next_heading:
            next_heading = next((f for f in lines[i + 1:] if f.startswith("## ")), "")
        if group and next_heading.startswith(f"## {group.group(1)}.1."):
            continue
        address = _field(block, "address")
        name = clean_name(line)
        if (not address or not name or SKIP_HEADING.match(name) or "?" in name or len(name) > 60
                or re.search(r"\bship\b", name, re.I)  # dịch vụ giao đồ ăn, không phải chỗ ngồi
                or (len(name) < 4 and not name.isupper())):  # tên món chung ("Phở"), không phải quán
            continue
        rows.append(dict(name=name, kind=kind_from_name(name, default_kind), tags=list(tags),
                         address=address.rstrip("."), hours=_field(block, "hours"),
                         price=_field(block, "price")))
    return rows


def parse_name_address(lines):
    rows = []
    for i in range(1, len(lines)):
        match = re.match(r"Address:\s*(.+)", lines[i])
        name = lines[i - 1].strip()
        if match and not name.startswith("##") and ":" not in name and len(name) <= 40:
            rows.append(dict(name=name, kind=kind_from_name(name, FOOD), tags=[],
                             address=match.group(1).strip(), hours=None, price=None))
    return rows


def parse_colon_list(lines, start, stop):
    rows, section, inside = [], "", False
    for line in lines:
        if line.startswith(start):
            inside = True
            continue
        if inside and line.startswith(stop):
            break
        if not inside:
            continue
        if line.startswith("## "):
            section = line
            continue
        match = re.match(r"([^:]{2,45}):\s*(.+)", line)
        if not match or match.group(1).strip() in NOT_A_VENUE:
            continue
        name, description = match.group(1).strip(), match.group(2)
        address = re.search(r"Địa chỉ:\s*([^.]+)", description)
        where = re.search(r"\(([^)]*(?:\d|khu|Center Point|K-Town)[^)]*)\)", name + " " + description)
        area = "Ocean Park 3" if "Grand World" in section else "Ocean Park 2"
        default = CAFE if "Cà phê" in section else FOOD
        rows.append(dict(name=re.sub(r"\s*\(.*?\)", "", name), kind=kind_from_name(name, default),
                         tags=[], address=(address.group(1) if address else
                                           where.group(1) if where else None),
                         hours=None, price=None, area=area))
    return rows


def finish(row, url, fetched):
    """Thêm khu, quận, khu Vin, giờ, giá dạng số và nguồn."""
    row["address"] = row.get("address") or None
    price = row.pop("price", None)
    hours = row.get("hours")
    # Vài bài ghi nhầm giá vào dòng giờ mở cửa: chuyển sang giá nếu không có mốc giờ nào.
    if hours and re.search(r"vnđ|vnd|đồng|\dđ", hours, re.I) and hours_range(hours) == (None, None):
        price, row["hours"] = price or hours, None
    area, district, vin_area = locate(row.get("address"), row.pop("area", None) or "Hà Nội")
    open_hour, close_hour = hours_range(row.get("hours"))
    low, high = price_range(price)
    return dict(row, area=area, district=district, vin_area=vin_area,
                open_hour=open_hour, close_hour=close_hour,
                open_late=open_late(open_hour, close_hour),
                price_min_vnd=low, price_max_vnd=high,
                sources=[{"url": url, "fetched_at": fetched}])


def build(raw_text, index, errors):
    """raw_text(url, index) -> (text, fetched_at). Trả danh sách địa điểm ăn chơi đã chuẩn hoá."""
    rows = []

    def raw_text(url, index, _read=raw_text):
        # Vài trang lưu chữ Việt dạng dấu tách rời (NFD); đưa về NFC để luật so khớp chữ có dấu chạy đúng.
        text, fetched = _read(url, index)
        return (unicodedata.normalize("NFC", text) if text else text), fetched

    for url, default_kind, tags in GENERIC_PAGES:
        text, fetched = raw_text(url, index)
        parsed = parse_generic(text.splitlines(), default_kind, tags) if text else []
        if not parsed:
            errors.append(f"venues: không bóc được quán nào từ {url}")
        rows += [finish(row, url, fetched) for row in parsed]
    for url in NAME_ADDRESS_PAGES:
        text, fetched = raw_text(url, index)
        parsed = parse_name_address(text.splitlines()) if text else []
        if not parsed:
            errors.append(f"venues: không bóc được quán nào từ {url}")
        rows += [finish(row, url, fetched) for row in parsed]
    for url, start, stop in COLON_LIST_PAGES:
        text, fetched = raw_text(url, index)
        parsed = parse_colon_list(text.splitlines(), start, stop) if text else []
        if not parsed:
            errors.append(f"venues: không bóc được quán nào từ {url}")
        rows += [finish(row, url, fetched) for row in parsed]
    for row in MANUAL:
        text, fetched = raw_text(row["source_url"], index)
        if text is None or row["evidence"] not in text:
            errors.append(f"venues '{row['name']}': không thấy evidence trong {row['source_url']}")
            continue
        item = {k: v for k, v in row.items() if k not in ("source_url", "evidence")}
        rows.append(finish(item, row["source_url"], fetched))
    return rows
