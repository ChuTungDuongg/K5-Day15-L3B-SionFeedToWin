# Reflection cá nhân: Chu Nguyễn Tùng Dương

- Mã học viên: 2A202604016
- Nhóm: SionFeedToWin
- Lớp: L3B
- Dự án: VinTrip, Track C: Du lịch
- Vai trò: Đội trưởng và người thuyết trình

## 1. Vai trò và phần em làm

Em là đội trưởng, phụ trách điều phối, quản lý repo và phối hợp tích hợp bản chạy thử C1 theo phân công trong [TEAMS.md](../TEAMS.md).
Em đảm nhận vai trò người thuyết trình, chuẩn bị lời nói khoảng năm phút để giải thích bài toán lập lịch khu vui chơi cho gia đình có trẻ nhỏ.
Trong phần demo, em chọn ca gia đình có hai bé cao 108 cm và 132 cm, sau đó chuyển sang yêu cầu cả nhà chơi tàu lượn cần tối thiểu 120 cm để làm rõ cách hệ thống phát hiện vi phạm.
Em dùng [bộ câu thử](../eval/benchmark.csv) và [báo cáo kiểm định C1](../eval/c1-validation-review.md) để chuẩn bị phần giải thích kết quả, đồng thời phân biệt dữ liệu mô phỏng với bằng chứng người dùng.
Điểm em cần cải thiện là chốt mạch trình bày sớm hơn và dành thời gian tập nói cùng bản demo, vì một phần giải thích quá dài sẽ làm thiếu thời gian cho kết quả và lỗi còn lại.

## 2. AI hỗ trợ em thế nào

Em dùng OpenAI Codex để đọc slide HTML, gợi ý lời thoại theo từng trang và chia thời gian cho bài nói năm phút.
AI giúp chuyển phần mô tả kỹ thuật thành lời giải thích dễ nói, chẳng hạn code chịu trách nhiệm xếp và kiểm lịch, còn model hỗ trợ chọn trò ưu tiên và diễn đạt kết quả.
Khi biên tập lời thoại, em tập trung rút phần demo để vừa thời lượng, dùng kết quả đã lưu trên slide và đọc rõ các khoản tiền cần kiểm tra.
Phần phải rà kỹ là cách diễn đạt kết quả đánh giá: 30/30 và 19/20 vẫn là điểm chấm nháp, còn token API chưa đủ để kết luận chi phí hay thời gian phụ huynh tiết kiệm.
Bản reflection này cũng có Codex hỗ trợ soạn, và em chịu trách nhiệm đọc lại, xác nhận phần việc của mình cùng các kết luận trước khi sử dụng.

## 3. Một câu thử trượt và bài học của em

Ca HO-14 trong [báo cáo kiểm định C1](../eval/c1-validation-review.md) yêu cầu lập lịch cho hai người lớn từ 09:00 đến 15:00, ngân sách 1.000.000 đồng, bắt buộc xem show 11:00 nhưng show đã bị huỷ.
Hệ thống vẫn xếp show từ 11:00 đến 11:30 và trả trạng thái VALID, trong khi trace không có lời gọi `get_park_incidents` để tra sự cố.
Khi rà nội dung bộ bổ sung, chỉ 8/9 lịch gắn VALID đúng ràng buộc, nên lỗi này vi phạm điều kiện không có lịch hợp lệ nào sai của nhóm.
Em học được rằng điểm tổng cao vẫn có thể đi kèm một lỗi ảnh hưởng trực tiếp đến kế hoạch của người dùng, vì vậy cần đọc cả đầu ra và trace của ca khó.
Là người thuyết trình, em cần giải thích rõ lỗi này và giữ kết luận đúng với bằng chứng, kể cả khi bộ chính đã có điểm nháp 30/30.
Ở lần tiếp theo, em muốn cùng nhóm bổ sung ca show huỷ vào phần kiểm tra trước demo, yêu cầu hệ thống hỏi lại khi hoạt động bắt buộc thay đổi và kiểm lại sau khi sửa bằng một bộ câu mới.
