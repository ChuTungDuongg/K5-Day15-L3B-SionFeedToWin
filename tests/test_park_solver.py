"""Read tools and greedy scheduling contracts, without a model or external service."""
from copy import deepcopy
import unittest

from test_park_validator import family_request
from tools import (build_park_plan, estimate_walk, get_park_catalog, get_park_incidents,
                   get_show_schedule, validate_park_plan)
import tracing


class ParkSolverTests(unittest.TestCase):
    def setUp(self):
        self.snapshot = get_park_catalog("Công viên Mẫu")
        self.request = family_request()

    def test_read_tools_same_snapshot_and_no_shared_mutation(self):
        for result in (get_show_schedule(), get_park_incidents(), estimate_walk("Cổng chính", "Sân khấu lớn")):
            self.assertEqual(result["snapshotId"], self.snapshot["snapshotId"])
            self.assertIs(result["isMock"], True)
        self.snapshot["activities"].clear()
        self.assertEqual(len(get_park_catalog("Công viên Mẫu")["activities"]), 16)

    def test_walk_reverse_same_zone_and_missing(self):
        self.assertEqual(estimate_walk("Cổng chính", "Sân khấu lớn")["minutes"], 12)
        self.assertEqual(estimate_walk("Sân khấu lớn", "Cổng chính")["minutes"], 12)
        self.assertEqual(estimate_walk("Sân khấu lớn", "Sân khấu lớn")["minutes"], 2)
        self.assertEqual(estimate_walk("unknown", "Cổng chính")["status"], "MISSING_DATA")
        self.assertEqual(estimate_walk("Cổng chính", "Sân khấu lớn", "different")["status"], "MISSING_DATA")

    def test_reported_incident_has_provenance_not_snapshot_mutation(self):
        reported = [{"kind": "rain", "start": 750, "end": 840}]
        result = get_park_incidents(reported=reported)
        self.assertEqual(result["incidents"][0]["source"], "user_scenario")
        self.assertEqual(get_park_incidents()["incidents"], [])
        self.assertNotIn("source", reported[0])

    def test_sample_family_valid_1370000(self):
        before = deepcopy(self.request)
        result = build_park_plan(self.request, self.snapshot)
        self.assertEqual(result["status"], "VALID", result)
        independent = validate_park_plan(result, self.request, self.snapshot)
        self.assertTrue(independent["valid"], independent)
        self.assertEqual(independent["total"], 1370000)
        self.assertEqual(self.request, before)
        self.assertTrue(any(r["type"] == "food" and r["end"]-r["start"] >= 45 for r in result["timeline"]))

    def test_proven_cost_and_time_lower_bounds(self):
        self.request["budget"] = 1000000
        result = build_park_plan(self.request)
        self.assertEqual((result["status"], result["total"]), ("INFEASIBLE", 1270000))
        self.request.update(budget=2000000, end=660, min_rides=10, min_ride_minutes=20)
        self.assertEqual(build_park_plan(self.request)["status"], "INFEASIBLE")

    def test_timeout_does_not_claim_infeasible(self):
        self.assertEqual(build_park_plan(self.request, max_seconds=0)["status"], "SEARCH_TIMEOUT")

    def test_cancelled_mandatory_show_needs_parent_decision(self):
        self.request["cancelled_shows"] = deepcopy(self.request["required_shows"])
        result = build_park_plan(self.request)
        self.assertEqual(result["status"], "NEEDS_INPUT")
        self.assertTrue(result["questions"])

    def test_replan_only_indoor_and_preserves_history_and_spent(self):
        completed = [{"type": "food", "name": "Ăn trưa đã xong", "start": 690, "end": 750}]
        self.request.update(now=840, end=1020, current_zone="Sân khấu lớn", completed=completed,
                            spent=700000, tickets_paid=True, budget=1000000, required_shows=[],
                            lunch_minutes=0, rain=[[840, 930]])
        result = build_park_plan(self.request)
        self.assertEqual(result["status"], "VALID", result)
        self.assertEqual(result["timeline"][:len(completed)], completed)
        first = next(r for r in result["timeline"][len(completed):] if r["type"] == "ride")
        self.assertEqual(first["zone"], "Sân khấu lớn")
        self.assertLessEqual(result["total"], 1000000)
        self.assertEqual(result["costs"][1]["amount"], 0)

    def test_tools_registered_and_documented(self):
        for function in (get_park_catalog, get_show_schedule, get_park_incidents,
                         estimate_walk, build_park_plan, validate_park_plan):
            self.assertIs(tracing.TOOLS[function.__name__], function)
            for heading in ("Tên:", "Input:", "Output:", "Tác động ra ngoài:"):
                self.assertIn(heading, function.__doc__)


if __name__ == "__main__":
    unittest.main()
