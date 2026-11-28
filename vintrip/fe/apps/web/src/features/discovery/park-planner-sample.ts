import type { ParkPlanReply } from './park-planner-api';

// Recorded C1-01, run-4: output copied verbatim; trace projected to CONTRACTS section 8.
// Preserve the historical wording and every tool/model event in source order.
export const PARK_PLANNER_SAMPLE_QUESTION = "Nhà mình 2 người lớn và 2 bé 5 tuổi (cao 108 cm), 9 tuổi (cao 132 cm). Đi Công viên Mẫu từ 09:00 đến 14:00, ngân sách 1.500.000 đồng, ưu tiên trò nhẹ, muốn xem show lúc 11:00 và cần ăn trưa liên tục 45 phút.";

export const PARK_PLANNER_SAMPLE: ParkPlanReply = {
  "output": "Vini — trợ lý du lịch của Vintrip.\r\nTrạng thái: VALID · snapshot CVM-2026-11-28-v1 · dữ liệu mô phỏng Công viên Mẫu.\r\nƯu tiên các trò có nhãn intensity = nhẹ trong catalog Công viên Mẫu.\r\nLịch:\r\n  09:00–09:05 · đi bộ Cổng chính → Khu A – Vườn sinh thái (5 phút, estimate_walk)\r\n  09:05–10:15 · Tham quan Khu A – Vườn sinh thái (Khu A – Vườn sinh thái, ngoài trời; chờ 10 + chơi 60 phút) · phụ thu 100.000đ\r\n  10:15–10:23 · đi bộ Khu A – Vườn sinh thái → Sân khấu ngoài trời (8 phút, estimate_walk)\r\n  11:00–11:30 · Show Vũ điệu đại dương suất 11:00 (có mặt trước 15 phút)\r\n  11:30–11:35 · đi bộ Sân khấu ngoài trời → Khu ăn uống (5 phút, estimate_walk)\r\n  11:35–12:20 · Ăn trưa tại Khu ăn uống (45 phút liên tục)\r\n  12:20–12:23 · đi bộ Khu ăn uống → Khu E – Nhà trong nhà (3 phút, estimate_walk)\r\n  12:23–12:53 · Khu trò chơi điện tử (Khu E – Nhà trong nhà, trong nhà; chờ 0 + chơi 30 phút)\r\n  12:53–13:13 · Mê cung gương (Khu E – Nhà trong nhà, trong nhà; chờ 5 + chơi 15 phút)\r\n  13:13–13:21 · đi bộ Khu E – Nhà trong nhà → Khu C – Trò nước (8 phút, estimate_walk)\r\n  13:21–13:56 · Sân chơi nước trẻ em (Khu C – Trò nước, ngoài trời; chờ 5 + chơi 30 phút)\r\nBảng tiền (giá mô phỏng, tính lại bởi validate_park_plan):\r\n  Vé cổng 2 người lớn: 600.000đ\r\n  Vé cổng 2 trẻ em: 350.000đ\r\n  Phụ thu Tham quan Khu A – Vườn sinh thái: 100.000đ\r\n  Ăn trưa 4 người: 320.000đ\r\n  Tổng: 1.370.000đ · còn 130.000đ (ngân sách 1.500.000đ)\r\nKiểm độc lập: 0 vi phạm; tổng tính lại 1.370.000đ ≤ ngân sách 1.500.000đ.",
  "status": "VALID",
  "snapshot_id": "CVM-2026-11-28-v1",
  "trace": [
    {
      "kind": "tool",
      "name": "get_park_catalog",
      "latency_s": 0.0
    },
    {
      "kind": "tool",
      "name": "get_park_catalog",
      "latency_s": 0.0
    },
    {
      "kind": "tool",
      "name": "build_park_plan",
      "latency_s": 0.07
    },
    {
      "kind": "tool",
      "name": "validate_park_plan",
      "latency_s": 0.0
    },
    {
      "kind": "tool",
      "name": "estimate_walk",
      "latency_s": 0.0
    },
    {
      "kind": "tool",
      "name": "estimate_walk",
      "latency_s": 0.0
    },
    {
      "kind": "tool",
      "name": "estimate_walk",
      "latency_s": 0.0
    },
    {
      "kind": "tool",
      "name": "estimate_walk",
      "latency_s": 0.0
    },
    {
      "kind": "tool",
      "name": "estimate_walk",
      "latency_s": 0.0
    },
    {
      "kind": "model",
      "name": "call_model",
      "latency_s": 5.234
    }
  ]
};
