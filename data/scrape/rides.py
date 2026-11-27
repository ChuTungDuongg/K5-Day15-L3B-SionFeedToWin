"""Danh mục trò chơi và bảng giá vé của VinWonders Wave Park (Ocean Park 2), Water Park (Ocean Park 3)
và các trò tính phí ở Grand World, dựng từ các trang đã cào.

- Bảng giá vé: trang quy định chính thức `vinwonders-wave-park-water-park-price-regulations`.
- Trò chơi: dòng "Tên trò: mô tả" trong các bài VinWonders; mỗi trò giữ một đoạn evidence nguyên văn.
- Giới hạn chiều cao TỪNG TRÒ: VinWonders không công bố cho Ocean Park; nội quy chỉ ghi khách tuân thủ
  quy định chiều cao của từng trò tại chỗ. Vì vậy `min_height_cm` để None, không tự đặt số.
  Nhãn `kid_zone`, `thrill`, `indoor` suy từ chính câu mô tả của nguồn (ghi trong `flags_from`).
"""
import re
import unicodedata

VW = "https://vinwonders.com/vi/wonderpedia/news/"
REGULATIONS = "https://vinwonders.com/vi/vinwonders-wave-park-water-park-price-regulations/"
WATER_TICKET = VW + "cong-vien-nuoc-ocean-park-3-gia-ve-ha-noi/"
WATER_REVIEW = VW + "vinwonders-water-park-gia-ve-gio-hoat-dong/"
WAVE_OP2 = VW + "bien-nhan-tao-vinhomes-ocean-park-2/"
WAVE_HY = VW + "bien-nhan-tao-hung-yen-vinwonders-wave-park/"
GONDOLA = VW + "thuyen-gondola/"
GW_REVIEW = VW + "review-grand-world-co-gi/"

WAVE, WATER, GW = "VinWonders Wave Park", "VinWonders Water Park", "Grand World"
AREA = {WAVE: "Ocean Park 2", WATER: "Ocean Park 3", GW: "Ocean Park 3"}

# Giá vé đọc từ bảng quy định chính thức; build kiểm từng con số còn trên trang.
TICKETS = [
    # (công viên, nhóm khách, ngày thường, cuối tuần & lễ)
    (WAVE, "≥140cm", 250000, 300000), (WAVE, "80–140cm", 150000, 210000),
    (WATER, "≥140cm", 250000, 300000), (WATER, "80–140cm", 150000, 210000),
    ("Combo Wave Park & Water Park", "≥140cm", 300000, 400000),
    ("Combo Wave Park & Water Park", "80–140cm", 230000, 280000),
]
TICKET_RULES = [
    dict(rule="Trẻ dưới 80cm vào cửa miễn phí", source_url=WAVE_HY, evidence="Trẻ <80cm: miễn phí"),
    dict(rule="Vé vào cổng gồm mọi trò ở tất cả khu trong giờ hoạt động; trò trúng thưởng, xèng, kayak, "
              "BBQ tính riêng", source_url=REGULATIONS,
         evidence="Giá vé vào cửa, thẻ hội viên không bao gồm các trò chơi hội chợ trúng thưởng"),
    dict(rule="Phụ thu khi trẻ vượt 140cm hoặc dùng vé ngày thường vào cuối tuần, lễ",
         source_url=REGULATIONS, evidence="Phụ thu chênh lệch chiều cao từ khách 80 – 140cm"),
    dict(rule="Vé không hoàn, không hủy, không đổi sang dịch vụ khác", source_url=REGULATIONS,
         evidence="Vé không được hoàn, hủy hoặc quy đổi thành dịch vụ khác."),
    dict(rule="Khách phải theo quy định chiều cao, sức khỏe và yêu cầu riêng của từng trò tại chỗ",
         source_url=REGULATIONS, evidence="về chiều cao, điều kiện sức khỏe và yêu cầu của từng trò ch"),
    dict(rule="Không mang đồ ăn, thức uống từ ngoài (trừ đồ của trẻ em, người ăn kiêng)",
         source_url=REGULATIONS, evidence="Đồ ăn, thức uống từ bên ngoài (trừ thực phẩm dành riêng cho trẻ em"),
]
ADD_ONS = [
    dict(park=WAVE, name="Chèo thuyền Kayak", price_vnd=100000, unit="thuyền/giờ"),
    dict(park=WATER, name="Chèo thuyền Kayak", price_vnd=100000, unit="thuyền/giờ"),
    dict(park=WATER, name="Dịch vụ bếp BBQ", price_vnd=100000, unit="4 tiếng"),
    dict(park=WAVE, name="Vé trò chơi trúng thưởng", price_vnd=20000, unit="lượt"),
    dict(park=WATER, name="Vé trò chơi trúng thưởng", price_vnd=20000, unit="lượt"),
    dict(park=WAVE, name="Xèng trò chơi gắp gấu", price_vnd=25000, unit="5 xèng"),
]

# Trang có danh sách "Tên: mô tả" (bóc tự động trong khoảng giữa hai tiêu đề).
LIST_SECTIONS = [
    (WATER, WATER_TICKET, "## 2.1.", "## 2.2."),
    (WATER, WATER_REVIEW, "## 4.1.", "## 4.5."),
]
# Trò không có dạng "Tên: mô tả", khai báo tay kèm evidence.
MANUAL = [
    dict(park=WAVE, name="Quần thể 6 bể tạo sóng", source_url=WAVE_OP2,
         evidence="quần thể 6 bể tạo sóng với bể lớn nhất có diện tích lên tới 5,4ha"),
    dict(park=WAVE, name="Hồ nước mặn Laguna", source_url=WAVE_OP2,
         evidence="hồ nước mặn Laguna lớn nhất châu Á"),
    dict(park=WAVE, name="Công viên cát Sandy Park", source_url=WAVE_OP2,
         evidence="công viên cát Sandy Park rộng 10.000m²"),
    dict(park=WAVE, name="Vịnh cầu trượt Tornado & Stormy Bay", source_url=WAVE_OP2,
         evidence="Chinh phục vịnh cầu trượt Tornado & Stormy Bay", thrill=True),
    dict(park=WAVE, name="Sân chơi nước trẻ em", source_url=WAVE_OP2,
         evidence="hai vịnh trượt nước và sân chơi nước dành cho trẻ em", kid_zone=True),
    dict(park=WAVE, name="Cụm trò chơi tương tác nước", source_url=WAVE_OP2,
         evidence="bắn súng nước, xích đu nước và ném bóng nước"),
    dict(park=WAVE, name="Tổ hợp trò chơi trên không (Xích đu vòng tròn, Zipline, Magic Bike)",
         source_url=WAVE_HY, evidence="Xích đu vòng tròn, Zipline và Magic Bike", thrill=True),
    dict(park=WAVE, name="Tổ hợp trò chơi trong nhà (bóng rổ, khúc côn cầu, bowling)",
         source_url=WAVE_HY, evidence="bóng rổ, khúc côn cầu, bowling, vua đập búa", indoor=True),
    dict(park=GW, name="Thuyền Gondola", source_url=GONDOLA,
         evidence="Thời gian mỗi lượt du thuyền khoảng 10 phút (đi 1 chiều).",
         price_note="1 chiều 200.000đ, 2 chiều 300.000đ (kèm chụp ảnh); dưới 80cm miễn phí; "
                    "tối đa 4 khách/thuyền", duration_min=10),
    dict(park=GW, name="Đu quay ngựa gỗ Carousel", source_url=GW_REVIEW,
         evidence="người lớn (cao từ 140cm) là 50.000 VNĐ/vé",
         price_note="Người lớn 50.000đ; trẻ dưới 140cm và người từ 60 tuổi 30.000đ", kid_zone=True),
]

KID = re.compile(r"trẻ em|trẻ nhỏ|các bé|em bé|bạn nhỏ|kids|nhí", re.I)
THRILL = re.compile(r"cảm giác mạnh|độ dốc lớn|mạo hiểm|vòng xoáy", re.I)
INDOOR = re.compile(r"trong nhà|bốn mùa|4 mùa", re.I)


def _nfc(text):
    return unicodedata.normalize("NFC", text) if text else text


def _section(lines, start, stop):
    inside, out = False, []
    for line in lines:
        if line.startswith(start):
            inside = True
            continue
        if inside and line.startswith(stop):
            break
        if inside:
            out.append(line)
    return out


def _activity(park, name, description, url, fetched, **flags):
    text = f"{name} {description}"
    found = {"kid_zone": bool(KID.search(text)), "thrill": bool(THRILL.search(text)),
             "indoor": bool(INDOOR.search(text))}
    found.update({k: v for k, v in flags.items() if k in found})
    return dict(park=park, area=AREA[park], name=name, description=description[:240],
                included_in_ticket=park != GW, min_height_cm=None,
                height_note="Nguồn không công bố giới hạn chiều cao của trò này; theo nội quy, "
                            "tuân thủ biển báo và hướng dẫn viên tại chỗ.",
                price_note=flags.get("price_note"), duration_min=flags.get("duration_min"),
                flags_from="câu mô tả của nguồn" if not any(k in flags for k in found) else "khai báo tay",
                source_url=url, fetched_at=fetched, **found)


def build(raw_text, index, errors):
    """Trả {'tickets', 'ticket_rules', 'add_ons', 'activities'}; ghi lỗi nếu số liệu không còn trên trang."""
    reg, reg_fetched = raw_text(REGULATIONS, index)
    reg = _nfc(reg) or ""
    tickets = []
    for park, tier, weekday, weekend in TICKETS:
        for amount in (weekday, weekend):
            if f"{amount:,}".replace(",", ".") + " VND" not in reg:
                errors.append(f"rides: không thấy giá {amount} ({park} {tier}) trên {REGULATIONS}")
        tickets.append(dict(park=park, guest=tier, weekday_vnd=weekday, weekend_holiday_vnd=weekend,
                            source_url=REGULATIONS, fetched_at=reg_fetched))
    tickets.append(dict(park="Wave Park / Water Park", guest="<80cm", weekday_vnd=0,
                        weekend_holiday_vnd=0, source_url=WAVE_HY, fetched_at=None))
    rules = []
    for rule in TICKET_RULES:
        text, fetched = raw_text(rule["source_url"], index)
        if not text or rule["evidence"] not in _nfc(text):
            errors.append(f"rides: không thấy evidence quy định '{rule['rule']}'")
            continue
        rules.append(dict(rule=rule["rule"], source_url=rule["source_url"], fetched_at=fetched))
    add_ons = [dict(row, source_url=REGULATIONS, fetched_at=reg_fetched) for row in ADD_ONS]
    for row in ADD_ONS:
        if f"{row['price_vnd']:,}".replace(",", ".") + " VND" not in reg:
            errors.append(f"rides: không thấy giá dịch vụ {row['name']} trên {REGULATIONS}")

    activities = []
    for park, url, start, stop in LIST_SECTIONS:
        text, fetched = raw_text(url, index)
        lines = _section(_nfc(text or "").splitlines(), start, stop)
        found = 0
        for line in lines:
            match = re.match(r"([^:]{3,60}):\s*(.{10,})", line)
            if match and not line.startswith(("##", "*", "Lưu ngay", "Mách bạn", "Khám phá")):
                activities.append(_activity(park, match.group(1).strip(), match.group(2).strip(),
                                            url, fetched))
                found += 1
        if not found:
            errors.append(f"rides: không bóc được trò nào từ {url} ({start})")
    for row in MANUAL:
        text, fetched = raw_text(row["source_url"], index)
        if not text or row["evidence"] not in _nfc(text):
            errors.append(f"rides: không thấy evidence trò '{row['name']}'")
            continue
        flags = {k: v for k, v in row.items() if k not in ("park", "name", "source_url", "evidence")}
        activities.append(_activity(row["park"], row["name"], row["evidence"], row["source_url"],
                                    fetched, **flags))
    # Gộp trò trùng tên giữa hai trang của Water Park (giữ mô tả dài hơn, nối nguồn).
    # Trùng khi bộ từ khóa của tên này nằm trọn trong tên kia ("Bể bơi bốn mùa" ⊂
    # "Bể bơi bốn mùa & các phao…", "Aqua Bay" trong "Vịnh trượt nước Aqua Bay").
    merged = {}
    for row in activities:
        words = set(_key(row["name"]).split())
        key = next((k for k in merged if k[0] == row["park"]
                    and (words <= set(k[1].split()) or set(k[1].split()) <= words)), None)
        if key is None:
            key = (row["park"], _key(row["name"]))
        if key in merged:
            keep = merged[key]
            if len(row["description"]) > len(keep["description"]):
                keep["description"] = row["description"]
            for flag in ("kid_zone", "thrill", "indoor"):
                keep[flag] = keep[flag] or row[flag]
            keep.setdefault("also_in", []).append(row["source_url"])
        else:
            merged[key] = row
    return dict(tickets=tickets, ticket_rules=rules, add_ons=add_ons,
                activities=list(merged.values()))


def _key(name):
    folded = unicodedata.normalize("NFD", name.lower().replace("đ", "d"))
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    folded = re.sub(r"\b(vinh|duong truot|cam giac manh|be boi)\b", " ", folded)
    return " ".join(re.findall(r"[a-z0-9]+", folded))
