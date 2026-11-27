# C3 · Xử lý chuyến bay bị huỷ trên nhánh vintrip

Đây là phần mở rộng demo theo yêu cầu của nhóm, chạy qua `python run.py` và chat Vini (`POST /chat`, SSE). Bộ đánh giá C1 và chuẩn đạt ở `spec.md` §7 giữ nguyên. C3 chưa có dữ liệu hay bằng chứng người dùng thật, chưa tích hợp nhà cung cấp vé.

## Chạy thử

Chạy `python run.py`, rồi nhập một trong các câu sau. Nếu máy đã cấu hình model thật thì lời gọi model vẫn tuân theo cấu hình hiện có; phép tính C3 luôn lấy từ công cụ.

```text
C3 xem phương án DEMO-C3-001
C3 giữ chỗ DEMO-C3-001 sang DEMO-VT101
C3 đổi vé DEMO-C3-001 sang DEMO-VT101
C3 hoàn tiền vé DEMO-C3-001
C3 DEMO-C3-001 đến trước 2026-12-10T15:00:00+07:00
```

Trong giao diện chat, sau câu đầu có thể nhập ngắn `Đổi vé DEMO-VT101` hoặc `Hoàn tiền vé C3`. Chat gửi lại các trường yêu cầu trong `trip.pendingFlightDisruption`; CLI chạy mỗi câu độc lập nên phải ghi đủ mã đặt chỗ. Giờ đến tối đa cần ngày, giờ và UTC offset. Đây là parser theo mẫu, chưa hỗ trợ mọi cách diễn đạt tự nhiên.

Có thể nhập `Bỏ giới hạn giờ đến` để xem lại toàn bộ phương án trong chat. Khi chuyển sang hoàn vé, giờ đến không còn là điều kiện bắt buộc. Nếu câu chứa nhiều mã đặt chỗ hoặc nhiều mã chuyến thay thế, hệ thống hỏi lại để chọn một mã; không tự chọn mã đầu tiên. Parser nhận biết các phủ định trực tiếp như `không hoàn tiền`, `đừng đổi vé`, `chưa muốn giữ chỗ` và không tạo bản nháp cho hành động bị phủ định. Gợi ý giữ chỗ/đổi vé lấy từ các chuyến đủ điều kiện ở lượt hiện tại.

`DEMO-C3-001` là đặt chỗ mô phỏng 2 khách SGN → HAN ngày 10/12/2026, chuyến cũ bị huỷ. `DEMO-VT101` có tổng giá mẫu 5.200.000đ, bù thêm 400.000đ so với 4.800.000đ giá vé chưa sử dụng. `DEMO-VT103` có tổng giá mẫu 4.600.000đ, dư 200.000đ và cần hãng xác nhận cách xử lý. `DEMO-VT102` chỉ có 1 chỗ nên bị loại. Mọi giá, chỗ, thời gian và quy tắc đều là dữ liệu tự dựng cho demo, không phải báo giá hay chính sách hãng bay thật.

## Luồng và trạng thái

1. Đọc đặt chỗ từ snapshot, kiểm chuyến cũ có trạng thái `cancelled`.
2. Lọc chuyến mới theo hành trình, trạng thái khai thác, số chỗ đủ cả nhóm, thời gian bay và giờ đến tối đa nếu được yêu cầu. Tính tổng giá cho cả nhóm, phần bù thêm và giá vé dư bằng số nguyên VND.
3. Trả `OPTIONS_READY` hoặc `NO_OPTIONS`, kèm phương án hoàn vé theo quy tắc mô phỏng. `NO_OPTIONS` có nghĩa là không có phương án trong snapshot đáp ứng điều kiện, không khẳng định hãng đã hết chỗ.
4. Với yêu cầu giữ chỗ/đổi vé, kiểm lại chuyến được chọn; thiếu mã thì `NEEDS_INPUT`, mã không đáp ứng điều kiện thì `OPTION_UNAVAILABLE`.
5. Tạo `FLIGHT_HOLD_DRAFT`, `FLIGHT_CHANGE_DRAFT` hoặc `FLIGHT_REFUND_DRAFT`, trạng thái `PENDING_USER_APPROVAL`. Nội dung bản nháp ghi rõ chuyến được đề nghị, giờ bay và các khoản tiền mẫu liên quan hoặc số tiền đề nghị hoàn. Không có endpoint thực thi. Nhập “đã duyệt” vẫn giữ bản nháp, không gọi hãng hay thay đổi đặt chỗ.

`MISSING_DATA` dùng cho mã đặt chỗ không có trong dữ liệu mẫu. `NOT_ELIGIBLE` dùng khi snapshot chưa ghi nhận chuyến cũ bị huỷ (ví dụ `DEMO-C3-002`). `STALE_DATA` chặn đề xuất đổi/giữ chỗ khi báo giá mẫu hết hạn; vẫn có thể soạn đề nghị hoàn vé. Snapshot v1 hết hạn báo giá lúc **09:00 ngày 10/12/2026 (+07:00)**; muốn demo sau đó phải tạo phiên bản dữ liệu mới, không vô hiệu kiểm tra thời hạn.

## Hợp đồng và giới hạn

- Engine dùng thư viện chuẩn ở `vintrip/ai/app/services/assistant/skills/c3_engine.py`, dữ liệu trong `c3_snapshot.json` cùng thư mục. Bridge `codebase/tools.py` nạp chính engine này, không cần cài FastAPI để chạy CLI.
- Mọi kết quả có `isMock`, `snapshotId`, `observedAt`, nhãn mô phỏng và thông báo chưa thực hiện giao dịch. SSE dùng `kind: "flight_disruption"`, các sự kiện `cards`, `trip`, `done` như hiện có; không có nút thực thi giao dịch.
- Bộ nhớ chỉ chứa `bookingCode`, `action`, `targetFlightId`, `arrivalBefore`. Giá, trạng thái vé và tồn chỗ được đọc lại mỗi lượt; trường giá giả trong bộ nhớ bị schema từ chối.
- Cùng yêu cầu có cùng mã bản nháp theo snapshot và nội dung giao dịch. Đây là định danh bản nháp ổn định, **chưa phải cơ chế chống giao dịch lặp trong production**. Chưa có giữ chỗ thật, hết hạn giữ chỗ thật, xuất vé, hoàn qua cổng thanh toán, đối soát, phân quyền truy cập đặt chỗ hoặc saga bù trừ. Không dùng mã đặt chỗ thật với demo.

## Kiểm tra

```powershell
python -m unittest discover -s tests -v
python run.py check
cd vintrip/ai
.venv/Scripts/python.exe -m pytest tests/test_vintrip_copilot.py -q
cd ../fe
pnpm.cmd --filter @vintrip/web exec vitest run src/features/assistant/assistant.test.ts
pnpm.cmd --filter @vintrip/web typecheck
```

Các test C3 là ca tự viết cho dữ liệu mô phỏng, không bổ sung vào bộ đánh giá C1 và không tính là bằng chứng người dùng.

Kết quả rà soát ngày 27/11/2026: 698 test AI/chat/assistant, 25 test render/giao diện liên quan và 40 unittest ở repo đạt. `python run.py check`, lint Python cho các file AI thay đổi, kiểm kiểu hai module C3 và typecheck API client đạt. Đã chạy CLI thật với model offline. Typecheck toàn web còn lỗi có sẵn: `src/features/auth/mobile-google-return.test.ts` import `../../app/auth/google/mobile/route` nhưng route không có trong repo. Lint hai file giao diện có một cảnh báo sẵn ở `ApprovalDraftCard` về thẻ có `role="status"`.
