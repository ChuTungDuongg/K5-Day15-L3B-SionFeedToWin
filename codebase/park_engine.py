"""Lõi tính toán C1: đọc snapshot Công viên Mẫu, lập lịch và kiểm độc lập.

Không gọi model. Phút là số nguyên, tiền là số nguyên VND. `build_plan` tìm lịch bằng beam search
có giới hạn thời gian; chỉ trả INFEASIBLE khi có cơ sở (phép tính hoặc đã thử hết thứ tự các mục
bắt buộc), hết giờ mà chưa chứng minh thì trả SEARCH_TIMEOUT. `validate_plan` tính lại mọi ràng buộc
trên cùng snapshot và không tin số của bộ lập lịch.
"""
from functools import lru_cache
from itertools import permutations
import json
from pathlib import Path
import time as clock

DATA = Path(__file__).resolve().parents[1] / "data"
MOCK_FILE = "cong_vien_mau.json"
MOCK_PARK = "Công viên Mẫu"
ADULT_HEIGHT = 150  # người lớn không ghi chiều cao: coi như đủ mọi giới hạn chiều cao trẻ em
BEAM_WIDTH = 400
TIME_LIMIT_S = 2.0


@lru_cache
def snapshot():
    return json.loads((DATA / MOCK_FILE).read_text(encoding="utf-8"))


def to_min(text):
    hours, minutes = text.split(":")
    return int(hours) * 60 + int(minutes)


def to_hhmm(minutes):
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def walk(a, b):
    if a == b:
        return 0
    table = snapshot()["walk_minutes"]
    return table.get(a, {}).get(b) or table.get(b, {}).get(a)


def activity(activity_id):
    return next((a for a in snapshot()["activities"] if a["id"] == activity_id), None)


def session(session_id):
    return next((s for s in snapshot()["shows"]["sessions"] if s["id"] == session_id), None)


def zone_name(zone):
    return snapshot()["zones"][zone]["name"]


def eligibility(act, members):
    """Danh sách lý do không đủ điều kiện (rỗng = cả nhóm chơi được). None điều kiện = thiếu dữ liệu."""
    if act["conditions"] is None:
        return [f"{act['name']}: thiếu dữ liệu điều kiện tham gia (MISSING_DATA)"]
    cond, problems = act["conditions"], []
    has_adult = any(m["kind"] == "adult" for m in members)
    for member in members:
        height = member.get("height_cm") or (ADULT_HEIGHT if member["kind"] == "adult" else None)
        age = member.get("age")
        if cond.get("min_height_cm") and (height is None or height < cond["min_height_cm"]):
            problems.append(f"{member['label']} cao {height}cm < {cond['min_height_cm']}cm yêu cầu "
                            f"của {act['name']}" if height else
                            f"{member['label']} chưa có chiều cao để kiểm {act['name']}")
        if cond.get("min_age") and member["kind"] == "child" and (age is None or age < cond["min_age"]):
            problems.append(f"{member['label']} {age} tuổi < {cond['min_age']} tuổi yêu cầu của {act['name']}")
        below = cond.get("adult_required_below_cm")
        if below and member["kind"] == "child" and height and height < below and not has_adult:
            problems.append(f"{member['label']} dưới {below}cm cần người lớn đi cùng ở {act['name']}")
    return problems


def gate_cost(members):
    lines = {}
    for member in members:
        height = member.get("height_cm")
        if member["kind"] == "adult" or (height or 0) >= 140:
            tier, price = "người lớn", 300000
        elif height is not None and height < 100:
            tier, price = "miễn phí", 0
        else:
            tier, price = "trẻ em", 175000
        count, total = lines.get(tier, (0, 0))
        lines[tier] = (count + 1, total + price)
    return lines


def overlaps(start, end, windows):
    return any(start < to_min(b) and end > to_min(a) for a, b in windows)


# ---------------------------------------------------------------- lập lịch
def _show_options(req):
    shows = snapshot()["shows"]
    wanted = req.get("show")
    if not wanted:
        return []
    start, end = (to_min(x) for x in req["window"])
    sessions = [s for s in shows.get("sessions", []) if s.get("start") and s.get("end")
                and s["id"] not in req.get("cancelled_sessions", [])]
    sessions = [s for s in sessions if to_min(s["start"]) >= start and to_min(s["end"]) <= end]
    mode = wanted["mode"]
    if mode == "at":
        return [s for s in sessions if s["start"] == wanted["time"]]
    if mode == "between":
        a, b = (to_min(x) for x in wanted["range"])
        return [s for s in sessions if a <= to_min(s["start"]) <= b]
    if mode == "first_after":
        later = [s for s in sessions if to_min(s["start"]) >= to_min(wanted["time"])]
        return later[:1]
    if mode == "last":
        return sessions[-1:]
    return sessions  # "first" / "any": chọn suất sớm nhất kịp


def _value(act, req):
    prefer = req.get("prefer", {})
    if prefer.get("max_count"):
        return 1000 - act["wait_min"] - act["duration_min"]
    value = act["duration_min"] * 2 - act["wait_min"]
    if prefer.get("light") and act.get("intensity") == "nhẹ":
        value += act["duration_min"]
    if prefer.get("water") and "nước" in act["tags"]:
        value += 60
    if prefer.get("indoor") and act["indoor"]:
        value += 60
    if prefer.get("popular") and act["popular"]:
        value += 80
    if req.get("preferred_activity") == act["id"]:
        value += 1000  # Ưu tiên đưa lựa chọn của model vào lịch nếu đủ giờ và ngân sách.
    return value


def _lunch_slot(t, zone, lunch, deadline):
    start = max(t + walk(zone, "FOOD"), to_min(lunch["window"][0]))
    end = start + lunch["min_duration"]
    return (start, end) if end <= min(to_min(lunch["window"][1]), deadline) else None


def _can_finish(t, zone, state, req, options, deadline):
    """Còn kịp các mục bắt buộc chưa làm? Thử hết thứ tự (tối đa vài mục), dùng cho cắt nhánh."""
    end = to_min(req["window"][1])
    pending = [("show", None)] if (req.get("show") or {}).get("required") and not state["show"] else []
    if req.get("lunch") and not state["lunch"]:
        pending.append(("lunch", None))
    pending += [("act", a) for a in req.get("required_activities", []) if a not in state["done"]]
    for order in permutations(pending):
        if clock.perf_counter() >= deadline:
            return True  # Để vòng tìm kiếm xử lý hết giờ, chưa thể loại nhánh này.
        ok, cur_t, cur_z, show_seen = True, t, zone, state["show"]
        for kind, ref in order:
            if kind == "lunch":
                if req["lunch"].get("before_show") and show_seen:
                    ok = False
                    break
                slot = _lunch_slot(cur_t, cur_z, req["lunch"], end)
                if not slot:
                    ok = False
                    break
                cur_t, cur_z = slot[1], "FOOD"
            elif kind == "show":
                arrive = cur_t + walk(cur_z, "STAGE")
                choice = next((s for s in options
                               if arrive <= to_min(s["start"]) - snapshot()["shows"]["arrive_early_min"]), None)
                if not choice:
                    ok = False
                    break
                cur_t, cur_z, show_seen = to_min(choice["end"]), "STAGE", True
            else:
                act = activity(ref)
                start = cur_t + walk(cur_z, act["zone"])
                cur_t, cur_z = start + act["wait_min"] + act["duration_min"], act["zone"]
                if cur_t > end:
                    ok = False
                    break
        if ok:
            return True
    return False


def build_plan(req):
    """Trả {'status', 'items', 'reason', 'proven'}; items theo thứ tự thời gian."""
    snap = snapshot()
    start, end = to_min(req["window"][0]), to_min(req["window"][1])
    start, end = max(start, to_min(snap["open"])), min(end, to_min(snap["close"]))
    if end <= start:
        return {"status": "INFEASIBLE", "items": [], "proven": True,
                "reason": "Khung giờ không giao với giờ mở cửa "
                          f"{snap['open']}–{snap['close']} của {MOCK_PARK}."}
    req = dict(req, window=[to_hhmm(start), to_hhmm(end)])
    for ref in req.get("required_activities", []):
        act = activity(ref)
        if act is None or act.get("surcharge_vnd") is None:
            name = act["name"] if act else ref
            return {"status": "MISSING_DATA", "items": [], "proven": False,
                    "reason": f"Catalog thiếu giá cho hoạt động bắt buộc {name}."}
    show = req.get("show") or {}
    sessions = snap["shows"].get("sessions", [])
    scheduled = [s for s in sessions if s.get("start") and s.get("end")]
    if show.get("required") and (not scheduled or
            (show["mode"] == "at" and not any(s["start"] == show["time"] for s in scheduled))):
        return {"status": "MISSING_DATA", "items": [], "proven": False,
                "reason": "Snapshot chưa có dữ liệu cho suất diễn bắt buộc."}
    options = _show_options(req)
    if (req.get("show") or {}).get("required") and not options:
        return {"status": "INFEASIBLE", "items": [], "proven": True,
                "reason": "Không có suất diễn nào khớp yêu cầu trong khung giờ (hoặc suất đó đã huỷ)."}
    members = req["members"]
    pool = [a for a in snap["activities"]
            if a.get("surcharge_vnd") is not None and not eligibility(a, members)
            and a["id"] not in req.get("exclude", [])]
    if req.get("prefer", {}).get("indoor_only"):
        pool = [a for a in pool if a["indoor"]]
    # Trò bắt buộc vẫn được đưa vào kể cả khi không đủ điều kiện: validator sẽ báo vi phạm,
    # để phụ huynh thấy căn cứ thay vì trò bị lặng lẽ bỏ đi.
    pool_ids = sorted({a["id"] for a in pool} | set(req.get("required_activities", [])))
    budget = req["budget_vnd"]
    fixed = (sum(total for _, total in gate_cost(members).values()) if req.get("include_gate") else 0)
    lunch_cost = len(members) * snap["prices"]["lunch_per_person_vnd"] if req.get("lunch") else 0
    deadline = clock.perf_counter() + TIME_LIMIT_S
    init = {"t": start, "zone": req.get("start_zone", "GATE"), "done": frozenset(), "cost": fixed,
            "show": False, "lunch": False, "score": 0, "items": []}
    beam, finished, timed_out = [init], [], False
    for _ in range(24):
        nxt = []
        for state in beam:
            if clock.perf_counter() >= deadline:
                timed_out = True
                break
            reserve = 0 if state["lunch"] else lunch_cost
            if ((state["show"] or not (req.get("show") or {}).get("required"))
                    and (state["lunch"] or not req.get("lunch"))
                    and all(a in state["done"] for a in req.get("required_activities", []))):
                finished.append(state)
            # 1) hoạt động
            for act in [activity(i) for i in pool_ids if i not in state["done"]]:
                if act is None:
                    continue
                s = state["t"] + walk(state["zone"], act["zone"])
                e = s + act["wait_min"] + act["duration_min"]
                if e > end or (not act["indoor"] and overlaps(s, e, req.get("rain", []))):
                    continue
                cost = state["cost"] + act["surcharge_vnd"]
                if cost + reserve > budget:
                    continue
                new = dict(state, t=e, zone=act["zone"], done=state["done"] | {act["id"]}, cost=cost,
                           score=state["score"] + _value(act, req) - walk(state["zone"], act["zone"]),
                           items=state["items"] + [{"kind": "activity", "id": act["id"], "zone": act["zone"],
                                                    "start": to_hhmm(s), "end": to_hhmm(e)}])
                if _can_finish(e, act["zone"], new, req, options, deadline):
                    nxt.append(new)
            # 2) show
            if req.get("show") and not state["show"] and not (
                    (req.get("lunch") or {}).get("before_show") and not state["lunch"]):
                arrive = state["t"] + walk(state["zone"], "STAGE")
                for ses in options:
                    if arrive > to_min(ses["start"]) - snap["shows"]["arrive_early_min"]:
                        continue
                    new = dict(state, t=to_min(ses["end"]), zone="STAGE", show=True,
                               score=state["score"],
                               items=state["items"] + [{"kind": "show", "id": ses["id"], "zone": "STAGE",
                                                        "start": ses["start"], "end": ses["end"]}])
                    if _can_finish(new["t"], "STAGE", new, req, options, deadline):
                        nxt.append(new)
            # 3) ăn trưa
            if req.get("lunch") and not state["lunch"]:
                slot = _lunch_slot(state["t"], state["zone"], req["lunch"], end)
                if slot and state["cost"] + lunch_cost <= budget:
                    new = dict(state, t=slot[1], zone="FOOD", lunch=True, cost=state["cost"] + lunch_cost,
                               score=state["score"],
                               items=state["items"] + [{"kind": "lunch", "id": "LUNCH", "zone": "FOOD",
                                                        "start": to_hhmm(slot[0]), "end": to_hhmm(slot[1])}])
                    if _can_finish(slot[1], "FOOD", new, req, options, deadline):
                        nxt.append(new)
        if timed_out or not nxt:
            break
        nxt.sort(key=lambda s: (-s["score"], s["t"], [i["id"] for i in s["items"]]))
        seen, beam = set(), []
        for state in nxt:
            key = (state["done"], state["show"], state["lunch"], state["zone"], state["t"])
            if key not in seen:
                seen.add(key)
                beam.append(state)
            if len(beam) >= BEAM_WIDTH:
                break
    complete = [s for s in finished if (s["show"] or not (req.get("show") or {}).get("required"))
                and (s["lunch"] or not req.get("lunch"))]
    if complete:
        best = max(complete, key=lambda s: (s["score"], -s["t"]))
        return {"status": "FOUND", "items": best["items"], "proven": not timed_out, "reason": ""}
    if timed_out:
        return {"status": "SEARCH_TIMEOUT", "items": [], "proven": False,
                "reason": f"Bộ lập lịch hết {TIME_LIMIT_S:g} giây mà chưa tìm ra lịch; chưa chứng minh là không khả thi."}
    return {"status": "INFEASIBLE", "items": [], "proven": True,
            "reason": "Đã thử mọi thứ tự của các mục bắt buộc (show, ăn trưa, trò bắt buộc) "
                      "và không xếp vừa khung giờ cùng thời gian đi bộ, chờ."}


# ---------------------------------------------------------------- kiểm độc lập
def validate_plan(items, req):
    """Tính lại mọi ràng buộc trên snapshot; không dùng số do bộ lập lịch tính."""
    snap, members = snapshot(), req["members"]
    violations, breakdown = [], []
    win_start, win_end = to_min(req["window"][0]), to_min(req["window"][1])
    open_, close = to_min(snap["open"]), to_min(snap["close"])
    early = snap["shows"]["arrive_early_min"]
    cancelled = set(req.get("cancelled_sessions", []))
    t, zone = win_start, req.get("start_zone", "GATE")
    show_items, lunch_items = [], []
    for item in sorted(items, key=lambda i: to_min(i["start"])):
        s, e = to_min(item["start"]), to_min(item["end"])
        label = item.get("name") or item["id"]
        if s < max(win_start, open_) or e > min(win_end, close):
            violations.append(f"{label} {item['start']}–{item['end']} nằm ngoài khung giờ có mặt / giờ mở cửa")
        need = walk(zone, item["zone"])
        if need is None:
            violations.append(f"Không có dữ liệu đi bộ {zone} → {item['zone']}")
            need = 0
        if s < t + need and item["kind"] != "show":
            violations.append(f"{label} bắt đầu {item['start']} nhưng cần {need} phút đi bộ từ "
                              f"{zone_name(zone)} sau {to_hhmm(t)}")
        if item["kind"] == "activity":
            act = activity(item["id"])
            if act is None:
                violations.append(f"Hoạt động {item['id']} không có trong snapshot")
                continue
            violations += eligibility(act, members)
            if e - s < act["wait_min"] + act["duration_min"]:
                violations.append(f"{act['name']} cần {act['wait_min']} phút chờ + {act['duration_min']} phút chơi")
            if not act["indoor"] and overlaps(s, e, req.get("rain", [])):
                violations.append(f"{act['name']} ngoài trời trùng khoảng mưa")
            if act.get("surcharge_vnd") is None:
                violations.append(f"Catalog thiếu giá cho {act['name']}")
            elif act["surcharge_vnd"]:
                breakdown.append((f"Phụ thu {act['name']}", act["surcharge_vnd"]))
        elif item["kind"] == "show":
            ses = session(item["id"])
            if ses is None or (ses["start"], ses["end"]) != (item["start"], item["end"]):
                violations.append(f"Suất diễn {item['id']} {item['start']} không đúng lịch snapshot")
            if item["id"] in cancelled:
                violations.append(f"Suất diễn {item['start']} đã huỷ theo get_park_incidents")
            if t + need > s - early:
                violations.append(f"Đến sân khấu lúc {to_hhmm(t + need)}, muộn hơn giờ phải có mặt "
                                  f"{to_hhmm(s - early)} (đến sớm {early} phút)")
            if not snap["shows"]["indoor"] and overlaps(s, e, req.get("rain", [])):
                violations.append(f"Show ngoài trời {item['start']} trùng khoảng mưa")
            show_items.append(item)
        elif item["kind"] == "lunch":
            lunch = req.get("lunch") or {"min_duration": 0, "window": [req["window"][0], req["window"][1]]}
            if e - s < lunch["min_duration"]:
                violations.append(f"Ăn trưa {e - s} phút, cần liên tục ≥ {lunch['min_duration']} phút")
            if s < to_min(lunch["window"][0]) or e > to_min(lunch["window"][1]):
                violations.append(f"Ăn trưa {item['start']}–{item['end']} ngoài khoảng "
                                  f"{lunch['window'][0]}–{lunch['window'][1]}")
            lunch_items.append(item)
        t, zone = max(t, e), item["zone"]
    if (req.get("show") or {}).get("required") and not show_items:
        violations.append("Thiếu suất diễn bắt buộc")
    if req.get("lunch") and not lunch_items:
        violations.append("Thiếu khoảng ăn trưa bắt buộc")
    if (req.get("lunch") or {}).get("before_show") and show_items and lunch_items:
        if to_min(lunch_items[0]["end"]) + walk("FOOD", "STAGE") > to_min(show_items[0]["start"]) - early:
            violations.append("Ăn trưa không kết thúc kịp trước suất diễn (cộng đi bộ và đến sớm)")
    for required in req.get("required_activities", []):
        if not any(i["id"] == required for i in items):
            violations.append(f"Thiếu hoạt động bắt buộc {required}")
    if req.get("include_gate"):
        tiers = sorted(gate_cost(members).items(), key=lambda kv: ("người lớn", "trẻ em", "miễn phí").index(kv[0]))
        breakdown[:0] = [(f"Vé cổng {count} {tier}", total) for tier, (count, total) in tiers]
    if lunch_items:
        breakdown.append((f"Ăn trưa {len(members)} người", len(members) * snap["prices"]["lunch_per_person_vnd"]))
    total = sum(amount for _, amount in breakdown)
    if total > req["budget_vnd"]:
        violations.append(f"Tổng {total:,}đ vượt ngân sách {req['budget_vnd']:,}đ".replace(",", "."))
    return {"valid": not violations, "violations": list(dict.fromkeys(violations)),
            "total_vnd": total, "breakdown": breakdown, "snapshot_id": snap["snapshotId"]}
