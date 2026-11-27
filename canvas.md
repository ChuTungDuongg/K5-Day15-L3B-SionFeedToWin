# Canvas VinTrip

Dự án của nhóm SionFeedToWin, lớp L3B, Track C: Du lịch.

VinTrip hỗ trợ phụ huynh lên lịch một ngày tại khu vui chơi cho gia đình có trẻ nhỏ. Bản canvas cập nhật cho CP2 ngày 27/11/2026, kế thừa phạm vi đã chọn ở CP1.

| # | Dòng | Nhóm điền |
|---|---|---|
| 1 | Track + lát cắt dự kiến | Track C: Du lịch. VinTrip tập trung vào việc lập lịch một ngày tại một khu vui chơi cho gia đình có trẻ nhỏ. |
| 2 | Người dùng chính | Phụ huynh trực tiếp lên lịch cho cả gia đình, cần chọn hoạt động phù hợp với trẻ trong thời gian và ngân sách đã định. |
| 3 | Bài toán | Khi lên lịch đi khu vui chơi, phụ huynh phải ghép giờ mở cửa, suất biểu diễn, thời gian đi bộ, chi phí và điều kiện tuổi hoặc chiều cao của trẻ, nên việc bỏ sót một điều kiện có thể khiến gia đình trễ giờ, chọn trò trẻ không được tham gia hoặc vượt ngân sách. |
| 4 | Bằng chứng đầu | CP2: bảng khảo sát có 10 dòng gắn nhãn người dùng thật và 10 dòng tự viết, chỉ đếm 10 dòng đầu. Có 7/10 người kể sự cố, 6/10 chuẩn bị từ 30 phút và 4/10 đi cùng trẻ nhỏ. Trích nội dung đang lưu ở bản ghi STT 5: “Bảng giới thiệu ghi độ tuổi, đến cổng trò mới thấy có thêm vạch đo chiều cao.” Nguồn ghi có bổ sung trong Sheets, cần đối chiếu bản gốc trước khi xác nhận nguyên văn. Khảo sát chưa đủ 20 người đúng đối tượng, phỏng vấn 0/3. Xem [tổng hợp bằng chứng](evidence/summary.md). |
| 5 | **Lát cắt MỘT CÂU** | Từ thông tin gia đình, ngày đi, khung giờ, ngân sách và sở thích do phụ huynh cung cấp, VinTrip dùng AI chọn hoạt động phù hợp để công cụ xếp và kiểm lịch một ngày tại một khu vui chơi, trả lịch theo giờ kèm bảng chi phí và kết quả kiểm tra các điều kiện bắt buộc. |
| 6 | AI tự làm đến đâu và ai quyết định | AI đề xuất lịch để phụ huynh quyết định. Công cụ phải kiểm giờ mở cửa, suất biểu diễn, thời gian đi bộ, ăn nghỉ, ngân sách và điều kiện tham gia của từng thành viên trước khi xác nhận lịch hợp lệ. Thiếu thông tin thì hỏi lại, còn yêu cầu không thể đáp ứng thì nêu điều kiện cần điều chỉnh. VinTrip không tự mua vé hoặc thanh toán vì lịch sai có thể khiến gia đình mất tiền, lỡ hoạt động hoặc chọn trò không phù hợp với trẻ. |
| 7 | Phân công có tên | Phân công dự kiến: Chu Nguyễn Tùng Dương điều phối, quản lý repo, tích hợp bản chạy thử VinTrip và nộp checkpoint. Nguyễn Lê Trọng Mạnh xây luồng AI, công cụ xếp lịch và kiểm điều kiện. Hà Lê Duy phỏng vấn người dùng, tổng hợp bằng chứng ẩn danh và nguồn dữ liệu. Nguyễn Thiên Bảo cập nhật canvas, soạn bộ thử, tổng hợp đánh giá, chi phí và chuẩn bị hồ sơ, kịch bản demo. |
| — | *(CP2)* Đã đổi gì so với CP1 | Bản sửa CP1 ngày 27/11/2026 chuyển từ đọc điều khoản hủy phòng sang lập lịch khu vui chơi và thống nhất tên dự án VinTrip. CP2: bổ sung bằng chứng đầu tiên từ khảo sát (dòng 4), chốt sơ đồ kiến trúc, bộ câu thử 30 câu và chuẩn "đạt" trong `spec.md` §4, §7. |

## Phạm vi bản chạy thử dự kiến

Nhóm dùng một công viên mẫu với 15–20 hoạt động và xếp một lịch chung cho cả gia đình. Đầu vào gồm số người lớn, tuổi và chiều cao của trẻ, ngày đi, giờ đến và về, ngân sách, sở thích cùng các hoạt động bắt buộc.

Kết quả gồm giờ bắt đầu và kết thúc từng hoạt động, thời gian đi bộ, khoảng ăn nghỉ, bảng chi phí và các điều kiện đã kiểm tra. Nếu thiếu dữ liệu, hệ thống phải chỉ rõ phần còn thiếu. Nếu hết thời gian tìm lịch, hệ thống báo chưa tìm được phương án trong thời hạn và chưa kết luận yêu cầu không thể thực hiện.

Khi mưa hoặc hủy buổi biểu diễn, VinTrip dự kiến xếp lại phần lịch còn lại từ vị trí và thời điểm hiện tại. Phần đã thực hiện được giữ nguyên, còn tiền đã chi được tính vào tổng ngân sách để tránh cộng vé hai lần.

Dữ liệu công viên mẫu, giá, thời gian chờ, đi bộ và sự cố dùng để trình diễn sẽ được ghi rõ là mô phỏng. Bản đầu chưa gồm mua vé, thanh toán, dữ liệu vận hành trực tiếp hoặc chia gia đình thành nhiều nhóm đi riêng.

## Trạng thái và bằng chứng

Các chức năng trên là kế hoạch phát triển. Mã nguồn hiện còn là bộ khung dùng model giả, chưa triển khai luồng lập lịch VinTrip. Phỏng vấn, hiệu quả sử dụng, chất lượng lịch và chi phí cần được thu thập hoặc đo trước khi công bố kết quả.

Tài liệu về điều kiện hủy phòng thuộc hướng nghiên cứu trước và chưa dùng làm bằng chứng cho VinTrip. Tình huống tự sinh phải có nhãn mô phỏng, còn trích dẫn người dùng phải có nguồn thật, được đồng ý sử dụng và đã ẩn danh.
