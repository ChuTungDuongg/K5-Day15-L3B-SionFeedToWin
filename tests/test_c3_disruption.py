"""C3 invariant checks use synthetic snapshot data, never airline services."""

from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "codebase"))
import agent
import tools

engine = tools.flight_disruption_engine()
NOW = datetime(2026, 11, 27, 8, tzinfo=timezone.utc)


class FlightDisruptionTests(unittest.TestCase):
    def evaluate(self, **request):
        return engine.evaluate({"bookingCode": "DEMO-C3-001", **request}, now=NOW)

    def test_options_recheck_route_capacity_status_and_money(self):
        result = self.evaluate(action="review")
        self.assertEqual(result["status"], "OPTIONS_READY")
        self.assertEqual([f["id"] for f in result["options"]], ["DEMO-VT101", "DEMO-VT103"])
        self.assertEqual(result["options"][0]["additionalVnd"], 400000)
        self.assertEqual(result["options"][1]["residualVnd"], 200000)
        self.assertEqual({r["id"] for r in result["rejectedOptions"]},
                         {"DEMO-VT102", "DEMO-VT104", "DEMO-VT105"})
        self.assertTrue(result["isMock"])

    def test_deadline_and_no_options_still_offer_refund(self):
        result = self.evaluate(arrivalBefore="2026-12-10T06:10:00Z")
        self.assertEqual([f["id"] for f in result["options"]], ["DEMO-VT101"])
        result = self.evaluate(arrivalBefore="2026-12-10T10:00:00+07:00")
        self.assertEqual((result["status"], result["refundVnd"]), ("NO_OPTIONS", 4800000))
        self.assertNotIn("draft", result)

    def test_refund_hold_change_only_create_stable_drafts(self):
        snapshot = engine.load_snapshot()
        before = deepcopy(snapshot)
        for action in ("hold", "change", "refund"):
            request = {"bookingCode": "DEMO-C3-001", "action": action,
                       "targetFlightId": "DEMO-VT101"}
            first = engine.evaluate(request, snapshot=snapshot, now=NOW)
            second = engine.evaluate(request, snapshot=snapshot, now=NOW)
            self.assertEqual(first, second)
            self.assertEqual(first["status"], "PENDING_USER_APPROVAL")
            self.assertEqual(first["draft"]["status"], "PENDING_USER_APPROVAL")
            self.assertTrue(first["requiresConfirmation"])
            self.assertIn("Chưa giữ chỗ", first["draft"]["draftMessageVi"])
        self.assertEqual(snapshot, before)
        self.assertEqual(self.evaluate(action="refund")["draft"]["refundVnd"], 4800000)

    def test_request_cannot_forge_inventory_fares_or_eligibility(self):
        result = self.evaluate(action="change", targetFlightId="DEMO-VT102", seats=99,
                               additionalVnd=0, status="cancelled")
        self.assertEqual(result["status"], "OPTION_UNAVAILABLE")
        self.assertNotIn("draft", result)
        snapshot = engine.load_snapshot()
        snapshot["flights"][0]["seats"] = 0
        result = engine.evaluate({"bookingCode": "DEMO-C3-001", "action": "change",
                                  "targetFlightId": "DEMO-VT101"}, snapshot=snapshot, now=NOW)
        self.assertEqual(result["status"], "OPTION_UNAVAILABLE")
        self.assertEqual(self.evaluate(bookingCode="DEMO-C3-002")["status"], "NOT_ELIGIBLE")

    def test_unknown_missing_ambiguous_and_invalid_requests(self):
        cases = [({}, "NEEDS_INPUT"), ({"bookingCode": "UNKNOWN"}, "MISSING_DATA"),
                 ({"bookingCode": "DEMO-C3-001", "action": "choose"}, "NEEDS_INPUT"),
                 ({"bookingCode": "DEMO-C3-001", "arrivalBefore": "15:00"}, "NEEDS_INPUT"),
                 ({"bookingCode": "DEMO-C3-001", "arrivalBefore": "2026-12-10T15:00"}, "NEEDS_INPUT")]
        for request, status in cases:
            with self.subTest(request=request):
                result = engine.evaluate(request, now=NOW)
                self.assertEqual(result["status"], status)
                self.assertNotIn("draft", result)

    def test_expired_quote_cannot_propose_hold_but_can_draft_refund(self):
        late = datetime(2026, 12, 10, 2, tzinfo=timezone.utc)
        result = engine.evaluate({"bookingCode": "DEMO-C3-001", "action": "hold",
                                  "targetFlightId": "DEMO-VT101"}, now=late)
        self.assertEqual(result["status"], "STALE_DATA")
        self.assertNotIn("draft", result)
        result = engine.evaluate({"bookingCode": "DEMO-C3-001", "action": "refund"}, now=late)
        self.assertEqual(result["status"], "PENDING_USER_APPROVAL")

    def test_refund_does_not_require_an_arrival_deadline(self):
        result = self.evaluate(action="refund", arrivalBefore="15:00")
        self.assertEqual(result["status"], "PENDING_USER_APPROVAL")
        self.assertEqual(result["draft"]["refundVnd"], 4800000)

    def test_multiple_identifiers_require_a_single_choice(self):
        previous = {"bookingCode": "DEMO-C3-001", "action": "change",
                    "targetFlightId": "DEMO-VT101"}
        for message, missing in (
            ("C3 đổi vé DEMO-C3-001 hoặc DEMO-C3-002 sang DEMO-VT101", "bookingCode"),
            ("C3 đổi vé sang DEMO-VT101 hoặc DEMO-VT103", "targetFlightId"),
        ):
            with self.subTest(message=message):
                request = engine.parse_request(message, previous)
                result = engine.evaluate(request, now=NOW)
                self.assertEqual(result["status"], "NEEDS_INPUT")
                self.assertIn(missing, result["missingFields"])
                self.assertNotIn("draft", result)

    def test_negated_action_never_creates_the_rejected_draft(self):
        previous = {"bookingCode": "DEMO-C3-001", "action": "refund"}
        for message in ("C3 không hoàn tiền", "C3 đừng đổi vé", "C3 chưa muốn giữ chỗ"):
            with self.subTest(message=message):
                result = engine.evaluate(engine.parse_request(message, previous), now=NOW)
                self.assertNotIn("draft", result)
        request = engine.parse_request("C3 không đổi vé, chỉ hoàn tiền", previous)
        self.assertEqual(request["action"], "refund")

    def test_draft_message_contains_the_selected_fare_and_refund_amount(self):
        changed = self.evaluate(action="change", targetFlightId="DEMO-VT101")
        for fact in ("2026-12-10T11:00:00+07:00", "5.200.000đ", "400.000đ"):
            self.assertIn(fact, changed["draft"]["draftMessageVi"])
        refunded = self.evaluate(action="refund")
        self.assertIn("4.800.000đ", refunded["draft"]["draftMessageVi"])

    def test_parser_merges_only_request_slots_and_does_not_choose_action(self):
        self.assertFalse(engine.is_disruption("Chính sách hủy phòng [C3]"))
        previous = {"bookingCode": "DEMO-C3-001", "action": "review", "refundVnd": 999}
        parsed = engine.parse_request("Đổi vé DEMO-VT101", previous)
        self.assertEqual(parsed, {"bookingCode": "DEMO-C3-001", "action": "change",
                                  "targetFlightId": "DEMO-VT101"})
        self.assertEqual(engine.parse_request("C3 đổi vé hoặc hoàn tiền")["action"], "choose")
        changed = engine.parse_request("C3 DEMO-C3-002", parsed)
        self.assertNotIn("targetFlightId", changed)
        self.assertEqual(changed["action"], "review")

    def test_cli_contract_and_model_cannot_claim_transaction(self):
        original = engine.evaluate
        with (patch.object(engine, "evaluate", side_effect=lambda r: original(r, now=NOW)),
              patch.object(agent, "call_model", return_value={"text": "Đã đổi vé thành công"})):
            response = agent.answer("C3 đổi vé DEMO-C3-001 sang DEMO-VT101")
        self.assertEqual(set(response), {"output"})
        for fact in ("PENDING_USER_APPROVAL", "400.000đ", "MÔ PHỎNG", "[C3]"):
            self.assertIn(fact, response["output"])
        self.assertNotIn("Đã đổi vé thành công", response["output"])
        self.assertIs(tools.resolve_flight_disruption,
                      __import__("tracing").TOOLS["resolve_flight_disruption"])


if __name__ == "__main__":
    unittest.main()
