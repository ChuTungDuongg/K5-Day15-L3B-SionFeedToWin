"""Bounded greedy planning, with fixed show/lunch anchors and independent validation."""
from copy import deepcopy
from time import monotonic

from park_validation import admission_cost, eligible, minute, plan_costs, validate, walk_minutes


def build(snapshot, request, max_seconds=0.25):
    deadline = monotonic() + max_seconds
    completed = deepcopy(request.get("completed", []))
    start = max(request.get("now", request["start"]), minute(snapshot["park"]["open"]))
    end = min(request["end"], minute(snapshot["park"]["close"]))
    current_zone = request.get("current_zone", snapshot["park"]["gate"])
    result = {"status": "SEARCH_TIMEOUT", "snapshotId": snapshot["snapshotId"],
              "isMock": snapshot["isMock"], "timeline": completed, "questions": [],
              "budget": request["budget"], "reasons": []}

    def stop(status, reason):
        result.update(status=status, reasons=[reason])
        return result

    if end <= start:
        return stop("INFEASIBLE", "Khung giờ có mặt không giao với giờ mở cửa.")
    if max_seconds <= 0:
        return stop("SEARCH_TIMEOUT", "Hết thời gian tìm lịch; chưa kết luận bất khả thi.")
    party = request["adults"] + len(request.get("kids", []))
    lunch_done = any(r.get("type") == "food" for r in completed)
    minimum = request.get("spent", 0) + (0 if request.get("tickets_paid") else admission_cost(snapshot, request))
    if request.get("lunch_minutes") and not lunch_done:
        minimum += party * snapshot["prices"]["lunch_per_person"]
    if minimum > request["budget"]:
        result.update(total=minimum, costs=[{"item": "Vé, ăn trưa và khoản đã chi tối thiểu", "amount": minimum}])
        return stop("INFEASIBLE", f"Tối thiểu {minimum:,} đ vượt ngân sách {request['budget']:,} đ; vượt {minimum-request['budget']:,} đ.")
    if request.get("min_rides", 0) * request.get("min_ride_minutes", 1) > end - start:
        return stop("INFEASIBLE", "Tổng thời lượng tối thiểu của số trò bắt buộc vượt khung giờ.")
    shows = {s["id"]: s for s in snapshot["shows"]}
    anchors = []
    for required in request.get("required_shows", []):
        if any(r.get("id") == required["id"] and r.get("start") == required["start"] for r in completed):
            continue
        show = shows.get(required["id"])
        if show is None:
            return stop("MISSING_DATA", "Không có show bắt buộc trong snapshot.")
        if any(c == required for c in request.get("cancelled_shows", [])):
            result["questions"] = ["Show bắt buộc bị huỷ. Bạn có chấp nhận bỏ yêu cầu này hoặc chọn suất khác không?"]
            return stop("NEEDS_INPUT", "Giữ yêu cầu bắt buộc; cần phụ huynh quyết định trước khi bỏ show.")
        begin = required["start"]
        if begin not in [minute(s) for s in show["slots"]]:
            return stop("MISSING_DATA", "Không có suất show yêu cầu trong dữ liệu.")
        if begin - show["early"] < start or begin + show["duration"] > end:
            return stop("INFEASIBLE", "Show bắt buộc nằm ngoài khung giờ có mặt.")
        if not show["indoor"] and any(begin < b and begin + show["duration"] > a for a, b in request.get("rain", [])):
            result["questions"] = ["Show bắt buộc ở ngoài trời trong khoảng mưa. Bạn muốn chọn suất khác không?"]
            return stop("NEEDS_INPUT", "Chưa bỏ show bắt buộc khi có mưa.")
        anchors.append({"type": "show", "id": show["id"], "name": show["name"],
                        "zone": show["zone"], "start": begin, "end": begin + show["duration"],
                        "early": show["early"], "note": "Suất bắt buộc; đến sớm theo catalog"})
    anchors.sort(key=lambda a: a["start"])
    if request.get("lunch_minutes") and not lunch_done:
        low, high = request.get("lunch_window", (max(start, 660), min(end, 840)))
        if request.get("lunch_before_show") and anchors:
            high = min(high, anchors[0]["start"])
        lunch = None
        for begin in range(max(start, low), high - request["lunch_minutes"] + 1):
            finish = begin + request["lunch_minutes"]
            previous = next((a for a in reversed(anchors) if a["end"] <= begin), None)
            following = next((a for a in anchors if a["start"] >= finish), None)
            if any(begin < a["end"] and finish > a["start"] - a["early"] for a in anchors):
                continue
            prev_zone, prev_end = (previous["zone"], previous["end"]) if previous else (current_zone, start)
            if begin < prev_end + walk_minutes(snapshot, prev_zone, snapshot["food_zone"]):
                continue
            if following and finish + walk_minutes(snapshot, snapshot["food_zone"], following["zone"]) + following["early"] > following["start"]:
                continue
            lunch = {"type": "food", "name": "Ăn trưa", "zone": snapshot["food_zone"],
                     "start": begin, "end": finish, "early": 0, "note": "Ăn liên tục"}
            break
        if lunch is None:
            return stop("SEARCH_TIMEOUT", "Thuật toán tham lam chưa ghép được bữa trưa và show; cần điều chỉnh yêu cầu.")
        anchors.append(lunch)
        anchors.sort(key=lambda a: a["start"])
    rows = deepcopy(completed)
    used = {r.get("id") for r in completed}
    interests = request.get("interests", ["nhe"])
    candidates = [a for a in snapshot["activities"] if a["id"] not in used
                  and a["min_age"] is not None and a["min_height"] is not None
                  and all(eligible(a, k) is True for k in request.get("kids", []))
                  and a["id"] not in request.get("closed_activities", [])]
    # shortcut: one greedy path with fixed anchors, no exhaustive proof of infeasibility.
    # The bounded demo never claims optimality; failure to pack returns SEARCH_TIMEOUT.
    def walk(to_zone):
        nonlocal start, current_zone
        duration = walk_minutes(snapshot, current_zone, to_zone)
        rows.append({"type": "walk", "name": f"Đi bộ {current_zone} → {to_zone}",
                     "from_zone": current_zone, "to_zone": to_zone, "start": start,
                     "end": start + duration, "note": f"{duration} phút theo ma trận mô phỏng"})
        start += duration
        current_zone = to_zone

    for anchor in anchors + [{"start": end, "zone": None, "early": 0}]:
        while monotonic() < deadline:
            possible = []
            for activity in candidates:
                if activity["id"] in used:
                    continue
                begin = start + walk_minutes(snapshot, current_zone, activity["zone"])
                finish = begin + activity["duration"] + activity["wait"]
                onward = walk_minutes(snapshot, activity["zone"], anchor["zone"]) if anchor["zone"] else 0
                if finish + onward + anchor["early"] > anchor["start"]:
                    continue
                if not activity["indoor"] and any(begin < b and finish > a for a, b in request.get("rain", [])):
                    continue
                slot = {"type": "ride", "id": activity["id"], "name": activity["name"],
                        "zone": activity["zone"], "start": begin, "end": finish,
                        "note": f"Chơi {activity['duration']} + chờ {activity['wait']} phút (mô phỏng)"}
                hypothetical = rows + [slot] + [a for a in anchors if a["type"] == "food" and a["end"] > start]
                if sum(c["amount"] for c in plan_costs(snapshot, request, hypothetical)) > request["budget"]:
                    continue
                preference = sum(tag in activity["tags"] for tag in interests) * 10 + activity["indoor"]
                if request.get("crowded_first"):
                    preference += activity["wait"]
                if activity["id"] in request.get("required_activities", []):
                    preference += 100
                possible.append((-preference, walk_minutes(snapshot, current_zone, activity["zone"]),
                                 activity["wait"], activity["id"], slot))
            if not possible:
                break
            slot = min(possible)[-1]
            walk(slot["zone"])
            rows.append(slot)
            start, used = slot["end"], used | {slot["id"]}
        if monotonic() >= deadline:
            return stop("SEARCH_TIMEOUT", "Hết thời gian tìm lịch; chưa chứng minh bất khả thi.")
        if anchor["zone"]:
            duration = walk_minutes(snapshot, current_zone, anchor["zone"])
            if start + duration + anchor["early"] > anchor["start"]:
                return stop("SEARCH_TIMEOUT", "Chưa ghép được đường đi đến mốc bắt buộc.")
            walk(anchor["zone"])
            rows.append({k: v for k, v in anchor.items() if k != "early"})
            start = anchor["end"]
    result["timeline"] = rows
    checked = validate(snapshot, request, result)
    result.update(checked)
    if not checked["valid"]:
        return stop("SEARCH_TIMEOUT", "Lịch tham lam chưa qua validator; chưa xác nhận hợp lệ.")
    result["status"] = "VALID"
    result["reasons"] = ["Lịch mô phỏng đã qua validator độc lập."]
    return result
