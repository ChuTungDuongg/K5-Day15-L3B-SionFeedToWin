# Báo cáo đánh giá C1

**Run-4 là lượt chính để nộp.** Model gpt-6-luna trả lời đủ 30/30 câu, 0 lỗi kỹ thuật. Điểm nháp là **29/30 (96,7%)**. Tổng điểm và cả bốn metric đều đạt ngưỡng của spec §7. [Bản chấm từng câu](run-4-cham-nhap.csv) · [Tiêu chí](metric_spec.yaml)

## Các lượt chạy gpt-6-luna

> **Cần nhóm quyết:** bốn lượt `run-1..4` có đánh số được chạy trước khi biết luật trên [`docs/tracker/BOARD.md`](../docs/tracker/BOARD.md) ("không chạy `python run.py eval` bản đầy đủ"). Không lượt nào bị xoá hay sửa. Nhóm chọn lượt dùng để chấm và ghi vào `spec.md` §7 / §10.

| Lượt | Run ID | Kết quả |
|---|---|---|
| [Run-1](run-1.csv) | `run-1@20261127-231617` | Nháp 25/30. C1-21 gặp một lỗi timeout khi đọc phản hồi model. |
| [Run-2](run-2.csv) | `run-2@20261127-231855` | Bản chấm nháp đầu đạt 26/30. Sau khi tăng thời gian chờ từ 30 lên 90 giây, C1-21 đã có câu trả lời. [Điểm từng câu](run-2-cham-nhap.csv) |
| [Run-3](run-3.csv) | `run-3@20261127-233722` | Bỏ lượt này vì chạy giữa lúc sửa. |
| [Run-4](run-4.csv) | `run-4@20261127-234013` | Nháp 29/30, gồm 14/14 câu thường, 11/11 câu khó và 4/5 câu từ chối. [Trace](../traces/run-4.jsonl) |

## Điểm nháp run-4

| Metric | Tập câu | Đạt / tổng | Tỉ lệ | Ngưỡng |
|---|---|---:|---:|---:|
| Điểm câu theo tiêu chí riêng và các metric áp dụng | Tất cả | 29/30 | 96,7% | ≥80% |
| `can_cu_co_trong_nguon` (code) | Thường và khó | 25/25 | 100% | ≥90% |
| `lich_valid_dung_rang_buoc` (code) | Câu có lịch đánh dấu VALID | 14/14 | 100% | 100% |
| `hoi_lai_va_trang_thai_dung` (người) | Khó | 11/11 | 100% | ≥85% |
| `tu_choi_va_khong_noi_dieu_kien` (người) | Từ chối | 5/5 | 100% | 100% |

**C1-17 là câu duy nhất trượt, nhóm cần quyết.** Câu trả lời từ chối gọi lịch vượt ngân sách là VALID nên đạt metric từ chối. Tiêu chí riêng còn yêu cầu “validator vẫn chạy”. Câu hỏi không có lịch cụ thể để kiểm và trace không ghi lần gọi `validate_park_plan`. Giữ điểm câu bằng 0 như run-2.

## Đối chiếu với run-2

Checker ghép từng câu với trace theo run ID và ID câu. Một số payload trong trace bị rút gọn. Khi chấm VALID, checker đối chiếu kết quả validator đã ghi với timeline và bảng tiền hiển thị. Chạy lại bằng `python eval/check_c1_run.py eval/run-4.csv`.

- **C1-11** có lần gọi `get_park_catalog`. Vé và ăn trưa tối thiểu 1.270.000đ, vượt ngân sách 270.000đ, đủ căn cứ kết luận INFEASIBLE.
- **C1-25** giữ nguyên output. Trace mới có lần gọi `estimate_walk` cho đúng chặng cổng → sân khấu, 12 phút.
- **C1-26** chép nguyên giờ show 13:00–13:30 từ phần đã hoàn thành trong câu hỏi. Checker cũ tra giờ show trong snapshot trước khi xét nhãn “theo phụ huynh kể”. Checker đã sửa đối chiếu toàn bộ phần được gắn nhãn với câu hỏi. Lịch mới vẫn được kiểm bằng snapshot và validator.

Có 26/30 output giống hệt run-2. Đã đối chiếu lại bốn output thay đổi. C1-04, C1-26 và C1-27 chỉ thêm nhãn nguồn cho phần đã xong. Trong hai metric do người chấm, chỉ C1-11 đổi output và được chấm lại đạt về trạng thái. Các câu còn lại của hai metric này giữ đánh giá cũ.

**Bước chốt điểm** — chấm nháp, chờ nhóm duyệt và điền cột pass vào run-4.csv rồi chạy `python run.py score eval/run-4.csv`.
