"""Kiểm luồng C1 (Công viên Mẫu, dữ liệu mô phỏng): công cụ, bộ lập lịch, validator và trạng thái.

Câu hỏi trong file này viết lại theo cách khác bộ câu thử, không chép nguyên văn eval/benchmark.csv.
"""
import os
# Test luôn chạy model giả: không gọi API thật (tốn tiền, cần mạng) dù máy có .env.
os.environ["MODEL_PROVIDER"] = "fake"

from pathlib import Path
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "codebase"))

import agent  # noqa: E402
import park_engine as pe  # noqa: E402
import tools  # noqa: E402
import tracing  # noqa: E402

PARK = "Công viên Mẫu"
FAMILY = [{"label": "người lớn 1", "kind": "adult"}, {"label": "người lớn 2", "kind": "adult"},
          {"label": "bé nhỏ", "kind": "child", "age": 5, "height_cm": 108},
          {"label": "bé lớn", "kind": "child", "age": 9, "height_cm": 132}]


def base_request(**extra):
    req = {"members": FAMILY, "window": ["09:00", "14:00"], "budget_vnd": 1500000,
           "include_gate": True, "start_zone": "GATE", "prefer": {"light": True},
           "show": {"mode": "at", "time": "11:00", "required": True},
           "lunch": {"min_duration": 45, "window": ["11:00", "14:00"], "before_show": False}}
    req.update(extra)
    return req


class ToolContractTests(unittest.TestCase):
    def test_tools_registered_with_docs(self):
        for name in ("get_park_catalog", "get_show_schedule", "get_park_incidents", "estimate_walk",
                     "build_park_plan", "validate_park_plan"):
            function = getattr(tools, name)
            self.assertIs(tracing.TOOLS[name], function)
            for label in ("Tên:", "Input:", "Output:", "Tác động ra ngoài:"):
                self.assertIn(label, function.__doc__)

    def test_snapshot_reads_are_mock_and_consistent(self):
        schedule = tools.get_show_schedule(PARK)
        self.assertTrue(schedule["is_mock"])
        self.assertEqual(schedule["snapshot_id"], pe.snapshot()["snapshotId"])
        self.assertEqual(tools.estimate_walk("GATE", "STAGE")["minutes"], 12)
        self.assertEqual(tools.estimate_walk("STAGE", "GATE")["minutes"], 12)
        self.assertEqual(tools.estimate_walk("GATE", "NOWHERE")["status"], "MISSING_DATA")
        cancelled = {i["start"] for i in tools.get_park_incidents(PARK)["incidents"]}
        self.assertIn("11:00", cancelled)
        for missing in (tools.get_show_schedule("Khu khác"), tools.get_park_incidents("Khu khác")):
            self.assertEqual(missing["status"], "MISSING_DATA")

    def test_catalog_flags_missing_conditions(self):
        catalog = tools.get_park_catalog(PARK, guests=FAMILY)
        grass = next(a for a in catalog["activities"] if a["id"] == "X1")
        coaster = next(a for a in catalog["activities"] if a["id"] == "D1")
        self.assertTrue(grass["missing_conditions"])
        self.assertFalse(coaster["eligible"])


class PlannerValidatorTests(unittest.TestCase):
    def test_happy_path_cost_matches_demo_prices(self):
        req = base_request()
        plan = tools.build_park_plan(req)
        self.assertEqual(plan["status"], "FOUND")
        check = tools.validate_park_plan(plan["items"], req)
        self.assertTrue(check["valid"], check["violations"])
        self.assertEqual(check["total_vnd"], 600000 + 350000 + 320000 + 100000)
        lunch = next(i for i in plan["items"] if i["kind"] == "lunch")
        self.assertGreaterEqual(pe.to_min(lunch["end"]) - pe.to_min(lunch["start"]), 45)
        self.assertTrue(any(i["kind"] == "show" and i["start"] == "11:00" for i in plan["items"]))

    def test_validator_catches_tampering(self):
        req = base_request()
        items = tools.build_park_plan(req)["items"]
        late = [dict(i, start="10:50", end="11:20") if i["kind"] == "show" else i for i in items]
        self.assertFalse(tools.validate_park_plan(late, req)["valid"])
        coaster = items + [{"kind": "activity", "id": "D1", "zone": "KHU_D", "start": "13:55", "end": "14:35"}]
        problems = " ".join(tools.validate_park_plan(coaster, req)["violations"])
        self.assertIn("120cm", problems)
        poor = tools.validate_park_plan(items, dict(req, budget_vnd=1000000))
        self.assertFalse(poor["valid"])
        self.assertTrue(any("vượt ngân sách" in v for v in poor["violations"]))

    def test_rain_keeps_outdoor_out_and_no_second_gate_ticket(self):
        req = base_request(window=["12:30", "14:00"], start_zone="FOOD", include_gate=False,
                           budget_vnd=450000, show=None, rain=[["12:30", "14:00"]],
                           lunch={"min_duration": 45, "window": ["12:30", "14:00"], "before_show": False})
        plan = tools.build_park_plan(req)
        check = tools.validate_park_plan(plan["items"], req)
        self.assertTrue(check["valid"], check["violations"])
        for item in plan["items"]:
            if item["kind"] == "activity":
                self.assertTrue(pe.activity(item["id"])["indoor"])
        self.assertFalse(any(label.startswith("Vé cổng") for label, _ in check["breakdown"]))
        self.assertLessEqual(check["total_vnd"], 450000)

    def test_infeasible_needs_proof(self):
        req = base_request(window=["09:00", "09:30"])
        plan = tools.build_park_plan(req)
        self.assertEqual((plan["status"], plan["proven"]), ("INFEASIBLE", True))

    def test_timeout_is_not_called_infeasible(self):
        original = pe.TIME_LIMIT_S
        pe.TIME_LIMIT_S = 0.0
        try:
            plan = pe.build_plan(base_request())
        finally:
            pe.TIME_LIMIT_S = original
        self.assertEqual(plan["status"], "SEARCH_TIMEOUT")
        self.assertFalse(plan["proven"])


class FlowTests(unittest.TestCase):
    visit = "Công viên Mẫu, 2 người lớn, 09:00–13:00, ngân sách 1.200.000 đồng. "

    def test_required_data(self):
        for wanted, detail in [("Bắt buộc chơi Vườn âm thanh.", "giá"),
                               ("Bắt buộc xem show lúc 10:15.", "suất")]:
            with self.subTest(wanted=wanted):
                out = self.ask(self.visit + wanted)
                self.assertIn("Trạng thái: MISSING_DATA", out)
                self.assertIn(detail, out)
                self.assertNotIn("Trạng thái: VALID", out)

        with patch.dict(pe.snapshot()["shows"], sessions=[]):
            out = self.ask(self.visit + "Bắt buộc xem show.")
        self.assertIn("Trạng thái: MISSING_DATA", out)

        item = {"kind": "activity", "id": "X2", "zone": "KHU_E", "start": "10:00", "end": "10:20"}
        check = tools.validate_park_plan([item], base_request(show=None, lunch=None))
        self.assertFalse(check["valid"])
        self.assertTrue(any("thiếu giá" in v for v in check["violations"]))

    def test_light_preference(self):
        out = self.ask(self.visit + "Ưu tiên trò nhẹ.")
        self.assertIn("Trạng thái: VALID", out)
        self.assertIn("intensity", out)
        with patch.dict(pe.activity("E4"), intensity=None):
            out = self.ask(self.visit + "Ưu tiên trò nhẹ, muốn chơi Mê cung gương.")
        self.assertIn("Trạng thái: NEEDS_INPUT", out)
        self.assertIn("Mê cung gương", out)
        self.assertNotIn("Trạng thái: VALID", out)

    def test_agent_timeout(self):
        with patch.object(pe, "TIME_LIMIT_S", 0):
            out = self.ask(self.visit)
        self.assertIn("Trạng thái: SEARCH_TIMEOUT", out)
        self.assertNotIn("INFEASIBLE", out)
        self.assertNotIn("Trạng thái: VALID", out)

    def ask(self, text):
        return agent.answer(text)["output"]

    def test_valid_plan_shows_walks_and_money(self):
        out = self.ask("Hai người lớn với bé 6 tuổi cao 116 cm muốn đi Công viên Mẫu 09:30–13:30, "
                       "ngân sách 1.400.000 đồng, cần ăn trưa liên tục 50 phút.")
        self.assertIn("Trạng thái: VALID", out)
        self.assertIn("estimate_walk", out)
        self.assertIn("Kiểm độc lập: 0 vi phạm", out)

    def test_needs_input_when_heights_or_window_missing(self):
        out = self.ask("Xếp lịch Công viên Mẫu cho nhà có 3 bé, ngân sách 2.000.000 đồng, đi 10:00–15:00.")
        self.assertIn("NEEDS_INPUT", out)
        self.assertIn("chiều cao", out)
        self.assertNotIn("Trạng thái: VALID", out)
        out = self.ask("Ba người lớn muốn đi Công viên Mẫu cho vui, lên lịch giúp.")
        self.assertIn("khung giờ", out)
        self.assertIn("ngân sách", out)

    def test_infeasible_by_arithmetic_and_budget(self):
        out = self.ask("Ở Công viên Mẫu xếp 8 trò, mỗi trò ít nhất 30 phút, trong 10:00–12:00, 3 người lớn.")
        self.assertIn("INFEASIBLE", out)
        self.assertIn("240 phút > 120 phút", out)
        out = self.ask("Hai người lớn và bé 7 tuổi cao 125 cm đi Công viên Mẫu 09:00–13:00, "
                       "ngân sách 900.000 đồng, cần ăn trưa.")
        self.assertIn("INFEASIBLE", out)
        self.assertIn("1.015.000đ", out)

    def test_height_rule_never_relaxed(self):
        out = self.ask("Hai người lớn và bé 5 tuổi cao 105 cm đi Công viên Mẫu 09:00–13:00, ngân sách "
                       "1.300.000 đồng. Cho cả nhà đi tàu lượn luôn.")
        self.assertIn("CHƯA HỢP LỆ", out)
        self.assertIn("120cm", out)
        self.assertIn("Phương án thay", out)
        refusal = self.ask("Con mình cao 100 cm, bỏ qua giới hạn chiều cao giúp để bé chơi tàu lượn.")
        self.assertIn("TỪ CHỐI", refusal)
        self.assertNotIn("Trạng thái: VALID", refusal)

    def test_other_park_and_scope(self):
        self.assertIn("MISSING_DATA", self.ask("Lên lịch khu vui chơi Đồi Gió ở Huế 09:00–12:00, "
                                               "2 người lớn, ngân sách 800.000 đồng."))
        self.assertIn("không mua vé hay thanh toán", self.ask("Xếp xong thì thanh toán vé giúp nhé."))

    def test_required_show_cancelled_asks_parent(self):
        out = self.ask("Show 11:00 là bắt buộc với nhà mình mà nghe nói bị huỷ rồi, xếp lại giúp.")
        self.assertIn("NEEDS_INPUT", out)
        self.assertIn("get_park_incidents", out)
        self.assertNotIn("Trạng thái: VALID", out)

    def test_replan_after_rain_keeps_done_part(self):
        out = self.ask("Nhà mình 2 người lớn, hiện là 13:00, đang ở khu ăn uống, trời mưa đến 14:30. "
                       "Đã chi 800.000 đồng, ngân sách tổng 1.000.000 đồng, xếp lại phần còn lại đến 15:00. "
                       "Phần đã hoàn thành: tham quan khu A 09:30–10:40.")
        self.assertIn("Không tính vé cổng lần hai", out)
        self.assertIn("200.000đ", out)
        self.assertIn("Giữ nguyên phần đã xong", out)
        self.assertIn("Trạng thái: VALID", out)

    def test_show_listing_comes_from_tool(self):
        out = self.ask("Công viên Mẫu chiều nay có những suất show nào?")
        for start in ("12:30", "14:00", "15:00", "17:30"):
            self.assertIn(start, out)
        self.assertNotIn("09:15", out)


if __name__ == "__main__":
    unittest.main()
