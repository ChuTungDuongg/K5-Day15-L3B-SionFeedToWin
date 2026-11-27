# Canvas — SionFeedToWin · Track C

> Điền ở guide bước 1.4. CP1 17:00 Thứ Sáu 27/11: nộp bản đầu, đủ 7 dòng (dòng 4 được ghi giả thuyết + nguồn sẽ kiểm).
> CP2 19:30 Thứ Sáu 27/11: cập nhật (số bằng chứng đầu, lát cắt đã chốt) và điền dòng "Đã đổi gì so với CP1".
> Track F: chép thêm thẻ đề của nhóm (khung trong file track F) xuống dưới bảng này.

| # | Dòng | Nhóm điền |
|---|---|---|
| 1 | Track + lát cắt dự kiến | Track C – Du lịch. TripFlix C1: lập lịch một ngày tại một khu vui chơi cho gia đình có trẻ nhỏ; đây là case chính dùng để đánh giá và nộp bài. |
| 2 | Người dùng chính (một vai cụ thể — không phải "học viên nói chung") | Phụ huynh chịu trách nhiệm tự lên lịch đi khu vui chơi cho cả gia đình có trẻ nhỏ, trong một ngày và một ngân sách xác định. |
| 3 | Pain một câu: ai — đang làm gì — vướng đâu — hậu quả | Phụ huynh khi lên lịch đi khu vui chơi phải ghép giờ mở cửa, suất diễn, thời gian đi bộ, chi phí và điều kiện tuổi/chiều cao của trẻ; bỏ sót một ràng buộc có thể khiến cả nhà trễ show, chọn trò trẻ không được tham gia hoặc vượt ngân sách. |
| 4 | Bằng chứng đầu — CP1: giả thuyết + nguồn sẽ kiểm · CP2: số đầu tiên + 1 trích dẫn | Giả thuyết CP1, chưa kiểm chứng: phụ huynh khó ghép đủ các ràng buộc khi lên lịch cho trẻ nhỏ. Dự kiến phỏng vấn ít nhất 3 người ngoài đội từng tự lên lịch đi khu vui chơi cùng trẻ nhỏ, hỏi về lần gần nhất, nguồn thông tin đã dùng, thời gian chuẩn bị và sự cố thực tế; xin phép trích dẫn và lưu ghi chép ẩn danh. Đối chiếu giờ, giá và điều kiện tham gia với nguồn công viên được chọn; dữ liệu chưa có nguồn chỉ dùng dưới nhãn mô phỏng. |
| 5 | **Lát cắt MỘT CÂU** (1 người dùng · 1 việc · 1 quyết định AI · 1 kết quả) | Với thành viên gia đình, tuổi/chiều cao của trẻ, ngày đi, khung giờ, ngân sách và sở thích do phụ huynh cung cấp, AI chọn các hoạt động phù hợp để công cụ xếp và kiểm lịch một ngày tại một công viên, trả timeline kèm bảng tiền và kết quả kiểm ràng buộc hoặc yêu cầu bổ sung dữ kiện/điều chỉnh yêu cầu. |
| 6 | AI tự làm đến đâu + 1 dòng lý do: sai thì ai chịu gì | AI đề xuất, phụ huynh quyết định; công cụ tính và kiểm lại giờ mở cửa, suất diễn, đi bộ, ăn/nghỉ, ngân sách và điều kiện của từng thành viên trước khi đánh dấu lịch hợp lệ. Thiếu dữ liệu quyết định thì hỏi lại hoặc báo thiếu; khi mưa/hủy show chỉ xếp lại phần còn lại, giữ phần đã thực hiện và khoản đã chi. Không tự mua vé hay thanh toán vì lịch sai có thể khiến gia đình mất tiền, lỡ hoạt động hoặc chọn trò không phù hợp với trẻ. |
| 7 | Phân công có tên | Chu Nguyễn Tùng Dương điều phối, quản lý repo, tích hợp demo C1 và nộp checkpoint; Nguyễn Lê Trọng Mạnh dự kiến xây luồng AI, công cụ xếp lịch và kiểm ràng buộc; Hà Lê Duy dự kiến phỏng vấn người dùng, tổng hợp bằng chứng ẩn danh và nguồn dữ liệu; Nguyễn Thiên Bảo cập nhật canvas, dự kiến soạn bộ thử, tổng hợp đánh giá, chi phí và chuẩn bị hồ sơ, kịch bản demo. |
| — | *(CP2)* Đã đổi gì so với CP1 | Bản sửa CP1 ngày 27/11/2026: chuyển từ đọc điều khoản hủy phòng sang TripFlix C1 và đổi người dùng, giả thuyết bằng chứng, phạm vi cùng phân công cho khớp; khi nộp CP2 sẽ bổ sung thay đổi so với bản CP1 này. |

Phạm vi dự kiến P0: một Công viên Mẫu với 15–20 hoạt động, cả gia đình đi chung một lịch, dữ liệu giá/giờ/chờ/đi bộ và sự cố mưa hoặc hủy show có nhãn mô phỏng. Đặt vé, thanh toán, dữ liệu vận hành trực tiếp và tối ưu nhiều nhóm tách nhau nằm ngoài P0. C2 (nâng hạng phòng) và C3 (xử lý hủy chuyến bay) trong tài liệu TripFlix là hướng mở rộng, không thuộc lát cắt chính của canvas này.

Trạng thái: đây là kế hoạch CP1 theo tài liệu “TripFlix C1, C2, C3: Kế hoạch sản phẩm, kiến trúc và demo hackathon” do nhóm cung cấp ngày 27/11/2026, mục 4 và mục 9.1; các chức năng, phỏng vấn và kết quả đánh giá nêu ở đây chưa phải xác nhận đã hoàn thành. Tình huống tự sinh chỉ dùng để kiểm thử có gắn nhãn, không dùng thay bằng chứng người dùng thật.
