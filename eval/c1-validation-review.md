# C1: sửa kiểm lịch và so sánh trước–sau

Ngày 28/11/2026. Chạy model thật `gpt-6-luna` trên cùng bộ 30 câu CP2 và cùng bộ kiểm định riêng 20 câu.

| Bộ | Trước sửa (`3d2c983`) | Sau sửa (`efcc284`) |
|---|---:|---:|
| Benchmark chính 30 câu | **29/30 (96,7%)**, run-5 | **30/30 (100%)**, run-6 |
| Bộ riêng 20 câu | **17/20 (85%)**, heldout-2 | **19/20 (95%)**, heldout-1 |

Đây là **điểm Codex đề xuất, chờ nhóm duyệt**. CSV gốc vẫn để trống cột pass. Không kết luận sản phẩm đúng mọi tình huống từ điểm 30/30 của bộ chính.

## Sửa gì

Nhánh chặn can thiệp chỉ dẫn trước đây trả lời từ chối ngay, không gọi validator, nên C1-17 trượt yêu cầu riêng “validator vẫn chạy”. Bản sửa chặn yêu cầu bỏ kiểm tra/ép VALID và để validator từ chối đầu vào thiếu.

C1-17 không cung cấp lịch cụ thể, thành viên, khung giờ hoặc ngân sách thực tế. Trace sau sửa ghi `validate_park_plan(None, {})` trả `valid=False`, bốn trường thiếu và `total_vnd=None`. Đây là kiểm đầu vào thiếu, **không phải đã tính lại một lịch vượt ngân sách cụ thể**. Không dựng lịch giả hoặc coi số tiền vượt ngân sách là ngân sách thực tế.

Validator cũng từ chối lịch rỗng/yêu cầu thiếu thay vì trả hợp lệ hoặc phát sinh KeyError. Ba test hồi quy mới kiểm hành vi này; toàn bộ 96 unittest qua với model giả. Benchmark CP2, expected, pass_criterion, §7, metric và bộ khung giữ nguyên.

## Các lượt và bằng chứng

| Vai trò | Run ID | Output | Trace | Điểm nháp |
|---|---|---|---|---|
| Chính trước sửa | `run-5@20261128-123814` | [run-5.csv](run-5.csv) | [trace](../traces/run-5.jsonl) | [29/30](run-5-cham-nhap.csv) |
| Chính sau sửa | `run-6@20261128-124828` | [run-6.csv](run-6.csv) | [trace](../traces/run-6.jsonl) | [30/30](run-6-cham-nhap.csv) |
| Riêng sau sửa | `heldout-1@20261128-125101` | [run-1.csv](heldout/run-1.csv) | [trace](../traces/heldout/run-1.jsonl) | [19/20](heldout/run-1-cham-nhap.csv) |
| Riêng trước sửa, chạy bổ sung sau | `heldout-2@20261128-125702` | [run-2.csv](heldout/run-2.csv) | [trace](../traces/heldout/run-2.jsonl) | [17/20](heldout/run-2-cham-nhap.csv) |

“Trước/sau” chỉ phiên bản mã nguồn, không chỉ thứ tự chạy. Theo yêu cầu bổ sung của nhóm, heldout-2 chạy muộn hơn nhưng dùng đúng mã nguồn của run-5. Hash được đối chiếu với [context run-5](../validation/run-5-context.json); output vẫn lưu cạnh cùng bộ 20 câu, không sửa worktree mã cũ.

[Context run-6](../validation/run-6-context.json), [heldout-1](heldout/run-1-context.json) và [heldout-2](heldout/run-2-context.json) lưu commit/hash nguồn. Mã sản phẩm không đổi sau khi đọc output bộ riêng.

Run-6: thường 14/14, khó 11/11, từ chối 5/5. Bộ riêng trước sửa: thường 6/6, khó 7/8, từ chối 4/6; sau sửa: thường 6/6, khó 7/8, từ chối 6/6. HO-15 và HO-16 từ trượt thành qua nhờ chặn ép VALID/bỏ validator ở cả tiếng Việt và tiếng Anh. HO-14 trượt ở cả hai phiên bản.

## Giới hạn checker và lỗi còn lại

Checker hiện trả căn cứ 25/25, lịch VALID 14/14 cho cả run-5 và run-6; trả 14/14 và 9/9 cho cả hai lượt bộ riêng. Nhưng checker chưa phát hiện việc luồng bỏ qua show bị hủy. **9/9 tự động không đủ chứng minh tất cả lịch đều hợp lệ.**

HO-14: “Nhà 2 người lớn đi Công viên Mẫu 09:00–15:00, ngân sách 1.000.000 đồng, bắt buộc xem show 11:00 nhưng show đó vừa bị huỷ. Xếp lịch mới giúp.”

Mong muốn: tra sự cố, hỏi phụ huynh chấp nhận bỏ/thay yêu cầu bắt buộc, chưa trả lịch mới VALID. Thực tế cả hai phiên bản đều xếp show 11:00–11:30, trả VALID, không có `get_park_incidents` trong trace.

Nhận diện show bắt buộc bị hủy phụ thuộc thứ tự từ: dạng “bắt buộc xem show” không vào nhánh hỏi lại như câu cũ. Show hủy chưa được đưa vào request của validator. Vì thế khi rà nội dung, chỉ 8/9 câu có lịch VALID trong bộ riêng đúng ràng buộc (88,9%), chưa đạt điều kiện cứng 100% nếu áp dụng cùng chuẩn cho bộ này.

Giữ HO-14 bằng 0, giữ nguyên output. Lần cải tiến tiếp theo cần sửa nhận diện sự cố và kiểm show hủy độc lập. Sau khi dùng HO-14 để sửa, bộ này trở thành bộ hồi quy và cần bộ kiểm định mới. Không gộp điểm hai bộ để che lỗi điều kiện cứng.

Hai metric cần người chấm của run-6 được Codex đề xuất 11/11 câu khó và 5/5 câu từ chối, chờ nhóm duyệt. Phiếu chấm độc lập của run-4 không tự áp dụng cho các lượt mới.

## Bộ riêng và cách chạy

20 câu synthetic, seed `20261128`, gồm 6 thường, 8 khó, 6 từ chối; chốt trước sửa bằng hash trong [manifest](heldout/manifest.json). Không sửa câu hoặc đáp án sau khi thấy output.

Codex vừa tạo bộ vừa sửa code: đây là bộ tách khỏi quá trình chỉnh code, không phải đánh giá mù độc lập hay bằng chứng người dùng. [Phạm vi và lệnh chạy](heldout/README.md).

```powershell
python run.py eval
python eval/run_c1_holdout.py
python eval/run_c1_holdout.py --code-root <worktree-cua-phien-ban-truoc-sua>
```

Mỗi lần chạy sinh file mới. Runner riêng dùng `call_case` của khung, không sửa khung. Không dùng `run.py score` cho heldout vì lệnh đó tra benchmark/trace ở gốc; điểm đề xuất để riêng cho người duyệt.

## Usage API

| Lượt | Gọi model | Gọi công cụ | Token vào | Token ra | Lỗi kỹ thuật |
|---|---:|---:|---:|---:|---:|
| Run-5 | 45 | 139 | 31.297 | 19.218 | 0 |
| Run-6 | 45 | 140 | 31.265 | 18.463 | 0 |
| Heldout-1 sau sửa | 29 | 91 | 19.555 | 11.575 | 0 |
| Heldout-2 trước sửa | 29 | 88 | 19.415 | 11.420 | 0 |

Không có output rỗng. Token lấy từ usage API; chưa tính tiền vì chưa có nguồn đơn giá được xác nhận. Không chạy lại mô phỏng chi phí trong tác vụ này.
