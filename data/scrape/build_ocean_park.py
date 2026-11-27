"""Dựng data/ocean_park_places.json từ các trang đã cào bằng fetch_pages.py.

Mỗi địa điểm khai báo dữ kiện và một đoạn `evidence` chép nguyên văn từ trang nguồn.
Script kiểm đoạn đó còn nằm trong bản text đã tải; trang đổi nội dung thì báo lỗi
để nhóm cào lại và sửa số, thay vì giữ số cũ không còn căn cứ.

Chạy: python data/scrape/fetch_pages.py && python data/scrape/build_ocean_park.py
"""
import json
import re
from pathlib import Path
import sys
import unicodedata

import rides
import venues

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE.parent / "ocean_park_places.json"
VW = "https://vinwonders.com/vi/wonderpedia/news/"
OP1 = VW + "vinhomes-ocean-park-tron-bo-kinh-nghiem-vui-choi/"
OP3 = VW + "vinhomes-ocean-park-3-phia-dong-ha-noi/"
OCITY = VW + "ocean-city-phia-dong-ha-noi/"
WAVE = VW + "cong-vien-song-vinwonders-wave-park/"
WATER = VW + "vinwonders-water-park-gia-ve-gio-hoat-dong/"
WATER3 = VW + "cong-vien-nuoc-ocean-park-3-gia-ve-ha-noi/"
GW = VW + "review-grand-world-co-gi/"
GONDOLA = VW + "thuyen-gondola/"
GW_EN = "https://vinwonders.com/en/wonderpedia/news/grand-world-travel-guide/"
GREENSM = "https://www.greensm.com/vn-vi/news/bien-nhan-tao-vinhomes-ocean-park"
GREENSM_FOOD3 = "https://www.greensm.com/vn-vi/news/vinhomes-ocean-park-3-co-gi-an"
GREENSM_VINCOM = "https://www.greensm.com/vn-vi/news/vincom-mega-mall-vinhomes-ocean-park"
AQUA = VW + "aquafield-ocean-city-sauna-spa-ha-noi/"
FOOD_GW = VW + "an-gi-o-grand-world/"
OP2_EN = "https://vinwonders.com/en/wonderpedia/news/vinhomes-ocean-park-2-an-in-depth-review/"
MARKET = "https://market.vinhomes.vn/blog/tat-tan-tat-ve-ocean-city-choi-dau-an-gi-di-chuyen-the-nao"
MARKET_OP3 = "https://market.vinhomes.vn/en/blog/kham-pha-top-10-dia-diem-vui-choi-tai-vinhomes-ocean-park-3"
GREENSM_HOMESTAY = "https://www.greensm.com/vn-vi/news/homestay-ocean-park-gia-lam"
HUNG_YEN_EN = "https://vinwonders.com/en/wonderpedia/news/hung-yen-province-travel/"

# Lưu trú khai báo tay. confidence: "nguồn chính" (trang Vin/đối tác có số cụ thể) hoặc "thấp"
# (bài blog có khoảng giá rộng, lệch với bảng giá chính thức ở chỗ khác — cần kiểm lại trước khi dùng).
# staynfun.vinpearl.com chặn cả script và trình duyệt tự động (Cloudflare), nên không có giá StaynFun.
LODGING = [
    dict(name="StaynFun (homestay do Vinpearl quản lý)", kind="homestay", area="Ocean Park",
         address="Khu Ocean City, gần Grand World và VinWonders Wave Park & Water Park",
         price_min_vnd=None, price_max_vnd=None, price_note="Trang chính thức chặn cào; chưa có giá đã kiểm.",
         confidence="nguồn chính", source_url=HUNG_YEN_EN,
         evidence="This highly affordable option is within the urban area of Ocean City"),
    dict(name="Vinpearl Hotel Ocean Park", kind="khách sạn", area="Ocean Park", stars=4,
         address=None, price_min_vnd=1500000, price_max_vnd=3000000, price_note="VNĐ/đêm",
         confidence="thấp", source_url=MARKET_OP3,
         evidence="Vinpearl Hotel Ocean Park: 4 sao, giá 1.500.000-3.000.000 VNĐ/đêm"),
    dict(name="Ocean Garden Hotel", kind="khách sạn", area="Ocean Park", stars=3,
         address=None, price_min_vnd=800000, price_max_vnd=1500000, price_note="VNĐ/đêm",
         confidence="thấp", source_url=MARKET_OP3,
         evidence="Ocean Garden Hotel: 3 sao, giá 800.000-1.500.000 VNĐ/đêm"),
    dict(name="Biệt thự nguyên căn 4–5 phòng ngủ", kind="biệt thự", area="Ocean Park 3",
         address=None, price_min_vnd=2000000, price_max_vnd=5000000,
         price_note="VNĐ/đêm cho 8–12 người", confidence="thấp", source_url=MARKET_OP3,
         evidence="Giá: 2.000.000-5.000.000 VNĐ/đêm (cho 8-12 người)"),
    dict(name="Night Ocean Homestay", kind="homestay", area="Ocean Park 3", address=None,
         price_min_vnd=None, price_max_vnd=None,
         price_note="Phòng theo chủ đề Nhật Bản, Nhiệt Đới, Đại Dương; nguồn không nêu giá.",
         confidence="thấp", source_url=MARKET_OP3, evidence="Night Ocean Homestay"),
]

# estimated: các trường nguồn không nêu, nhóm tự ước tính (ghi rõ để không giả làm thật).
PLACES = [
    # ---------- Ocean Park 1 · Gia Lâm, Hà Nội ----------
    dict(area="Ocean Park 1", name="Biển hồ nước mặn Crystal Lagoon", category="trải nghiệm",
         open_hour=8, close_hour=18, duration_hours=2, estimated_cost_vnd=600000,
         weather_sensitive=True, tags=["biển", "bơi", "check-in"],
         price_note="Khách ngoài 600.000đ/người/lượt; cư dân 200.000đ.",
         source_url=GREENSM, evidence="Khách ngoài: 600.000 VNĐ/vé",
         estimated=["open_hour", "close_hour", "duration_hours"]),
    dict(area="Ocean Park 1", name="Hồ Ngọc Trai", category="tham quan",
         open_hour=6, close_hour=21, duration_hours=1.5, estimated_cost_vnd=0,
         weather_sensitive=True, tags=["dạo bộ", "đạp xe", "check-in", "miễn phí"],
         price_note="Không thu phí.", source_url=GREENSM,
         evidence="biển hồ Ngọc Trai không thu phí",
         estimated=["open_hour", "close_hour", "duration_hours"]),
    dict(area="Ocean Park 1", name="Chèo kayak hồ Ngọc Trai", category="trải nghiệm",
         open_hour=9, close_hour=17, duration_hours=1, estimated_cost_vnd=100000,
         weather_sensitive=True, tags=["kayak", "thể thao nước"],
         price_note="Kayak đơn 100.000đ/giờ, kayak đôi 200.000đ/giờ. Nghỉ 12:00–14:00.",
         source_url=OP1, evidence="100.000 VNĐ/kayak đơn/1 giờ", estimated=[]),
    dict(area="Ocean Park 1", name="Sàn câu cá hồ Ngọc Trai", category="trải nghiệm",
         open_hour=8, close_hour=18, duration_hours=1.5, estimated_cost_vnd=0,
         weather_sensitive=True, tags=["câu cá", "miễn phí"],
         price_note="Miễn phí. Mở 08:00–12:00 và 14:00–18:00; đăng ký trước 24 giờ.",
         source_url=OP1, evidence="Sàn câu cá tại hồ Ngọc Trai", estimated=["duration_hours"]),
    dict(area="Ocean Park 1", name="Vườn nướng BBQ Ocean Park 1", category="ăn uống",
         open_hour=10, close_hour=21.5, duration_hours=2, estimated_cost_vnd=200000,
         weather_sensitive=True, tags=["bbq", "nhóm bạn", "gia đình"],
         price_note="200.000đ/lượt 2 giờ cho tối đa 5 người, chưa gồm đồ nướng; quẹt thẻ tại cổng.",
         source_url=OP1, evidence="200.000 VNĐ/lượt/2 tiếng (không quá 5 người)", estimated=[]),
    dict(area="Ocean Park 1", name="Vincom Mega Mall Ocean Park", category="mua sắm",
         open_hour=10, close_hour=21.5, duration_hours=2, estimated_cost_vnd=0,
         weather_sensitive=False, tags=["mua sắm", "ăn uống", "trong nhà", "rạp phim"],
         price_note="Vào cửa miễn phí; ăn uống, mua sắm tự trả. Mở 10:00–21:30.",
         source_url=GREENSM_VINCOM,
         evidence="Giờ mở cửa của Vincom Mega Mall Ocean Park là 10h đến 21h30 mỗi ngày",
         estimated=["duration_hours"]),
    dict(area="Ocean Park 1", name="Bể bơi Bốn mùa Sapphire 2", category="trải nghiệm",
         open_hour=14, close_hour=21, duration_hours=1.5, estimated_cost_vnd=200000,
         weather_sensitive=False, tags=["bơi", "trong nhà"],
         price_note="Khách 200.000đ/vé, phải đi cùng và được cư dân bảo lãnh. Mở 06:00–12:00, 14:00–21:00.",
         source_url=OP1, evidence="200.000 VNĐ/vé/khách", estimated=["duration_hours"],
         requires_resident=True),
    dict(area="Ocean Park 1", name="Quảng trường Cá Voi", category="tham quan",
         open_hour=6, close_hour=21, duration_hours=0.5, estimated_cost_vnd=0,
         weather_sensitive=True, tags=["check-in", "sự kiện", "miễn phí"],
         price_note="Không thu phí; thường có sự kiện.",
         source_url=OP1, evidence="Tại quảng trường Cá Voi, thường xuyên diễn ra các sự kiện",
         estimated=["open_hour", "close_hour", "duration_hours", "estimated_cost_vnd"]),
    # ---------- Ocean Park 2 · Nghĩa Trụ, Hưng Yên ----------
    dict(area="Ocean Park 2", name="VinWonders Wave Park", category="công viên",
         open_hour=9, close_hour=18, duration_hours=4, estimated_cost_vnd=250000,
         weather_sensitive=True, tags=["biển tạo sóng", "trượt nước", "gia đình"],
         price_note="Vé vào cửa 250.000đ; combo Wave Park + Water Park 300.000đ. Kayak, xèng tính riêng.",
         source_url=WAVE, evidence="Giờ mở cửa: 9-18h hàng ngày", estimated=["duration_hours"]),
    dict(area="Ocean Park 2", name="Chèo kayak hồ Laguna (Wave Park)", category="trải nghiệm",
         open_hour=9, close_hour=18, duration_hours=1, estimated_cost_vnd=100000,
         weather_sensitive=True, tags=["kayak", "thể thao nước"],
         price_note="100.000đ/thuyền/giờ, tối đa 2 người lớn + 1 trẻ em; cần vé vào công viên.",
         source_url=WATER3, evidence="giá vé dịch vụ chèo thuyền Kayak là 100.000 VNĐ/thuyền",
         estimated=[]),
    dict(area="Ocean Park 2", name="Little Hong Kong", category="tham quan",
         open_hour=9, close_hour=21, duration_hours=1.5, estimated_cost_vnd=0,
         weather_sensitive=True, tags=["check-in", "ăn uống", "retro"],
         price_note="Phố thương mại mở; nguồn không nêu phí vào.",
         source_url=OCITY, evidence="Little Hong Kong là tọa độ mới toanh",
         estimated=["open_hour", "close_hour", "duration_hours", "estimated_cost_vnd"]),
    dict(area="Ocean Park 2", name="Quảng trường Kinh Đô Ánh Sáng", category="tham quan",
         open_hour=17, close_hour=21, duration_hours=1, estimated_cost_vnd=0,
         weather_sensitive=True, tags=["check-in", "3D mapping", "buổi tối"],
         price_note="Không thu phí; tháp tượng thần Ánh Sáng cao 50m, có 3D mapping.",
         source_url=OCITY, evidence="tháp tượng thần Ánh Sáng cao 50m",
         estimated=["open_hour", "close_hour", "duration_hours", "estimated_cost_vnd"]),
    # ---------- Ocean Park 3 · Nghĩa Trụ & Như Quỳnh, Hưng Yên ----------
    dict(area="Ocean Park 3", name="VinWonders Water Park", category="công viên",
         open_hour=9, close_hour=18, duration_hours=4, estimated_cost_vnd=250000,
         weather_sensitive=True, tags=["trượt nước", "bể bơi", "gia đình"],
         price_note="Vé vào cửa 250.000đ; combo với Wave Park 300.000đ.",
         source_url=WATER, evidence="Công viên mở cửa hằng ngày từ 09:00 đến 18:00",
         estimated=["duration_hours"]),
    dict(area="Ocean Park 3", name="Grand World · The Venice", category="tham quan",
         open_hour=9, close_hour=21, duration_hours=1.5, estimated_cost_vnd=0,
         weather_sensitive=True, tags=["check-in", "phố đi bộ", "buổi tối", "miễn phí"],
         price_note="Vào cổng miễn phí; Gondola, Carousel, thuê trang phục tính riêng.",
         source_url=GW_EN, evidence="Ticket fee: Free of charge",
         estimated=["open_hour", "close_hour", "duration_hours"]),
    dict(area="Ocean Park 3", name="Thuyền Gondola Grand World", category="trải nghiệm",
         open_hour=13, close_hour=18.5, duration_hours=0.5, estimated_cost_vnd=200000,
         weather_sensitive=True, tags=["gondola", "lãng mạn"],
         price_note="1 chiều kèm chụp ảnh 200.000đ, 2 chiều 300.000đ; tối đa 4 khách/thuyền. "
                    "T2–T6 09:00–12:00 và 13:00–18:30; cuối tuần 09:00–19:30.",
         source_url=GONDOLA, evidence="Thứ 2 – Thứ 6: 09:00 – 12:00 và 13:00 – 18:30",
         estimated=["duration_hours"]),
    dict(area="Ocean Park 3", name="Đu quay ngựa gỗ Carousel", category="trải nghiệm",
         open_hour=9, close_hour=21, duration_hours=0.5, estimated_cost_vnd=50000,
         weather_sensitive=False, tags=["trẻ em", "gia đình"],
         price_note="Người lớn 50.000đ; trẻ dưới 140cm và người từ 60 tuổi 30.000đ.",
         source_url=GW, evidence="người lớn (cao từ 140cm) là 50.000 VNĐ/vé",
         estimated=["open_hour", "close_hour", "duration_hours"]),
    dict(area="Ocean Park 3", name="Skydrop Grand World", category="trải nghiệm",
         open_hour=9, close_hour=21, duration_hours=0.5, estimated_cost_vnd=50000,
         weather_sensitive=True, tags=["cảm giác mạnh"],
         price_note="Vé tiêu chuẩn 50.000đ.",
         source_url=GONDOLA, evidence="[Grand World] Vé trò chơi Skydrop tiêu chuẩn",
         estimated=["open_hour", "close_hour", "duration_hours"]),
    dict(area="Ocean Park 3", name="Phố Hàn K-Town", category="tham quan",
         open_hour=9, close_hour=21, duration_hours=1.5, estimated_cost_vnd=0,
         weather_sensitive=True, tags=["check-in", "ẩm thực Hàn", "mua sắm"],
         price_note="Thuộc Grand World, vào cổng miễn phí.",
         source_url=OP3, evidence="phân khu phố Hàn K-Town",
         estimated=["open_hour", "close_hour", "duration_hours", "estimated_cost_vnd"]),
    dict(area="Ocean Park 3", name="Hồ nước mặn Tropical Lagoon", category="trải nghiệm",
         open_hour=8, close_hour=18, duration_hours=1.5, estimated_cost_vnd=0,
         weather_sensitive=True, tags=["biển", "kayak", "lướt ván"],
         price_note="Hồ nước mặn 2,8ha; nguồn không nêu giá.",
         source_url=OP3, evidence="hồ nước mặn rộng đến 2,8ha",
         estimated=["open_hour", "close_hour", "duration_hours", "estimated_cost_vnd"]),
    # ---------- Bổ sung đợt cào 2 ----------
    dict(area="Ocean Park 2", name="Aquafield Ocean City (Sauna & Spa)", category="thư giãn",
         open_hour=10, close_hour=22, duration_hours=4, estimated_cost_vnd=600000,
         weather_sensitive=False, tags=["xông hơi", "spa", "trong nhà", "trời mưa"],
         price_note="Vé xông hơi tiêu chuẩn 4 tiếng 600.000đ; combo kèm massage Vincharm 1.260.000đ. "
                    "T2–T6 10:00–22:00, T7–CN 09:30–22:00. Tầng 2 Vincom Mega Mall Ocean City.",
         source_url=AQUA, evidence="Ngày trong tuần (T2 – T6): 10:00 – 22:00", estimated=[]),
    dict(area="Ocean Park 2", name="Phố ẩm thực đêm Little Hong Kong", category="ăn uống",
         open_hour=16, close_hour=22, duration_hours=1.5, estimated_cost_vnd=100000,
         weather_sensitive=True, tags=["ăn tối", "ẩm thực Hong Kong", "buổi tối"],
         price_note="Món từ 100.000đ đến 400.000đ; mở 16:00–22:00.",
         source_url=MARKET, evidence="Phố ẩm thực đêm Little Hongkong mở cửa từ 16h - 22h",
         estimated=["duration_hours"]),
    dict(area="Ocean Park 2", name="Đại lộ Kinh Đô (Kingdom Avenue)", category="tham quan",
         open_hour=9, close_hour=21, duration_hours=1.5, estimated_cost_vnd=0,
         weather_sensitive=True, tags=["phố đi bộ", "ăn uống", "rạp phim", "khu trò chơi"],
         price_note="Phố thương mại phong cách Paris–Rome, có nhà hàng, rạp phim, khu trò chơi.",
         source_url=OP2_EN, evidence="The Kingdom Avenue exudes a distinct charm",
         estimated=["open_hour", "close_hour", "duration_hours", "estimated_cost_vnd"]),
    dict(area="Ocean Park 2", name="Công viên Empire Park", category="tham quan",
         open_hour=6, close_hour=21, duration_hours=1, estimated_cost_vnd=0,
         weather_sensitive=True, tags=["công viên", "dã ngoại", "trẻ em", "miễn phí"],
         price_note="Công viên 7,5ha có sân chơi trẻ em, sân thể thao, chỗ dã ngoại.",
         source_url=OP2_EN, evidence="Covering an expansive 7.5 hectares, the Empire Park",
         estimated=["open_hour", "close_hour", "duration_hours", "estimated_cost_vnd"]),
    dict(area="Ocean Park 2", name="Công viên Silk Park", category="tham quan",
         open_hour=6, close_hour=21, duration_hours=1, estimated_cost_vnd=0,
         weather_sensitive=True, tags=["công viên", "dạo bộ", "miễn phí"],
         price_note="Dải công viên ven kênh dài 2,6km.",
         source_url=OP2_EN, evidence="Stretching over 2.6 kilometers",
         estimated=["open_hour", "close_hour", "duration_hours", "estimated_cost_vnd"]),
    dict(area="Ocean Park 3", name="Show The Grand Voyage", category="show",
         open_hour=19, close_hour=20, duration_hours=0.5, estimated_cost_vnd=0,
         weather_sensitive=True, tags=["show", "3D mapping", "buổi tối", "miễn phí"],
         price_note="Diễn 19:00 hằng ngày trên sân khấu thuyền ngoài trời ở The Venice; "
                    "Grand World vào cổng miễn phí.",
         source_url=OP2_EN, evidence="It takes place daily at 7:00 PM",
         estimated=["duration_hours", "estimated_cost_vnd"]),
]

# Danh sách quán ăn: các trang có cấu trúc lặp (tên / Địa chỉ / Giờ / Mức giá) nên parse tự động.
FOOD_PAGES = [
    (GREENSM_FOOD3, "greensm_blocks", "Ocean Park 3"),
    (FOOD_GW, "vw_headings", "Ocean Park 3"),
    (OP1, "inline_list", "Ocean Park 1"),
    (OP2_EN, "en_table", "Ocean Park 2"),
]
TRANSPORT = [
    dict(code="E01", kind="bus có phí", route="Bến xe Mỹ Đình – KĐT Ocean Park",
         hours="05:00–21:00", price_vnd=8000, source_url=OP3, evidence="Bến xe Mỹ Đình – KĐT Ocean Park"),
    dict(code="E02", kind="bus có phí", route="Hào Nam (Ga Cát Linh) – KĐT Ocean Park",
         hours="05:00–22:00", price_vnd=8000, source_url=OP3,
         evidence="Hào Nam (Ga Cát Linh) – KĐT Ocean Park"),
    dict(code="E03", kind="bus có phí",
         route="TT Y tế dự phòng Cầu Diễn – Mỹ Đình (Hàm Nghi) – KĐT Ocean Park",
         hours="05:00–21:00", price_vnd=9000, source_url=OP3,
         evidence="TT Y tế dự phòng Cầu Diễn – Mỹ Đình (Hàm Nghi) – KĐT Ocean Park"),
    dict(code="OCT1", kind="bus miễn phí", route="KĐT Royal City – Times City – Ocean City",
         hours="06:00–23:59", price_vnd=0, source_url=OP3,
         evidence="KĐT Royal City – Times City – Ocean City"),
    dict(code="OCT2", kind="bus miễn phí", route="Nhà hát Lớn – Bờ Hồ – Ocean City",
         hours="08:00–23:59", price_vnd=0, source_url=OP3, evidence="Nhà hát Lớn – Bờ Hồ – Ocean City"),
    dict(code="OCP1", kind="bus nội khu miễn phí",
         route="Vòng 1 chiều Ocean Park 1, 8km, 35 phút, 10 phút/chuyến",
         hours="05:00–22:30", price_vnd=0, source_url=OP1, evidence="Tuyến bus số: OCP1"),
    dict(code="XE-DIEN-OC", kind="xe điện nội khu",
         route="Chạy quanh Ocean City (gọi 082 920 6666)", hours="",
         price_vnd=10000, price_note="10.000đ/người/điểm; tour 1 giờ 150.000đ (T2–T6), 200.000đ (cuối tuần)",
         source_url=OP2_EN, evidence="10,000 VND/ person/spot"),
]

# Điểm nhóm thêm ở commit 9832c08 (data/attractions_sample.json cũ). Không cào, chi phí tự ước tính,
# nên không qua bước kiểm evidence. "Mega Grand World" trùng "Grand World · The Venice" nên không thêm lại.
TEAM_PLACES = [
    dict(area="Ocean Park 1", name="Khuôn viên Đại học VinUni & Hồ Ngọc Trai", category="tham quan",
         open_hour=7.5, close_hour=18, duration_hours=2, estimated_cost_vnd=50000,
         weather_sensitive=True, tags=["check-in", "dạo bộ"], price_note="Chi phí tự ước tính.",
         estimated=["open_hour", "close_hour", "duration_hours", "estimated_cost_vnd"]),
    dict(area="Ocean Park 1", name="Bếp Thái Koh Yam (Hải Âu 01-01)", category="ăn uống",
         open_hour=10.5, close_hour=22, duration_hours=1.5, estimated_cost_vnd=180000,
         weather_sensitive=False, tags=["ăn trưa", "ăn tối", "trong nhà"],
         price_note="Chi phí tự ước tính.",
         estimated=["open_hour", "close_hour", "duration_hours", "estimated_cost_vnd"]),
    dict(area="Ocean Park 1", name="Làng gốm cổ Bát Tràng", category="trải nghiệm",
         open_hour=8, close_hour=17.5, duration_hours=2, estimated_cost_vnd=150000,
         weather_sensitive=False, tags=["làm gốm", "trẻ em", "trong nhà"],
         price_note="Ngoài khu đô thị, cách VinUni khoảng 10 phút (theo nhóm); chi phí tự ước tính.",
         estimated=["open_hour", "close_hour", "duration_hours", "estimated_cost_vnd"]),
]

EVENTS = [
    dict(name="Mascot chào mừng", where="VinWonders Wave Park & Water Park",
         schedule="09:00–11:00 & 14:00–18:00 hằng ngày", source_url=WATER,
         evidence="09:00 – 11:00 & 14:00 – 18:00"),
    dict(name="Âm nhạc đường phố", where="Sân chơi nước Aqua (Water Park)",
         schedule="17:30–18:30 Thứ 7 & Chủ nhật", source_url=WATER,
         evidence="17:30 – 18:30 Thứ 7 & Chủ nhật"),
    dict(name="Carnival Wonders Summer", where="VinWonders Wave Park & Water Park",
         schedule="16:30 Thứ 7, Chủ nhật", source_url=WATER, evidence="Carnival Wonders Summer"),
    dict(name="Diễu hành Mascot Lalawonder", where="VinWonders Wave Park & Water Park",
         schedule="16:30 Thứ 2 – Thứ 6", source_url=WATER, evidence="16:30 từ Thứ 2 đến Thứ 6"),
    dict(name="Wonders Water War", where="VinWonders Wave Park & Water Park",
         schedule="16:00–17:30", source_url=WATER, evidence="Wonders Water War"),
    dict(name="The Grand Voyage", where="Sân khấu thuyền The Venice, Grand World (Ocean Park 3)",
         schedule="19:00 hằng ngày", source_url=OP2_EN, evidence="It takes place daily at 7:00 PM"),
    dict(name="Xiếc Journey to the Wonderland", where="Quảng trường Kinh Đô Ánh Sáng (Ocean Park 2)",
         schedule="nguồn không nêu giờ", source_url=OP2_EN, evidence="Journey to the Wonderland"),
    dict(name="Wave Park mở tham quan buổi tối", where="VinWonders Wave Park (Ocean Park 2)",
         schedule="18:00–21:00 cuối tuần và ngày lễ", source_url=OP2_EN,
         evidence="with sightseeing opportunities available from 6 PM to 9 PM"),
]


def _raw_text(url, index):
    slug = url.rstrip("/").rsplit("/", 1)[-1]
    row = next((r for r in index if r["slug"] == slug), None)
    if not row or row["status"] != "ok":
        return None, None
    return (RAW / f"{slug}.txt").read_text(encoding="utf-8"), row["fetched_at"]


def _food_kind(heading):
    low = heading.lower()
    if "nhậu" in low or "beer" in low:
        return "quán nhậu"
    if any(word in low for word in ("cafe", "café", "kafe", "cà phê", "trà sữa", "giải khát", "kem ")):
        return "cà phê / giải khát"
    if "quán ăn" in low:
        return "quán ăn"
    return "nhà hàng"


def _price_range(text):
    numbers = [int(n.replace(".", "").replace(",", "")) for n in re.findall(r"\d{1,3}(?:[.,]\d{3})+", text)]
    return (min(numbers), max(numbers)) if numbers else (None, None)


def _hours(text):
    match = re.search(r"(\d{1,2})[:h](\d{2})?\s*[–-]\s*(\d{1,2})[:h](\d{2})?", text)
    if not match:
        return None, None
    h1, m1, h2, m2 = match.groups()
    return int(h1) + int(m1 or 0) / 60, int(h2) + int(m2 or 0) / 60


def parse_greensm_blocks(lines):
    """'## Tên' rồi các dòng 'Địa chỉ:', 'Giờ mở cửa:', 'Mức giá:'."""
    rows, section = [], "nhà hàng"
    for i, line in enumerate(lines):
        if not line.startswith("## "):
            continue
        name = line[3:].strip()
        block = []
        for following in lines[i + 1:i + 6]:
            if following.startswith("## "):
                break
            block.append(following)
        address = next((b.split(":", 1)[1].strip() for b in block if b.startswith("Địa chỉ:")), None)
        if not address:
            section = _food_kind(name)
            continue
        hours = next((b.split(":", 1)[1] for b in block if b.startswith("Giờ mở cửa")), "")
        price = next((b for b in block if b.lower().startswith("mức giá")), "")
        low, high = _price_range(price)
        open_h, close_h = _hours(hours)
        rows.append(dict(name=name, kind=_food_kind(name) if _food_kind(name) != "nhà hàng" else section,
                         address=address, hours=hours.strip() or None,
                         open_hour=open_h, close_hour=close_h,
                         price_min_vnd=low, price_max_vnd=high, evidence=line))
    return rows


def parse_vw_headings(lines):
    """'## 1.2. Tên' (đôi khi 'Câu hỏi? – Tên') rồi dòng 'Địa chỉ:'; mục cha '## 3. ...' cho biết loại."""
    rows, section = [], "nhà hàng"
    for i, line in enumerate(lines):
        top = re.match(r"## \d+\. (.+)", line)
        if top:
            section = _food_kind(top.group(1))
            continue
        sub = re.match(r"## \d+\.\d+\. (.+)", line)
        if sub and i + 1 < len(lines) and lines[i + 1].startswith("Địa chỉ:"):
            name = re.sub(r"^Ghé quán ", "", sub.group(1).split("– ")[-1].strip())
            rows.append(dict(name=name, kind=section, address=lines[i + 1].split(":", 1)[1].strip(),
                             evidence=line))
    return rows


def parse_inline_list(lines):
    """Mục 'Ăn gì ...': các dòng 'Nhà hàng X: địa chỉ' / 'Quán X: địa chỉ'."""
    rows, inside = [], False
    for line in lines:
        if line.startswith("## "):
            inside = "Ăn gì" in line
            continue
        if inside and re.match(r"(Nhà hàng|Quán) ", line) and ": " in line:
            name, address = line.split(": ", 1)
            rows.append(dict(name=name.strip(), kind=_food_kind(name), address=address.rstrip("."),
                             evidence=line))
    return rows


def parse_en_table(lines):
    """Bảng 'Restaurant / Address / Must-try dishes', mỗi quán 3 dòng."""
    start = lines.index("Must-try dishes") + 1
    rows = []
    for i in range(start, len(lines) - 2, 3):
        if lines[i].startswith("A variety"):
            break
        rows.append(dict(name=lines[i], kind="nhà hàng", address=lines[i + 1],
                         must_try=lines[i + 2], evidence=lines[i]))
    return rows


PARSERS = {"greensm_blocks": parse_greensm_blocks, "vw_headings": parse_vw_headings,
           "inline_list": parse_inline_list, "en_table": parse_en_table}


FILLER = {"nha", "hang", "quan", "ca", "phe", "cafe", "the", "gioi", "ghe", "de"}


def _food_key(name):
    """Khóa gộp: bỏ dấu và các chữ đệm ('Nhà hàng', 'Ghé quán', 'Thế giới', 'de')."""
    folded = unicodedata.normalize("NFD", name.lower().replace("đ", "d"))
    folded = "".join(c for c in folded if not unicodedata.combining(c))
    return " ".join(w for w in re.findall(r"[a-z0-9]+", folded) if w not in FILLER)


def parse_homestay_blocks(lines):
    """GreenSM: '## Tên' rồi 'Địa chỉ:' và 'Giá tham khảo:' (có thể tách ngày thường / cuối tuần)."""
    rows = []
    for i, line in enumerate(lines):
        if not line.startswith("## ") or i + 2 >= len(lines):
            continue
        address, price = lines[i + 1], lines[i + 2]
        if not (address.startswith("Địa chỉ:") and price.startswith("Giá tham khảo:")):
            continue
        address = address.split(":", 1)[1].strip().rstrip(".")
        weekday, _, weekend = price.split(":", 1)[1].partition("ngày thường")
        low, high = _price_range(weekday)
        weekend_low, weekend_high = _price_range(weekend)
        rows.append(dict(name=line[3:].strip(), kind="homestay",
                         area="Ocean Park 2" if "Ocean Park 2" in address else "Ocean Park 1",
                         address=address, price_min_vnd=low,
                         price_max_vnd=high if high != low or "–" in weekday else None,
                         weekend_price_min_vnd=weekend_low, weekend_price_max_vnd=weekend_high,
                         price_note=price.split(":", 1)[1].strip(), confidence="nguồn chính",
                         source_url=GREENSM_HOMESTAY))
    return rows


def build_lodging(index, errors):
    text, fetched = _raw_text(GREENSM_HOMESTAY, index)
    parsed = parse_homestay_blocks(text.splitlines()) if text else []
    if not parsed:
        errors.append(f"lodging: parser không bóc được homestay nào từ {GREENSM_HOMESTAY}")
    rows = [dict(row, fetched_at=fetched) for row in parsed]
    for row in LODGING:
        text, fetched = _raw_text(row["source_url"], index)
        if text is None or row["evidence"] not in text:
            errors.append(f"lodging '{row['name']}': không thấy evidence trong {row['source_url']}")
            continue
        rows.append(dict(row, fetched_at=fetched))
    return rows


def build_restaurants(index):
    merged = {}
    for url, parser, area in FOOD_PAGES:
        text, fetched = _raw_text(url, index)
        if text is None:
            raise SystemExit(f"Chưa cào được {url}")
        rows = PARSERS[parser](text.splitlines())
        if not rows:
            raise SystemExit(f"Parser {parser} không bóc được quán nào từ {url} (trang đổi cấu trúc?)")
        for row in rows:
            row.pop("evidence")
            key = _food_key(row["name"])
            current = merged.setdefault(key, dict(area=area, sources=[]))
            for field, value in row.items():  # nguồn đầu tiên có dữ kiện thì giữ
                if value is not None and current.get(field) is None:
                    current[field] = value
            current["sources"].append({"url": url, "fetched_at": fetched})
    return sorted(merged.values(), key=lambda r: (r["area"], r["kind"], r["name"]))


def merge_venues(ocean_park_rows, extra_rows):
    """Gộp quán Ocean Park (parser riêng) với quán Hà Nội (parser chung) về cùng một khuôn.

    Trùng khi cùng tên (bỏ dấu, chữ đệm), cùng khu và cùng địa chỉ: chuỗi nhiều chi nhánh vẫn
    tách riêng, không lấy giờ / khu Vin của chi nhánh này gắn cho chi nhánh khác.
    """
    def address_key(row):
        return _food_key(row.get("address") or "")[:25]

    merged = {}
    for row in ocean_park_rows:
        area, district, vin_area = venues.locate(row.get("address"), row["area"])
        row = {field: row.get(field) for field in
               ("name", "kind", "address", "hours", "open_hour", "close_hour",
                "price_min_vnd", "price_max_vnd", "must_try")} | dict(
            area=area, district=district, vin_area=vin_area, tags=row.get("tags", []),
            open_late=venues.open_late(row.get("open_hour"), row.get("close_hour")),
            sources=row["sources"])
        merged[(_food_key(row["name"]), area, address_key(row))] = row
    for row in extra_rows:
        key = (_food_key(row["name"]), row["area"], address_key(row))
        current = merged.get(key)
        if current is None:
            merged[key] = row
            continue
        for field, value in row.items():
            if field == "sources":
                current["sources"] += value
            elif field == "tags":
                current["tags"] = list(dict.fromkeys(current["tags"] + value))
            elif value is not None and current.get(field) is None:
                current[field] = value
    return sorted(merged.values(), key=lambda r: (r["area"], r.get("district") or "", r["kind"],
                                                  r["name"]))


def main():
    index = json.loads((RAW / "index.json").read_text(encoding="utf-8"))
    errors, places, events, transport = [], [], [], []
    for kind, rows, out in (("place", PLACES, places), ("event", EVENTS, events),
                            ("transport", TRANSPORT, transport)):
        for row in rows:
            text, fetched = _raw_text(row["source_url"], index)
            if text is None or row["evidence"] not in text:
                label = row.get("name") or row.get("code")
                errors.append(f"{kind} '{label}': không thấy evidence trong {row['source_url']}")
                continue
            record = dict(row, fetched_at=fetched)
            if kind == "place":
                record = dict(city="Ocean Park", **record)
                record.setdefault("requires_resident", False)
                record["source"] = ("VinWonders/GreenSM, cào " + fetched[:10]
                                    + (" · tự ước tính: " + ", ".join(row["estimated"])
                                       if row["estimated"] else ""))
            out.append(record)
    places += [dict(city="Ocean Park", **row, requires_resident=False, source_url=None,
                    source="Nhóm thêm (commit 9832c08) · tự ước tính: " + ", ".join(row["estimated"]))
               for row in TEAM_PLACES]
    lodging = build_lodging(index, errors)
    extra_venues = venues.build(_raw_text, index, errors)
    park_catalog = rides.build(_raw_text, index, errors)
    if errors:
        print("\n".join(errors))
        sys.exit(1)
    restaurants = merge_venues(build_restaurants(index), extra_venues)
    payload = {"places": places, "events": events, "venues": restaurants,
               "lodging": lodging, "transport": transport, "park_catalog": park_catalog,
               "combo_tickets": [{"name": "Combo VinWonders Wave Park & Water Park",
                                  "price_vnd": 300000, "source_url": WAVE}]}
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Đã ghi {len(places)} địa điểm, {len(events)} sự kiện, {len(restaurants)} chỗ ăn chơi, "
          f"{len(lodging)} chỗ lưu trú, {len(transport)} tuyến di chuyển → {OUT}")


if __name__ == "__main__":
    main()
