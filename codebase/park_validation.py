"""Pure validation and integer pricing for one family on one park snapshot.

Times are minutes after midnight. A ride includes its catalog wait; a show starts
at its advertised slot. Completed rows are preserved verbatim and covered by spent.
"""


def minute(value):
    if type(value) is int:
        return value
    hour, minutes = map(int, value.split(":"))
    if not 0 <= hour <= 23 or not 0 <= minutes < 60:
        raise ValueError("Giờ không hợp lệ")
    return hour * 60 + minutes


def walk_minutes(snapshot, origin, destination):
    matrix = snapshot["walk_minutes"]
    if origin == destination:
        return matrix["same_zone"]
    value = matrix.get(origin, {}).get(destination)
    if value is None:
        value = matrix.get(destination, {}).get(origin)
    if type(value) is not int or value < 0:
        raise ValueError("Thiếu phút đi bộ giữa hai khu")
    return value


def eligible(activity, kid):
    if activity.get("min_age") is None or activity.get("min_height") is None:
        return None
    if kid.get("age") is None or kid.get("height_cm") is None:
        return None
    return kid["age"] >= activity["min_age"] and kid["height_cm"] >= activity["min_height"]


def admission_cost(snapshot, request):
    prices = snapshot["prices"]
    total = request["adults"] * prices["adult"]
    for kid in request.get("kids", []):
        height = kid["height_cm"]
        total += (prices["adult"] if height >= prices["child_max_cm"] else
                  prices["child"] if height >= prices["child_free_below_cm"] else 0)
    return total


def plan_costs(snapshot, request, timeline):
    party = request["adults"] + len(request.get("kids", []))
    rides = {a["id"]: a for a in snapshot["activities"]}
    completed = request.get("completed", [])
    future = [row for row in timeline if row not in completed]
    costs = [{"item": "Đã chi", "amount": request.get("spent", 0)},
             {"item": "Vé cổng", "amount": 0 if request.get("tickets_paid") else
              admission_cost(snapshot, request)}]
    for row in future:
        if row.get("type") == "food":
            costs.append({"item": "Ăn trưa", "amount": party * snapshot["prices"]["lunch_per_person"]})
        elif row.get("id") in rides and rides[row["id"]]["surcharge"]:
            costs.append({"item": "Phụ thu " + rides[row["id"]]["name"],
                          "amount": party * rides[row["id"]]["surcharge"]})
    return costs


def validate(snapshot, request, plan):
    """Recompute constraints and costs; never trust plan prices or displayed labels."""
    rows = plan.get("timeline", [])
    errors = []
    checks = []

    def require(condition, code, text):
        if not condition:
            errors.append({"code": code, "text": text})

    require(plan.get("snapshotId", snapshot["snapshotId"]) == snapshot["snapshotId"],
            "SNAPSHOT", "Lịch và dữ liệu không cùng snapshot.")
    start, end = request["start"], request["end"]
    now = request.get("now", start)
    opens, closes = minute(snapshot["park"]["open"]), minute(snapshot["park"]["close"])
    completed = request.get("completed", [])
    require(rows[:len(completed)] == completed, "COMPLETED", "Phần đã hoàn thành phải được giữ nguyên.")
    require(not completed or request.get("tickets_paid"), "REENTRY", "Xếp lại không thu vé cổng lần hai.")
    rides = {a["id"]: a for a in snapshot["activities"]}
    shows = {s["id"]: s for s in snapshot["shows"]}
    kid_results = [{"label": k.get("label", f"Bé {i+1}"), "ok": True, "blocked": []}
                   for i, k in enumerate(request.get("kids", []))]
    previous_end = now
    zone = request.get("current_zone", snapshot["park"]["gate"])
    walked = False
    future = rows[len(completed):] if rows[:len(completed)] == completed else rows
    for row in future:
        if type(row.get("start")) is not int or type(row.get("end")) is not int:
            require(False, "TIME", "Giờ phải là phút nguyên.")
            continue
        begin, finish = row["start"], row["end"]
        require(max(start, opens, now) <= begin < finish <= min(end, closes),
                "WINDOW", "Hoạt động nằm ngoài khung giờ hoặc giờ mở cửa.")
        require(begin >= previous_end, "OVERLAP", "Các hoạt động chồng giờ.")
        kind = row.get("type")
        if kind == "walk":
            destination = row.get("to_zone")
            try:
                needed = walk_minutes(snapshot, zone, destination)
                require(row.get("from_zone") == zone and finish - begin >= needed,
                        "WALK", "Chặng đi bộ sai khu hoặc thiếu phút.")
            except (ValueError, TypeError):
                require(False, "WALK", "Không có căn cứ cho chặng đi bộ.")
            zone, previous_end, walked = destination, finish, True
            continue
        item = rides.get(row.get("id")) if kind == "ride" else shows.get(row.get("id"))
        if kind == "food":
            destination = snapshot["food_zone"]
        elif item:
            destination = item["zone"]
            if kind == "ride":
                require(finish - begin >= item["duration"] + item["wait"],
                        "DURATION", "Trò chưa tính đủ thời lượng và hàng chờ mô phỏng.")
                require(item["min_age"] is not None and item["min_height"] is not None,
                        "MISSING_CONDITIONS", "Thiếu dữ liệu điều kiện của " + item["name"])
                for kid, result in zip(request.get("kids", []), kid_results):
                    if eligible(item, kid) is not True:
                        result["ok"] = False
                        result["blocked"].append(item["name"])
                        require(False, "ELIGIBILITY", result["label"] + " không đủ căn cứ tuổi/chiều cao: " + item["name"])
            else:
                require(begin in [minute(s) for s in item["slots"]] and finish - begin == item["duration"],
                        "SHOW_SLOT", "Show sai suất hoặc thời lượng.")
                require(not any(c["id"] == item["id"] and c["start"] == begin
                                for c in request.get("cancelled_shows", [])),
                        "CANCELLED", "Không được xếp suất show đã huỷ.")
            require(item["id"] not in request.get("closed_activities", []),
                    "CLOSED", "Điểm đã đóng cửa.")
            require(item["indoor"] or not any(begin < rain_end and finish > rain_start
                                            for rain_start, rain_end in request.get("rain", [])),
                    "RAIN", "Hoạt động ngoài trời trong khoảng mưa.")
        else:
            require(False, "UNKNOWN_ITEM", "Hoạt động không có trong snapshot.")
            previous_end = finish
            continue
        try:
            walking = 0 if walked and zone == destination else walk_minutes(snapshot, zone, destination)
            early = item["early"] if kind == "show" else 0
            require(begin - previous_end >= walking + early,
                    "SHOW_EARLY" if early else "WALK", "Thiếu phút đi bộ hoặc giờ đến sớm.")
        except (ValueError, TypeError):
            require(False, "WALK", "Thiếu dữ liệu đường đi.")
        zone, previous_end, walked = destination, finish, False
    for required in request.get("required_shows", []):
        require(any(r.get("id") == required["id"] and r.get("start") == required["start"]
                    and r.get("type") == "show" for r in rows),
                "REQUIRED_SHOW", "Thiếu show bắt buộc.")
    for activity_id in request.get("required_activities", []):
        require(any(r.get("id") == activity_id and r.get("type") == "ride" for r in rows),
                "REQUIRED_ACTIVITY", "Thiếu trò bắt buộc.")
    if request.get("min_rides"):
        require(sum(r.get("type") == "ride" for r in rows) >= request["min_rides"],
                "MIN_RIDES", "Chưa đủ số trò yêu cầu.")
    if request.get("lunch_minutes", 0):
        low, high = request.get("lunch_window", (start, end))
        if request.get("lunch_before_show") and request.get("required_shows"):
            high = min(high, min(s["start"] for s in request["required_shows"]))
        require(any(r.get("type") == "food" and low <= r["start"] and r["end"] <= high
                    and r["end"] - r["start"] >= request["lunch_minutes"] for r in rows),
                "LUNCH", "Chưa có bữa trưa liên tục đủ phút trong khung yêu cầu.")
    costs = plan_costs(snapshot, request, rows)
    total = sum(c["amount"] for c in costs)
    require(total <= request["budget"], "BUDGET", "Tổng tiền vượt ngân sách.")
    require("total" not in plan or plan["total"] == total, "TOTAL", "Tổng hiển thị không khớp phép tính lại.")
    if "costs" in plan:
        require(plan["costs"] == costs, "COSTS", "Bảng tiền không khớp dữ liệu nguồn.")
    for codes, text in (({"TIME", "WINDOW", "OVERLAP", "WALK", "SHOW_EARLY", "SHOW_SLOT", "DURATION"},
                         "Khung giờ, show, đi bộ và hàng chờ"),
                        ({"ELIGIBILITY", "MISSING_CONDITIONS"}, "Tuổi và chiều cao từng bé"),
                        ({"BUDGET", "TOTAL", "COSTS", "REENTRY"}, "Tính lại vé, ăn, phụ thu và khoản đã chi")):
        checks.append({"ok": not any(e["code"] in codes for e in errors), "text": text})
    return {"valid": not errors, "violations": errors, "total": total,
            "costs": costs, "kids": kid_results, "checks": checks,
            "snapshotId": snapshot["snapshotId"], "isMock": snapshot["isMock"]}
