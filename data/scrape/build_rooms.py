"""Dựng data/rooms_sample.json từ seed khách sạn của Vintrip (bản sao TripFlix).

Lấy các khách sạn trong seed cách tâm Ocean Park 1/2/3 không quá MAX_KM.
- Tên khách sạn, toạ độ: OpenStreetMap (mã node trong osm-hotel-sources.json) — thật.
- Hạng phòng, giá, gói giá, ngày hủy miễn phí: seed TripFlix tự sinh — `synthetic`.

Chạy: python data/scrape/build_rooms.py
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / "vintrip/be/apps/core-api/src/modules/commerce/db/seed"
OUT = ROOT / "data/rooms_sample.json"
MAX_KM = 3
# Tâm từng khu, đọc xấp xỉ từ bản đồ (tự ước tính).
CENTERS = {"Ocean Park 1": (20.993, 105.943), "Ocean Park 2": (20.968, 105.972),
           "Ocean Park 3": (20.965, 105.992)}
# Mã ngắn cho từng khách sạn để người dùng gõ mã phòng (vd AD-SUP).
SHORT = {"Ks Á Đông": ("AD", "Á Đông"), "Homestay HL": ("HL", "HL"),
         "Tiny Cozy House": ("TC", "Tiny Cozy"), "Khách sạn Melia Grand Hotel": ("MG", "Melia")}


# Hai hạng phòng nhóm thêm ở commit 9832c08 (homestay gần VinUni, giá tự ước tính) — giữ nguyên.
TEAM_ROOMS = [
    {"code": "OP-STUDIO", "city": "Ocean Park", "area": "Ocean Park 1",
     "hotel": "Masteri Waterfront Homestay", "name": "Studio Ocean Park",
     "nightly_rate_vnd": 650000, "change_surcharge_vnd": 0,
     "amenities": ["View VinUni", "Bếp riêng", "Check-in 24/7"],
     "source": "Nhóm thêm (commit 9832c08): tham khảo homestay gần VinUni (tự ước tính)"},
    {"code": "OP-LAGOON", "city": "Ocean Park", "area": "Ocean Park 1",
     "hotel": "Masteri Waterfront Homestay", "name": "Căn hộ View Biển Hồ",
     "nightly_rate_vnd": 1100000, "change_surcharge_vnd": 100000,
     "amenities": ["Ban công Hồ Ngọc Trai", "2 phòng ngủ", "Bể bơi 4 mùa"],
     "source": "Nhóm thêm (commit 9832c08): tham khảo homestay gần VinUni (tự ước tính)"},
]


def _km(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = (math.sin((lat2 - lat1) / 2) ** 2
         + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2)
    return 2 * 6371 * math.asin(math.sqrt(h))


def _round_10k(value):
    return int(round(value / 10000) * 10000)


def main():
    catalog = json.loads((SEED / "catalog.json").read_text(encoding="utf-8"))
    osm = json.loads((SEED / "osm-hotel-sources.json").read_text(encoding="utf-8"))
    rooms = []
    for hotel in catalog["hotels"]:
        if hotel.get("lat") is None:
            continue
        distance, area = min((_km((hotel["lat"], hotel["lng"]), center), name)
                             for name, center in CENTERS.items())
        if distance > MAX_KM:
            continue
        if hotel["name"] not in SHORT:
            raise SystemExit(f"Thêm mã ngắn cho khách sạn mới: {hotel['name']}")
        prefix, label = SHORT[hotel["name"]]
        for room in hotel["roomTypes"]:
            rooms.append({
                "code": f"{prefix}-{room['code']}",
                "city": "Ocean Park",
                "area": area,
                "hotel": hotel["name"],
                "hotel_id": hotel["id"],
                "stars": hotel["stars"],
                "distance_km": round(distance, 1),
                "check_in_time": hotel["checkInTime"],
                "name": f"{room['name']} {label}",
                "max_guests": room["maxGuests"],
                # Cùng công thức giá mặc định của seed-catalog.ts (basePrice × priceFactor, làm tròn 10k).
                "nightly_rate_vnd": _round_10k(hotel["basePrice"] * room["priceFactor"]),
                "change_surcharge_vnd": 0,
                "rate_plans": [{"code": plan["code"], "name": plan["name"],
                                "refundable": plan["refundable"],
                                "free_cancel_days": plan["freeCancelDays"]}
                               for plan in room["ratePlans"]],
                "amenities": room["details"].get("amenities", [])[:4],
                "nearby": [place["name"] for place in hotel["details"].get("nearby", [])[:3]],
                "source": (f"Tên, toạ độ: OpenStreetMap {osm.get(hotel['id'], '')}; hạng phòng, giá, "
                           "gói hủy: seed TripFlix (synthetic); phụ phí đổi phòng 0 (tự ước tính)"),
            })
    rooms.sort(key=lambda r: (r["distance_km"], r["code"]))
    rooms += TEAM_ROOMS
    if len({r["name"] for r in rooms}) != len(rooms):
        raise SystemExit("Tên hạng phòng bị trùng — công cụ đổi phòng cần tên duy nhất.")
    OUT.write_text(json.dumps(rooms, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Đã ghi {len(rooms)} hạng phòng của {len({r['hotel'] for r in rooms})} khách sạn → {OUT}")


if __name__ == "__main__":
    main()
