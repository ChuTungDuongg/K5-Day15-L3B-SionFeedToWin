"""Chấm hai metric bằng chứng C1 ngoại tuyến. Chạy: python eval/check_c1_run.py eval/run-4.csv"""
import argparse
import ast
from collections import defaultdict
import csv
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "codebase"))
from c1_flow import parse_members
from park_engine import to_min

SOURCE = "can_cu_co_trong_nguon"
VALID = "lich_valid_dung_rang_buoc"
TIME = r"\d{2}:\d{2}"
MONEY = r"[\d.]+"
STATUS = r"(?m)^Trạng thái: (VALID\b|CHƯA HỢP LỆ)"


def amounts(line):
    return [int(n.replace(".", "")) for n in re.findall(r"(\d[\d.]*)\s*(?:đồng|đ)\b", line)]


class Catalog:
    def __init__(self, snapshot):
        self.data = snapshot
        self.activities = {a["name"]: a for a in snapshot["activities"]}
        self.zones = {z["name"]: key for key, z in snapshot["zones"].items()}
        self.show = snapshot["shows"]
        self.sessions = {s["start"]: s["end"] for s in self.show["sessions"]}
        self.fares = {t["tier"]: t["price_vnd"] for t in snapshot["prices"]["gate"]}

    def walk(self, origin, destination):
        a, b = self.zones.get(origin), self.zones.get(destination)
        matrix = self.data["walk_minutes"]
        return matrix.get(a, {}).get(b, matrix.get(b, {}).get(a))

    def timeline(self, line, walks):
        interval, _, desc = line.partition(" · ")
        start, end = interval.split("–")
        duration = to_min(end) - to_min(start)
        if desc.startswith("đi bộ "):
            m = re.fullmatch(r"đi bộ (.+?) → (.+?) \((\d+) phút, estimate_walk\)", desc)
            if m:
                origin, dest, n = m.groups()
                return (duration == int(n) == self.walk(origin, dest)
                        and (origin, dest, int(n)) in walks)
        elif desc.startswith("Show "):
            return (self.sessions.get(start) == end and desc ==
                    f"Show {self.show['name']} suất {start} (có mặt trước {self.show['arrive_early_min']} phút)")
        elif desc.startswith("Ăn trưa "):
            zone = self.data["zones"][self.data["prices"]["lunch_zone"]]["name"]
            return duration > 0 and desc == f"Ăn trưa tại {zone} ({duration} phút liên tục)"
        else:
            name = desc.split(" (")[0]
            act = self.activities.get(name)
            if act:
                zone = self.data["zones"][act["zone"]]["name"]
                place = "trong nhà" if act["indoor"] else "ngoài trời"
                wait, play = act["wait_min"], act["duration_min"]
                fee = act["surcharge_vnd"]
                extra = f" · phụ thu {fee:,}đ".replace(",", ".") if fee else ""
                return (fee is not None and duration == wait + play and
                        desc == f"{name} ({zone}, {place}; chờ {wait} + chơi {play} phút){extra}")
        return False

    def price(self, label):
        if m := re.fullmatch(r"Vé cổng (\d+) (.+)", label):
            return int(m[1]) * self.fares.get(m[2], -1)
        if m := re.fullmatch(r"Ăn trưa (\d+) người", label):
            return int(m[1]) * self.data["prices"]["lunch_per_person_vnd"]
        return self.activities.get(label.removeprefix("Phụ thu "), {}).get("surcharge_vnd")

    def narrative(self, line, question, walks):
        """Kiểm các căn cứ nằm ngoài timeline, kể cả lịch cũ và phép tính trong văn xuôi."""
        history_label = "Giữ nguyên phần đã xong (theo phụ huynh kể, không lấy từ snapshot):"
        if line.startswith(history_label):
            copied = line.removeprefix(history_label).strip().removesuffix(".")
            histories = re.findall(
                r"\bhoàn thành(?: và được giữ nguyên gồm)?\s*:?\s*(.+?)(?:\.(?=\s|$)|$)",
                question, re.I | re.S,
            )
            return bool(copied) and copied in histories
        if any(s != self.data["snapshotId"] for s in re.findall(r"snapshot ([\w-]+)", line)):
            return False
        if line.startswith("Lịch show "):
            venue = self.data["zones"][self.show["venue_zone"]]["name"]
            return line.startswith(f"Lịch show {self.show['name']} tại {venue} (")
        if m := re.search(r"yêu cầu của (.+)\.$|^(.+) yêu cầu cao từ", line):
            return (m[1] or m[2]) in self.activities
        if "Phương án thay: bỏ " in line:
            return line.split("Phương án thay: bỏ ")[1].split(" (")[0] in self.activities
        for kind, t in re.findall(rf"(mở|đóng) cửa ({TIME})", line):
            if t != self.data["open" if kind == "mở" else "close"]:
                return False
        for times in re.findall(rf"(?:suất(?: còn chạy gần nhất:)?|show) ((?:{TIME}, )*{TIME}(?:–{TIME})?)", line, re.I):
            for slot in times.split(", "):
                start, _, end = slot.partition("–")
                if start not in self.sessions or (end and end != self.sessions[start]):
                    return False
        early = self.show["arrive_early_min"]
        if any(int(n) != early for n in re.findall(r"(?:có mặt trước|đến sớm) (\d+) phút", line)):
            return False
        if line.startswith("- Suất"):
            start, _, arrival = re.findall(TIME, line)
            return to_min(start) - early == to_min(arrival)
        if "không kịp: từ " in line:
            slot, start, arrival, deadline = re.findall(TIME, line)
            origin = line.split("từ ")[1].split(" lúc ")[0]
            stage = self.data["zones"][self.show["venue_zone"]]["name"]
            n = int(re.search(r"đi bộ (\d+) phút", line)[1])
            return ((origin, stage, n) in walks
                    and self.walk(origin, stage) == n == to_min(arrival) - to_min(start)
                    and to_min(deadline) == to_min(slot) - early and arrival > deadline)
        if "là điểm trong nhà gần nhất từ " in line:
            name, dest = line.removeprefix("Lý do: ").split(" là điểm trong nhà gần nhất từ ")
            origin, n = dest.rstrip(".").split(" (")
            act = self.activities.get(name)
            return bool(act and act["indoor"] and self.walk(origin, self.data["zones"][act["zone"]]["name"])
                        == int(n.split()[0]))
        if line.startswith(("Trò ", "Chưa đủ điều kiện:", "MISSING_DATA – catalog")) and ": " in line:
            entries = re.split(r"; (?![^()]*\))", line.split(": ", 1)[1].rstrip("."))
            for entry in entries:
                name = entry.split(" (")[0]
                if name not in self.activities:
                    return False
                cond = self.activities[name]["conditions"]
                if cond is None:
                    if not line.startswith("MISSING_DATA") or entry != name:
                        return False
                    continue
                limits = []
                if cond["min_height_cm"]:
                    limits.append(f"từ {cond['min_height_cm']}cm")
                if cond["min_age"]:
                    limits.append(f"từ {cond['min_age']} tuổi")
                if cond["adult_required_below_cm"]:
                    limits.append(f"dưới {cond['adult_required_below_cm']}cm cần người lớn đi cùng")
                if entry != f"{name} ({'; '.join(limits) or 'không giới hạn'})":
                    return False
            return True
        if line.startswith("Kiểm lịch có các trò bạn yêu cầu: "):
            return all(name in self.activities for name in line.split(": ")[1].rstrip(".").split(", "))
        if line.startswith("Bỏ ") and ": cộng thời gian chờ" in line:
            return all(name in self.activities for name in line[3:].split(":")[0].split(", "))
        if "thay bằng " in line and line.endswith(" (trong nhà)."):
            names = line.split("thay bằng ")[-1].removesuffix(" (trong nhà).").split(", ")
            return all(self.activities.get(name, {}).get("indoor") for name in names)
        if " bị huỷ (" in line:
            return any(f"suất {s['start']} bị huỷ ({i['reason']})" in line
                       for i in self.data["incidents_today"] for s in self.show["sessions"]
                       if s["id"] == i["session_id"])
        values = amounts(line)
        # Các lượt cũ hiển thị phần đã xong với nhãn không ghi nguồn.
        if line.startswith("Giữ nguyên phần đã xong:"):
            if line.split(": ", 1)[1].rstrip(".") not in question:
                return False
            for label, value in re.findall(rf"\((vé|phụ thu) ({MONEY}) đồng\)", line):
                if label == "vé":
                    total = 0
                    for member in parse_members(question)[1]:
                        height = member.get("height_cm")
                        if member["kind"] == "adult" or (height or 0) >= 140:
                            tier = "người lớn"
                        else:
                            tier = "miễn phí" if height is not None and height < 100 else "trẻ em"
                        total += self.fares[tier]
                    if total != int(value.replace(".", "")):
                        return False
                elif not any(a["surcharge_vnd"] == int(value.replace(".", "")) and
                             a["name"].lower().split(" – ")[0] in line.lower()
                             for a in self.activities.values()):
                    return False
            return True
        if not values:
            # Các dòng tự do mới có vẻ đưa ra căn cứ phải được rà lại, kể cả
            # khi logger lưu nguyên cùng một phát biểu trong CSV và trace.
            if re.search(r"\b(trò|show|suất|đi bộ|giá)\b", line, re.I):
                return line.startswith(("Trạng thái:", "Có các suất ", "Chọn suất ", "Gợi ý nới:",
                                        "Không có suất ", "Kiểm giờ ", "Show này ", "Trò phù hợp ",
                                        "Ưu tiên các trò ", "Bảng tiền "))
            return True
        if line.startswith("Ngân sách còn lại"):
            return (all(v in amounts(question) for v in values[:2]) and
                    (len(values) == 1 or len(values) == 3 and values[0] - values[1] == values[2]))
        if "Riêng vé " in line:
            members = parse_members(question)[1]
            fares = [int(n) * self.fares[tier.lower()] for n, tier in
                     re.findall(r"vé (\d+) (người lớn|trẻ em)", line, re.I)]
            lunch = len(members) * self.data["prices"]["lunch_per_person_vnd"]
            budget = re.search(rf"ngân sách ({MONEY})", question)
            if not budget:
                return False
            limit = int(budget[1].replace(".", ""))
            total = sum(fares) + lunch
            return values == [*fares, lunch, total, limit, total - limit]
        return False


def check_case(row, events, catalog):
    output = row["output"]
    source_errors, valid_errors = [], []
    finals = [e for e in events if e["kind"] == "final"]
    if len(finals) != 1 or finals[0].get("output") != output:
        source_errors.append("Output CSV khác kết quả cuối của trace")
        valid_errors.append("Không xác nhận được lịch hiển thị từ trace")
    validators, walks = [], set()
    for event in events:
        if event["kind"] != "tool":
            continue
        result = event["output"]
        snap = re.search(r"'snapshot_id': '([^']+)'", result)
        if snap and snap[1] != catalog.data["snapshotId"]:
            source_errors.append("Tool khác snapshot")
            continue
        if event["name"] in ("validate_park_plan", "estimate_walk"):
            try:
                data = ast.literal_eval(result)
            except (ValueError, SyntaxError):
                data = {}
            if event["name"] == "validate_park_plan":
                validators.append(data)
            elif data.get("snapshot_id") == catalog.data["snapshotId"]:
                walks.add((data.get("from_name"), data.get("to_name"), data.get("minutes")))
    if not output or row["error"] or not events:
        source_errors.append("Thiếu output/trace hoặc có lỗi kỹ thuật")
    if "Riêng vé " in output and not any(e["kind"] == "tool" and e.get("name") == "get_park_catalog"
                                         for e in events):
        source_errors.append("Giá đúng số học chưa có trace tra catalog trong câu")
    checks = iter(validators)
    parts = re.split(STATUS, output)
    for i in range(0, len(parts), 2):
        status = parts[i-1] if i else ""
        check = next(checks, {}) if status else {}
        valid = status == "VALID"
        if valid and (check.get("valid") is not True or check.get("violations") != []
                      or check.get("snapshot_id") != catalog.data["snapshotId"]):
            valid_errors.append("Thiếu validator đạt cùng snapshot cho lịch này")
        bill, totals, timeline = [], [], []
        budget = None
        for raw in parts[i].splitlines():
            line = raw.strip()
            try:
                if re.match(rf"{TIME}–", line):
                    ok = catalog.timeline(line, walks)
                    timeline.append(line[:11])
                    if valid and not ok:
                        valid_errors.append(line)
                elif line.startswith("Tổng"):
                    vals = amounts(line)
                    totals.append(vals[0])
                    budget = vals[2]
                    ok = len(vals) == 3 and vals[0] + vals[1] == budget and vals[1] >= 0
                    if valid and (not ok or vals[0] != check.get("total_vnd")):
                        valid_errors.append(line)
                elif raw.startswith("  ") and ":" in line:
                    label, price = line.split(": ", 1)
                    vals = amounts(price)
                    ok = vals == [catalog.price(label)]
                    bill.append((label, vals[0]))
                elif line.startswith("Kiểm độc lập:"):
                    ok = bool(totals) and amounts(line) == [totals[-1], budget]
                else:
                    ok = catalog.narrative(line, row["input"], walks)
            except (IndexError, ValueError, TypeError, AttributeError):
                ok = False
            if not ok:
                source_errors.append(line)
        if status and (bill != check.get("breakdown") or totals != [sum(n for _, n in bill)]):
            source_errors.append("Bảng tiền khác chi tiết validator hoặc tổng các dòng")
            if valid:
                valid_errors.append("Bảng tiền của lịch VALID không khớp")
        if valid and (totals != [check.get("total_vnd")] or not timeline
                      or any(t[:5] < catalog.data["open"] or t[6:] > catalog.data["close"]
                             for t in timeline)
                      or any(a[6:] > b[:5] for a, b in zip(timeline, timeline[1:]))):
            valid_errors.append("Thiếu/sai tổng, thiếu timeline, ngoài giờ mở cửa hoặc chồng giờ")
    return source_errors, valid_errors if "VALID" in parts[1::2] else None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("run", type=Path)
    parser.add_argument("--trace", type=Path)
    args = parser.parse_args()
    trace = args.trace or ROOT / "traces" / (args.run.stem + ".jsonl")
    events = defaultdict(list)
    for line in trace.read_text(encoding="utf-8").splitlines():
        event = json.loads(line)
        events[event["run_id"], event["case"]].append(event)
    catalog = Catalog(json.loads((ROOT / "data/cong_vien_mau.json").read_text(encoding="utf-8")))
    scores = {SOURCE: [], VALID: []}
    print("ID     | căn cứ | VALID | lý do")
    with args.run.open(encoding="utf-8-sig", newline="") as file:
        for row in csv.DictReader(file):
            src, val = check_case(row, events[row["run_id"], row["id"]], catalog)
            applicable = row["type"] in ("thuong", "kho")
            if applicable:
                scores[SOURCE].append(not src)
            if val is not None:
                scores[VALID].append(not val)
            print(row["id"], int(not src) if applicable else "—",
                  int(not val) if val is not None else "—", " / ".join(src + (val or [])), sep=" | ")
    for metric, results in scores.items():
        rate = f"{sum(results)/len(results):.1%}" if results else "—"
        print(f"{metric}  {sum(results)}/{len(results)}  {rate}")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
