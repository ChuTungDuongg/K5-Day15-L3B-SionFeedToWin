# Data card — C1 (lập lịch một ngày tại khu vui chơi)

> Dữ liệu tự dựng hoặc mô phỏng KHÔNG phải bằng chứng pain. Bằng chứng nằm ở `evidence/`.

## Dataset 1 · Công viên Mẫu (dữ liệu cho 6 công cụ C1)

| | |
|---|---|
| Dùng để làm gì | Nguồn duy nhất cho `get_park_catalog`, `get_show_schedule`, `get_park_incidents`, `estimate_walk`; `build_park_plan` và `validate_park_plan` tính trên cùng snapshot |
| Từ đâu | Nhóm tự dựng theo *kế hoạch sản phẩm C1/C2/C3 của nhóm* mục 4.3; **mô phỏng, không phải công viên thật** |
| Trường | Công viên (ID, ngày, múi giờ, giờ mở/đóng, cổng) · Hoạt động (ID, khu, thời lượng, chờ mô phỏng, trong/ngoài trời) · Điều kiện (tuổi, chiều cao, người lớn đi cùng) · Show (suất, giờ đến sớm, trạng thái) · Giá (theo nhóm khách, khoản đã gồm, phụ thu) · Ma trận phút đi bộ · Sự cố (mưa, điểm đóng, show huỷ) · `source`, `observedAt`, `snapshotId`, `isMock` |
| Số dòng | 15–20 hoạt động, 1 công viên (dự kiến) |
| Bảng giá demo | Vé 2 người lớn 600.000đ, vé 2 bé 350.000đ, ăn trưa 320.000đ, hoạt động phụ thu 100.000đ (khớp câu thử `C1-01`, `C1-11`) |
| Phiên bản / ngày | Chưa tạo, xây trước CP3; mỗi bản có `snapshotId` và seed nếu sinh ngẫu nhiên |
| Nhãn | `isMock = true` |
| Giới hạn | Thời gian chờ và đi bộ là mô phỏng; không phản ánh vận hành thật của công viên nào |

## Dataset 2 · Khảo sát C1 (`evidence/survey/results-c1.csv`)

| | |
|---|---|
| Dùng để làm gì | Bằng chứng pain (`evidence/summary.md`) và nguồn của 11 câu thử `nguoi_dung` (`C1-20`…`C1-30`) |
| Từ đâu | Google Form của nhóm, ngày 27/11/2026 |
| Xử lý | Chỉ giữ các cột câu hỏi C1, bỏ cột nhận ra người trả lời; cột `loai_du_lieu` tách 10 dòng thật (`nguoi_dung_that`) và 10 dòng nhóm tự viết trong Sheets (`tu_viet`) |
| Số dòng | 20 (10 thật, 10 tự viết; chỉ 10 dòng thật được đếm) |
| Giới hạn | n = 10, dưới ngưỡng khảo sát ≥20; 10 dòng thật có ghi "có bổ sung trong Sheets"; chỉ 4/10 đi cùng trẻ nhỏ |

## Dataset 3 · Bộ câu thử (`eval/benchmark.csv`)

| | |
|---|---|
| Số câu | 30 (`thuong` 14 · `kho` 11 · `tu_choi` 5) |
| Nguồn | `nguoi_dung` 11 (dựng từ khảo sát thật, ghi dòng nguồn) · `tu_viet` 19 (kịch bản demo và tình huống ở `spec.md` §5) |

## Dữ liệu của lát cắt cũ (không dùng cho C1)

`data/policies.json`, `data/hotels.json`, `data/flights.json`, `data/trip_plans.json` thuộc bản chạy thử đọc điều khoản hoàn/huỷ trước CP1. Giữ lại để tham chiếu, nhãn `synthetic`.
