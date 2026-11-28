# Reflection cá nhân: Chu Nguyễn Tùng Dương

- Mã học viên: 2A202604016
- Nhóm: SionFeedToWin
- Lớp: L3B
- Dự án: VinTrip, Track C: Du lịch
- Vai trò: Đội trưởng, phụ trách C2, người thuyết trình và chấm điểm nhóm khác

## 1. Vai trò và phần em làm

Em là đội trưởng theo [TEAMS.md](../TEAMS.md), phụ trách điều phối, quản lý repo, chia đầu việc và lên kế hoạch cho nhóm. Em viết và tổng hợp nội dung CP1, CP2, gồm bài toán, phạm vi trong [canvas.md](../canvas.md) và thiết kế, tiêu chí đánh giá trong [spec.md](../spec.md).
Em phụ trách phần C2 về đề xuất đổi hoặc nâng hạng phòng cho nhân viên khách sạn, với luồng kiểm booking, tồn phòng, chính sách, tính chênh lệch và duyệt đề xuất. Phần triển khai được mô tả trong [tài liệu room-upgrades](../vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/README.md) và dùng dữ liệu mô phỏng.
Em đảm nhận vai trò người thuyết trình, chuẩn bị lời nói khoảng năm phút để giải thích bài toán, luồng xử lý và kết quả demo của nhóm.
Với demo C1, em dùng ca hai bé cao 108 cm và 132 cm, rồi chuyển sang yêu cầu tàu lượn tối thiểu 120 cm để minh hoạ vi phạm. Em đối chiếu [bộ câu thử](../eval/benchmark.csv) và [báo cáo kiểm định C1](../eval/c1-validation-review.md) khi chuẩn bị phần đánh giá.
Em còn tham gia chấm điểm nhóm khác. Công việc này giúp em nhìn bài trình bày theo tiêu chí chung, chú ý phần nào có bằng chứng và phần nào cần giải thích thêm trước khi kết luận.
Điểm em cần cải thiện là chia thời gian rõ hơn giữa điều phối, làm C2 và chuẩn bị thuyết trình, đồng thời chốt mạch bài nói sớm để có thời gian tập cùng bản demo.

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
Em học được rằng điểm tổng cao vẫn có thể đi kèm lỗi ảnh hưởng trực tiếp đến người dùng. Bài học này cũng áp dụng cho C2: đề xuất phòng phải được đối chiếu với tồn phòng và chính sách, còn thao tác duyệt cần đúng quyền.
Là người thuyết trình, em cần giải thích rõ lỗi này và giữ kết luận đúng với bằng chứng, kể cả khi bộ chính đã có điểm nháp 30/30.
Ở lần tiếp theo, em muốn cùng nhóm bổ sung ca show huỷ vào phần kiểm tra trước demo, yêu cầu hệ thống hỏi lại khi hoạt động bắt buộc thay đổi và kiểm lại sau khi sửa bằng một bộ câu mới.
