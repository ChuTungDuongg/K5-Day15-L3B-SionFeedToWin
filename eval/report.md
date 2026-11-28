# Báo cáo đánh giá C1

**Run-4 đã có điểm 30/30 câu, đạt 29/30 (96,7%).** Đã đối chiếu bản chấm ở commit `420ccf8` của nhánh Manh với từng ID và chạy lại `python run.py score eval/run-4.csv`. Lượt này đo phiên bản trước khi thêm bước model chọn trò. [Phiếu chờ người thứ hai đối chiếu](doi-chieu-5.md)

## Các lượt chạy gpt-6-luna

> **Lịch sử trước đợt chuẩn bị CP3:** bốn lượt `run-1..4` có đánh số được chạy trước khi biết luật trên [`docs/tracker/BOARD.md`](../docs/tracker/BOARD.md) ("không chạy `python run.py eval` bản đầy đủ"). Giữ toàn bộ các lượt chạy. Hồ sơ CP3 nêu riêng kết quả lượt đầu theo thời gian và lượt đã điền đủ cột pass.

| Lượt | Run ID | Kết quả |
|---|---|---|
| [Run-1](run-1.csv) | `run-1@20261127-231617` | [Chấm hồi cứu, bản nháp 25/30](cham-nhap-luot-dau.csv). 29 output giống hệt run-2 theo cùng tiêu chí; C1-21 timeout tính 0. Checker run-1 xác nhận 21/25 câu có căn cứ và 14/14 lịch VALID. |
| [Run-2](run-2.csv) | `run-2@20261127-231855` | Bản chấm nháp đầu đạt 26/30. Sau khi tăng thời gian chờ từ 30 lên 90 giây, C1-21 đã có câu trả lời. [Điểm từng câu](run-2-cham-nhap.csv) |
| [Run-3](run-3.csv) | `run-3@20261127-233722` | Chạy giữa lúc sửa, giữ nguyên file và trace. Chưa có điểm duyệt, không tự dùng làm lượt nộp. |
| [Run-4](run-4.csv) | `run-4@20261127-234013` | Đạt 29/30: thường 14/14, khó 11/11, từ chối 4/5. [Trace](../traces/run-4.jsonl) |

## Điểm run-4 và các metric trong bản chấm

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

Khi checkout Windows, CSV có thể dùng CRLF còn chuỗi trong JSONL vẫn là LF. Checker chuẩn hóa riêng ký tự xuống dòng trước khi so sánh. Không bỏ qua khác biệt nội dung và không sửa các file dữ liệu đã chạy. Sau sửa này, kết quả hai metric code của run-4 là 25/25 và 14/14 như bảng trên.

- **C1-11** có lần gọi `get_park_catalog`. Vé và ăn trưa tối thiểu 1.270.000đ, vượt ngân sách 270.000đ, đủ căn cứ kết luận INFEASIBLE.
- **C1-25** giữ nguyên output. Trace mới có lần gọi `estimate_walk` cho đúng chặng cổng → sân khấu, 12 phút.
- **C1-26** chép nguyên giờ show 13:00–13:30 từ phần đã hoàn thành trong câu hỏi. Checker cũ tra giờ show trong snapshot trước khi xét nhãn “theo phụ huynh kể”. Checker đã sửa đối chiếu toàn bộ phần được gắn nhãn với câu hỏi. Lịch mới vẫn được kiểm bằng snapshot và validator.

Có 26/30 output giống hệt run-2. Đã đối chiếu lại bốn output thay đổi. C1-04, C1-26 và C1-27 chỉ thêm nhãn nguồn cho phần đã xong. Trong hai metric do người chấm, chỉ C1-11 đổi output và được chấm lại đạt về trạng thái. Các câu còn lại của hai metric này giữ đánh giá cũ.

**Đối chiếu bổ sung:** AI khớp 5/5 với bản chấm trong một yêu cầu đã bỏ điểm và ghi chú cũ. [Chi tiết](doi-chieu-ai.md). Ngày 28/11/2026, thành viên nhóm đã duyệt cả 5 điểm đề xuất. **Chấm độc lập:** chờ người thứ hai hoàn thành [phiếu 5 output](doi-chieu-5.md) và ghi số khớp thực tế.

## Kiểm phiên bản chọn trò trước CP3

Lượt thử `run-try@20261128-092922` chạy trên đủ 30 câu, 0 lỗi kỹ thuật, 45 lần gọi gpt-6-luna. API ghi nhận 31.257 token vào và 18.203 token ra. Chạy lại hai metric code bằng `python eval/check_c1_run.py validation/cp3-run-try.csv --trace validation/cp3-run-try.jsonl`: căn cứ 25/25, lịch VALID 14/14. Hai metric người chấm chưa được chấm lại cho phiên bản này. [Output](../validation/cp3-run-try.csv) · [Trace](../validation/cp3-run-try.jsonl)
