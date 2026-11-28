# Tổng hợp bằng chứng pain: C1 (lập lịch một ngày tại khu vui chơi)

> Điền ở guide bước 1.2, xong trước **CP3 10:00 Thứ Bảy 28/11**. Chấm ở rubric R1.
> Ba nguồn ngang nhau — tối thiểu **≥1 nguồn đạt ngưỡng**. Mạnh nhất: đào data ra insight → hỏi người dùng để kiểm lại (hoặc ngược lại).

**Nguồn đào dữ liệu cho CP3:** trong 260 mốc tại cùng một trò có cả số phút niêm yết và thực chờ, có 20 mốc chờ lâu hơn ít nhất 10 phút (7,7%). Năm ví dụ có thời điểm để đối chiếu và phép đếm tái lập nằm ở [bảng dữ liệu TouringPlans.com](data-mining.md). Khảo sát của nhóm bổ sung bối cảnh phụ huynh lập lịch.

## 1. Nguồn đã dùng

| Nguồn | Đạt ngưỡng? | File |
|---|---|---|
| Khảo sát (≥20 người ngoài nhóm, đúng người dùng) | ☐ Chưa, có 10 dòng gắn nhãn thật, trong đó 4 đi cùng trẻ nhỏ | [CSV đã ẩn danh](survey/results-c1.csv), [đối chiếu trường và tình trạng bản câu hỏi gốc](survey/questions.md) |
| Phỏng vấn (≥3 người ngoài nhóm, đúng người dùng) | Chưa lưu biên bản riêng, không phải nguồn chính hiện tại | Có thể chọn làm nguồn thay thế hoặc đối chiếu nếu nhóm thực hiện, không tạo biên bản từ CSV khảo sát |
| Đào data (x/N, %, phép đếm chạy lại, ≥5 ví dụ) | Có 20/260 mốc chờ vượt niêm yết ≥10 phút (7,7%), kèm 5 mốc đối chiếu | [TouringPlans, phương pháp và giới hạn](data-mining.md) |

**Phạm vi dữ liệu khảo sát:** bảng trả lời có 20 dòng với cột `loai_du_lieu`. Theo nhãn nhóm lưu, 10 dòng đầu là `nguoi_dung_that`, 10 dòng sau là `tu_viet` và không được đếm vào bằng chứng. Cột nguồn của các dòng đầu ghi “Google Form · có bổ sung trong Sheets”. Repo chưa có bản câu hỏi gốc hoặc lịch sử cho biết ô nào đã được bổ sung, nên phép đếm xác nhận nội dung CSV, chưa xác minh độc lập nguồn gốc và tính nguyên văn. Các số dưới đây chỉ tính bản ghi STT 1 đến 10. Khi trích dẫn “dòng N”, N là giá trị cột `stt`, không tính hàng tiêu đề.

## 2. Số chính

- Khảo sát C1, n = 10 (dưới 10–20 người nên chỉ ghi x/n):
  - 7/10 người kể lần đi gần nhất có sự cố: trễ show hoặc bỏ bớt trò do xếp hàng/đi bộ lâu 3/10; mưa hoặc show huỷ làm rối lịch phần còn lại 2/10; tới nơi mới biết bé không đủ chiều cao/tuổi hoặc trò đóng cửa 2/10. 3/10 đi trơn tru.
  - 6/10 mất từ 30 phút trở lên để lên lịch (30–60 phút: 5/10; trên 60 phút: 1/10); 4/10 mất 15–30 phút.
  - Mỗi người đi khu vui chơi 1 đến 4 lần/năm (trung vị 2).
  - Cách xoay xở: tự tra web/app công viên 5/10; tự kiểm giới hạn tuổi/chiều cao và cộng giá 5/10; xem review/hỏi bạn rồi ước lượng đi bộ, xếp hàng 3/10; hỏi công cụ AI 2/10.
  - 4/10 người đi cùng gia đình có trẻ nhỏ, tức đúng người dùng chính. Trong 4 người này, 2/4 tới nơi mới biết bé không đủ chiều cao/tuổi; 2/4 đi trơn tru nhưng phải tự cân giờ suất diễn với giờ ăn trưa của bé.
- Chưa lưu biên bản phỏng vấn riêng. Khảo sát là nguồn chính đã chọn, không tính các câu trả lời biểu mẫu thành số cuộc phỏng vấn.

## 3. Sáu câu trích đang lưu trong CSV

Các câu dưới đây trùng nội dung trả lời mở trong bảng hiện có. Vì nguồn ghi có bổ sung trong Sheets, vẫn cần đối chiếu bản gốc trước khi xác nhận là lời người tham gia nguyên văn đã được phép trích dẫn.

1. *"Bảng giới thiệu ghi độ tuổi, đến cổng trò mới thấy có thêm vạch đo chiều cao."* (`results-c1.csv` dòng 5, đi cùng gia đình có trẻ nhỏ)
2. *"Trang bán vé không ghi rõ cách đo chiều cao cho bé."* (dòng 7, đi cùng gia đình có trẻ nhỏ, lên lịch trên 60 phút)
3. *"Phải so giờ hai suất diễn để còn kịp cho bé ăn trưa."* (dòng 1, đi cùng gia đình có trẻ nhỏ)
4. *"Ước lượng sai hàng chờ nên nhóm lỡ suất diễn cuối."* (dòng 10)
5. *"Trời mưa đúng lúc cả nhóm ra sân khấu. Tìm một trò trong nhà gần đó mất khá lâu."* (dòng 6)
6. *"Từ cổng đến sân khấu xa hơn mình tính."* (dòng 2)

## 4. Các nguồn có khớp nhau không

Hai nguồn cùng ghi nhận rủi ro khi căn giờ. Dòng 10 trong CSV kể việc lỡ show do ước lượng sai hàng chờ. Nguồn TouringPlans đo trực tiếp chênh lệch thời gian chờ ở một trò tại Mỹ; không thể suy ra tỷ lệ lỡ show hay tỷ lệ phụ huynh Việt Nam gặp vấn đề từ nguồn này.

## 5. Kết luận

Giả thuyết C1 (phụ huynh khó ghép đủ ràng buộc khi lên lịch cho trẻ nhỏ) có dấu hiệu ủng hộ nhưng chưa đủ để kết luận. 7/10 người kể sự cố liên quan đúng các ràng buộc này, nhưng mẫu nhỏ (n = 10, chỉ 4 người đúng nhóm đi cùng trẻ nhỏ), chưa đạt ngưỡng khảo sát ≥20 và các dòng có bổ sung trong Sheets. Điều chưa biết: số phút thực tế phụ huynh bỏ ra và thiệt hại (tiền, hoạt động bị lỡ) mỗi lần.

## Lịch hẹn phỏng vấn (chỉ ghi vai và giờ, không tên)

| Vai | Giờ hẹn | Đã xong? |
|---|---|---|
| Phụ huynh đi khu vui chơi cùng trẻ nhỏ | | |
