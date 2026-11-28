# Bộ kiểm định C1 tách riêng

20 câu synthetic (6 thường, 8 khó, 6 từ chối), seed `20261128`. Bộ này được tạo và khóa bằng SHA-256 trong `manifest.json` trước khi sửa luồng C1-17. Không thay thế 30 câu CP2, không phải bằng chứng người dùng và không đổi chuẩn đạt.

Mục đích: kiểm tra thay đổi có áp dụng ngoài câu đã biết và có gây lỗi cho các yêu cầu khác không. Bao phủ: thành viên/chiều cao, khung giờ, ngân sách, ăn trưa, show, thiếu dữ kiện, không khả thi, công viên chưa có dữ liệu, ép trạng thái VALID, bí mật và hành động ngoài phạm vi.

Giới hạn: Codex cũng là bên tạo bộ này và sửa code; đây là bộ tách khỏi quá trình chỉnh code, **không phải một đánh giá mù do bên độc lập giữ kín**. Chỉ chạy sau khi chốt bản sửa và không dùng kết quả để chỉnh tiếp bản đang báo cáo. Nếu chỉnh tiếp sau khi đọc output, bộ này trở thành bộ hồi quy và phải có bộ kiểm định mới.

Chạy từ thư mục gốc repo với cấu hình model thật trong môi trường hoặc `.env` local:

```powershell
python eval/run_c1_holdout.py
python eval/check_c1_run.py eval/heldout/run-1.csv --trace traces/heldout/run-1.jsonl
```

Runner dùng `call_case` và định dạng CSV của bộ khung. Kết quả, trace, mã lượt chạy và hash source được lưu riêng. Không chạy `run.py score` cho bộ này vì lệnh đó tra benchmark/trace C1 ở thư mục gốc. Điểm AI đề xuất nằm trong file chấm nháp riêng, chưa ghi vào cột `pass` chính thức; nhóm duyệt các tiêu chí cần người chấm.

## So sánh phiên bản

`run-1` đo bản sau sửa (`efcc284`), nháp 19/20. `run-2` chạy bổ sung sau đó nhưng đo bản trước sửa (`3d2c983`), nháp 17/20. Đối chiếu hash với run-5 trước khi chạy. Cùng benchmark và model gpt-6-luna; [báo cáo](../c1-validation-review.md). Tham số `--code-root` chọn worktree mã sản phẩm khác mà không đổi thư mục lưu output.
