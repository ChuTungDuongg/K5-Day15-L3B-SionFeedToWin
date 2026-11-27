"""Independent constraint checks: corrupt a valid plan to exercise each rule."""
from copy import deepcopy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "codebase"))
from tools import validate_park_plan


def family_request():
    return {"adults": 2, "kids": [{"label": "Bé 1", "age": 5, "height_cm": 108},
                                  {"label": "Bé 2", "age": 9, "height_cm": 132}],
            "start": 540, "end": 840, "budget": 1500000, "lunch_minutes": 45,
            "lunch_window": [660, 810], "required_shows": [{"id": "S01", "start": 660}]}


def family_plan(snapshot):
    return {"snapshotId": snapshot["snapshotId"], "timeline": [
        {"type": "walk", "start": 540, "end": 546, "from_zone": "Cổng chính", "to_zone": "Khu Gia đình"},
        {"type": "ride", "id": "A04", "start": 546, "end": 581},
        {"type": "walk", "start": 581, "end": 588, "from_zone": "Khu Gia đình", "to_zone": "Sân khấu lớn"},
        {"type": "show", "id": "S01", "start": 660, "end": 700},
        {"type": "walk", "start": 700, "end": 705, "from_zone": "Sân khấu lớn", "to_zone": "Khu Ẩm thực"},
        {"type": "food", "start": 705, "end": 750},
    ]}


class ParkValidatorTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = json.loads((ROOT / "data/park_mau.json").read_text(encoding="utf-8"))
        self.request = family_request()
        self.plan = family_plan(self.snapshot)

    def result(self):
        return validate_park_plan(self.plan, self.request, self.snapshot)

    def assertViolation(self, code):
        result = self.result()
        self.assertFalse(result["valid"])
        self.assertIn(code, {e["code"] for e in result["violations"]})

    def test_valid_plan_costs_and_no_mutation(self):
        before = deepcopy((self.snapshot, self.request, self.plan))
        result = self.result()
        self.assertTrue(result["valid"], result["violations"])
        self.assertEqual(result["total"], 1370000)
        self.assertTrue(all(k["ok"] for k in result["kids"]))
        self.assertEqual((self.snapshot, self.request, self.plan), before)

    def test_guest_window_and_park_opening_hours(self):
        self.request["end"] = 740
        self.assertViolation("WINDOW")
        self.request["end"] = 1200
        self.plan["timeline"][-1].update(start=1130, end=1175)
        self.assertViolation("WINDOW")

    def test_no_overlapping_slots(self):
        self.plan["timeline"][1]["start"] = 543
        self.assertViolation("OVERLAP")

    def test_walk_minutes_recomputed_from_snapshot(self):
        self.plan["timeline"][0]["end"] = 543
        self.assertViolation("WALK")

    def test_show_must_match_catalog_slot(self):
        self.plan["timeline"][3].update(start=661, end=701)
        self.assertViolation("SHOW_SLOT")

    def test_arrive_early_for_show(self):
        self.plan["timeline"][2].update(start=648, end=655)
        self.assertViolation("SHOW_EARLY")

    def test_wait_time_is_required(self):
        self.plan["timeline"][1]["end"] = 576  # 30-minute ride, missing its 5-minute wait.
        self.assertViolation("DURATION")

    def test_every_child_height_checked(self):
        self.plan["timeline"][1].update(id="A07", end=586)
        self.assertViolation("ELIGIBILITY")
        self.assertFalse(self.result()["kids"][0]["ok"])
        self.assertTrue(self.result()["kids"][1]["ok"])

    def test_every_child_age_checked(self):
        self.snapshot["activities"][3]["min_age"] = 6
        self.assertViolation("ELIGIBILITY")

    def test_unknown_conditions_are_not_unrestricted(self):
        self.plan["timeline"][1]["id"] = "A16"
        self.assertViolation("MISSING_CONDITIONS")

    def test_admission_and_lunch_minimum_1270000_exceeds_one_million(self):
        self.request.update(budget=1000000, required_shows=[])
        self.plan["timeline"] = [
            {"type": "walk", "start": 660, "end": 667, "from_zone": "Cổng chính", "to_zone": "Khu Ẩm thực"},
            {"type": "food", "start": 667, "end": 712},
        ]
        self.assertViolation("BUDGET")
        self.assertEqual(self.result()["total"], 1270000)

    def test_lunch_must_be_continuous_and_within_requested_window(self):
        self.plan["timeline"][-1]["end"] = 725
        self.plan["timeline"].append({"type": "food", "start": 730, "end": 755})
        self.assertViolation("LUNCH")
        self.plan = family_plan(self.snapshot)
        self.request["lunch_window"] = [750, 810]
        self.assertViolation("LUNCH")

    def test_lunch_before_show(self):
        self.request["lunch_before_show"] = True
        self.assertViolation("LUNCH")

    def test_rain_forbids_outdoor_activity(self):
        self.plan["timeline"][1]["id"] = "A01"
        self.request["rain"] = [[540, 600]]
        self.assertViolation("RAIN")

    def test_closed_and_cancelled_items(self):
        self.request["closed_activities"] = ["A04"]
        self.assertViolation("CLOSED")
        self.request["cancelled_shows"] = [{"id": "S01", "start": 660}]
        self.assertViolation("CANCELLED")

    def test_mandatory_show_and_ride_not_dropped(self):
        self.plan["timeline"].pop(3)
        self.assertViolation("REQUIRED_SHOW")
        self.request["required_activities"] = ["A02"]
        self.assertViolation("REQUIRED_ACTIVITY")

    def test_replan_preserves_completed_rows_and_does_not_recharge_gate(self):
        self.request.update(completed=deepcopy(self.plan["timeline"]), spent=1370000,
                            tickets_paid=True, now=750, current_zone="Khu Ẩm thực")
        self.assertTrue(self.result()["valid"])
        self.assertEqual(self.result()["total"], 1370000)
        self.plan["total"] = 1370000 + 950000
        self.assertViolation("TOTAL")
        self.plan["timeline"][0]["start"] += 1
        self.assertViolation("COMPLETED")

    def test_snapshot_and_displayed_money_cannot_be_forged(self):
        self.plan.update(snapshotId="other-version", total=0, costs=[])
        for code in ("SNAPSHOT", "TOTAL", "COSTS"):
            self.assertViolation(code)


if __name__ == "__main__":
    unittest.main()
