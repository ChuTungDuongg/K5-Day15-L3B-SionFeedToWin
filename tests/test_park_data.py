"""Contract checks for the synthetic Công viên Mẫu snapshot (ticket C1-01)."""

from datetime import date, time
from itertools import combinations
import json
from pathlib import Path
import unittest


DATA_PATH = Path(__file__).resolve().parents[1] / "data" / "park_mau.json"


def minutes(value):
    parsed = time.fromisoformat(value)
    return parsed.hour * 60 + parsed.minute


class ParkDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads(DATA_PATH.read_text(encoding="utf-8"))

    def test_snapshot_metadata_opening_hours_and_counts(self):
        data = self.data
        self.assertTrue(data["snapshotId"])
        self.assertIs(data["isMock"], True)
        self.assertTrue(data["source"].strip())
        date.fromisoformat(data["observedAt"])
        self.assertEqual(data["park"]["id"], "PARK-MAU")
        self.assertEqual(data["park"]["timezone"], "Asia/Ho_Chi_Minh")
        self.assertEqual((data["park"]["open"], data["park"]["close"]), ("08:00", "19:00"))
        self.assertEqual(len(data["activities"]), 16)
        self.assertEqual(len(data["shows"]), 4)
        self.assertEqual(data["incidents"], [])

    def test_activity_fields_and_unique_ids(self):
        ids = [item["id"] for item in self.data["activities"] + self.data["shows"]]
        self.assertEqual(len(ids), len(set(ids)))
        for activity in self.data["activities"]:
            with self.subTest(activity=activity["id"]):
                for field in ("name", "zone", "tags"):
                    self.assertTrue(activity[field])
                self.assertIs(type(activity["indoor"]), bool)
                self.assertIs(type(activity["duration"]), int)
                self.assertGreater(activity["duration"], 0)
                for field in ("wait", "surcharge", "min_age", "min_height"):
                    value = activity[field]
                    if field in {"min_age", "min_height"} and value is None:
                        continue  # Unknown restrictions must remain unknown.
                    self.assertIs(type(value), int)
                    self.assertGreaterEqual(value, 0)

    def test_show_slots_are_unique_and_within_park_hours(self):
        opens = minutes(self.data["park"]["open"])
        closes = minutes(self.data["park"]["close"])
        for show in self.data["shows"]:
            with self.subTest(show=show["id"]):
                self.assertTrue(show["name"])
                self.assertTrue(show["zone"])
                self.assertIs(type(show["indoor"]), bool)
                self.assertIs(type(show["duration"]), int)
                self.assertGreater(show["duration"], 0)
                self.assertIs(type(show["early"]), int)
                self.assertGreaterEqual(show["early"], 0)
                self.assertTrue(show["slots"])
                self.assertEqual(len(show["slots"]), len(set(show["slots"])))
                for slot in show["slots"]:
                    self.assertGreaterEqual(minutes(slot) - show["early"], opens)
                    self.assertLessEqual(minutes(slot) + show["duration"], closes)

    def test_walk_matrix_covers_every_pair_of_used_zones(self):
        data = self.data
        zones = {data["park"]["gate"], data["food_zone"]}
        zones.update(item["zone"] for item in data["activities"] + data["shows"])
        matrix = data["walk_minutes"]
        self.assertIs(type(matrix["same_zone"]), int)
        self.assertGreater(matrix["same_zone"], 0)
        for origin, destinations in matrix.items():
            if origin == "same_zone":
                continue
            self.assertIn(origin, zones)
            for destination, duration in destinations.items():
                with self.subTest(origin=origin, destination=destination):
                    self.assertIn(destination, zones)
                    self.assertNotEqual(origin, destination)
                    self.assertIs(type(duration), int)
                    self.assertGreater(duration, 0)
        # The stored matrix is triangular; each route is symmetric, not missing.
        for origin, destination in combinations(sorted(zones), 2):
            routes = [matrix.get(origin, {}).get(destination),
                      matrix.get(destination, {}).get(origin)]
            routes = [route for route in routes if route is not None]
            with self.subTest(origin=origin, destination=destination):
                self.assertTrue(routes, "Missing walking route")
                self.assertEqual(len(set(routes)), 1, "Conflicting reverse walking times")

    # The following seven tests map one-to-one to the ticket's required data cases.
    def test_required_show_at_1100(self):
        self.assertTrue(any("11:00" in show["slots"] for show in self.data["shows"]))

    def test_required_midday_show_has_two_slots(self):
        self.assertTrue(any(
            len(show["slots"]) == 2
            and all(minutes("11:00") <= minutes(slot) <= minutes("13:00")
                    for slot in show["slots"])
            for show in self.data["shows"]
        ))

    def test_required_early_afternoon_show(self):
        self.assertTrue(any(
            minutes("13:00") <= minutes(slot) <= minutes("14:00")
            for show in self.data["shows"] for slot in show["slots"]
        ))

    def test_required_last_show_of_day(self):
        last_slot = max(minutes(slot) for show in self.data["shows"] for slot in show["slots"])
        self.assertGreaterEqual(last_slot, minutes("17:00"))
        self.assertLess(last_slot, minutes(self.data["park"]["close"]))

    def test_required_ride_requires_at_least_120_cm(self):
        self.assertTrue(any(
            activity["min_height"] is not None and activity["min_height"] >= 120
            for activity in self.data["activities"]
        ))

    def test_required_indoor_alternative_shares_zone_with_outdoor_stage(self):
        outdoor_stages = {show["zone"] for show in self.data["shows"] if not show["indoor"]}
        self.assertTrue(any(
            activity["indoor"] and activity["zone"] in outdoor_stages
            and activity["min_age"] is not None and activity["min_height"] is not None
            for activity in self.data["activities"]
        ))

    def test_required_activity_with_missing_restrictions_stays_unknown(self):
        self.assertTrue(any(
            activity["min_age"] is None or activity["min_height"] is None
            for activity in self.data["activities"]
        ))

    def test_demo_family_total_with_fairy_village_surcharge(self):
        prices = self.data["prices"]
        self.assertEqual(prices["adult"], 300000)
        self.assertEqual(prices["child"], 175000)
        self.assertEqual(prices["lunch_per_person"], 80000)
        self.assertEqual((prices["child_free_below_cm"], prices["child_max_cm"]), (100, 140))
        # Both sample children (108 and 132 cm) pay the child rate.
        for height in (108, 132):
            self.assertLessEqual(prices["child_free_below_cm"], height)
            self.assertLess(height, prices["child_max_cm"])
        fairy_village = next(a for a in self.data["activities"] if a["name"] == "Làng cổ tích")
        self.assertEqual(fairy_village["surcharge"], 25000)
        costs = (2 * prices["adult"], 2 * prices["child"],
                 4 * prices["lunch_per_person"], 4 * fairy_village["surcharge"])
        self.assertEqual(costs, (600000, 350000, 320000, 100000))
        self.assertEqual(sum(costs), 1370000)
        self.assertEqual(1500000 - sum(costs), 130000)

    def test_minimum_admission_and_lunch_exceeds_budget(self):
        prices = self.data["prices"]
        admission = 2 * prices["adult"] + 2 * prices["child"]
        lunch = 4 * prices["lunch_per_person"]
        minimum = admission + lunch
        self.assertEqual((admission, lunch, minimum), (950000, 320000, 1270000))
        self.assertGreater(minimum, 1000000)
        self.assertEqual(minimum - 1000000, 270000)
        # No negative surcharge can reduce this mandatory admission + lunch lower bound.
        self.assertTrue(all(a["surcharge"] >= 0 for a in self.data["activities"]))


if __name__ == "__main__":
    unittest.main()
