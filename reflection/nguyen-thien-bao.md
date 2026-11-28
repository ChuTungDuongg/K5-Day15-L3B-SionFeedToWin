# Reflection — Nguyễn Thiên Bảo

- Mã học viên: 2A202603861
- Email: 26ai.baont5@vinuni.edu.vn · GitHub: [Limdim1604](https://github.com/Limdim1604)
- Nhóm: SionFeedToWin · Lớp: L3B
- Dự án: VinTrip · Track C: Du lịch
- Vai trò: Lập kế hoạch nhóm, khảo sát, code backend và luồng C (chính là C1), làm video demo

## 1. Vai trò + phần mình làm

Phần chính của mình là backend và luồng C1, tức lập lịch một ngày ở Công viên Mẫu. Mình viết agent gồm 6 công cụ trong [c1_flow.py](../codebase/c1_flow.py) và [park_engine.py](../codebase/park_engine.py), rồi nối vào web `/c1` (`f42e681`). Agent đọc danh mục trò và thông báo sự cố, cho model chọn trò, dùng beam search để xếp giờ, ước tính quãng đi bộ, sau đó chạy validator để chốt kết quả. Trên core-api, mình thêm module `park-plans`. Module này lưu snapshot dữ liệu và kiểm lại lịch độc lập với model trước khi xác nhận tổng tiền (`9b105da`).

Mình cũng làm phần chạy demo của C1:
- **Đầu vào:** đọc tiền và chiều cao viết kiểu nhắn tin, ví dụ "1m08", và xử lý suất diễn bị huỷ trong ngày (`09c3a12`).
- **API:** viết API `/c1/ask` nối từ khung chat Vini, có hỏi lại khi thiếu thông tin (`d92ffc8`), kèm hợp đồng API (`aca9db9`).
- **Truy cập:** thêm tài khoản demo một chạm (`b8304b2`).

Mình chạy các lượt eval C1 và viết [checker](../eval/check_c1_run.py) để đối chiếu output với trace, ngoài ra chạy thêm eval cho C2 (`c08daf9`). Bên cạnh code, mình lập kế hoạch cho nhóm từ CP1, cập nhật TEAMS và canvas (`18ee60d`, `d2ed6c4`). Mình làm Google Form, khảo sát và ghi kết quả vào [results-c1.csv](../evidence/survey/results-c1.csv), rồi làm video demo 3 phút.

## 2. AI hỗ trợ mình thế nào

Mình dùng Claude Code để viết code backend C1, checker eval và script quay màn hình web. Mình cũng dùng nó để lồng tiếng Việt và dựng video bằng HyperFrames.

AI làm nhanh nhưng vẫn sai ở vài chỗ, và mình phải sửa lại:
- **Gọi API:** gửi sai tên trường (`question` thay vì `text`) và chọn sai giờ hiệu lực ở C2.
- **Lời thoại C3:** nói có bản nháp đổi vé, trong khi giao diện chỉ dừng ở bước liệt kê phương án.
- **Báo cáo:** AI hay viết điểm chấm nháp như kết quả cuối, nên mình ghi rõ 30/30 và 19/20 là điểm nháp chờ nhóm duyệt.

Bản reflection này có AI hỗ trợ gom commit, và mình đã đọc lại toàn bộ.

## 3. Một câu thử trượt của nhóm và mình học được gì từ nó

Ca mình nhớ nhất là [HO-14](../eval/c1-validation-review.md). Phụ huynh bắt buộc xem show 11:00, nhưng show đó đã bị huỷ, vậy mà C1 vẫn xếp show vào lịch và trả VALID. Trace cho thấy model không gọi `get_park_incidents`, nên bộ kiểm định riêng chỉ đạt 19/20 dù bộ chính đạt 30/30 nháp.

Đây là lỗi trong code của mình. Validator chỉ kiểm những gì nằm trong lịch, còn việc đọc sự cố lại phụ thuộc vào việc model nhớ gọi công cụ. Ở `09c3a12`, mình sửa để code luôn đọc sự cố, loại suất đã huỷ và hỏi lại phụ huynh, kèm test hồi quy.

Bài học của mình là điều kiện cứng phải do code kiểm, không để model tự nhớ. Điểm tổng cao cũng không chứng minh được hệ thống không còn lỗi nghiêm trọng.
