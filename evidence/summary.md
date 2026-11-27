# Tổng hợp bằng chứng pain: C1 (lập lịch một ngày tại khu vui chơi)

> Điền ở guide bước 1.2, xong trước **CP3 10:00 Thứ Bảy 28/11**. Chấm ở rubric R1.
> Ba nguồn ngang nhau — tối thiểu **≥1 nguồn đạt ngưỡng**. Mạnh nhất: đào data ra insight → hỏi người dùng để kiểm lại (hoặc ngược lại).

## 1. Nguồn đã dùng

| Nguồn | Đạt ngưỡng? | File |
|---|---|---|
| Khảo sát (≥20 người ngoài nhóm, đúng người dùng) | ☐ Chưa, có 10 dòng gắn nhãn thật, trong đó 4 đi cùng trẻ nhỏ | [CSV đã ẩn danh](survey/results-c1.csv), [đối chiếu trường và tình trạng bản câu hỏi gốc](survey/questions.md) |
| Phỏng vấn (≥3 người ngoài nhóm, đúng người dùng) | ☐ | `evidence/interviews/P1.md`… *(nhóm cần bổ sung trước CP3)* |
| Đào data (x/N, %, cách đếm chạy lại được, ≥5 ví dụ) | ☐ | `evidence/data-mining.md` còn là mẫu chưa điền, chưa có kết quả để dùng cho C1 |

**Phạm vi dữ liệu khảo sát:** bảng trả lời có 20 dòng với cột `loai_du_lieu`. Theo nhãn nhóm lưu, 10 dòng đầu là `nguoi_dung_that`, 10 dòng sau là `tu_viet` và không được đếm vào bằng chứng. Cột nguồn của các dòng đầu ghi “Google Form · có bổ sung trong Sheets”. Repo chưa có bản câu hỏi gốc hoặc lịch sử cho biết ô nào đã được bổ sung, nên phép đếm xác nhận nội dung CSV, chưa xác minh độc lập nguồn gốc và tính nguyên văn. Các số dưới đây chỉ tính bản ghi STT 1 đến 10. Khi trích dẫn “dòng N”, N là giá trị cột `stt`, không tính hàng tiêu đề.

## 2. Số chính

- Khảo sát C1, n = 10 (dưới 10–20 người nên chỉ ghi x/n):
  - 7/10 người kể lần đi gần nhất có sự cố: trễ show hoặc bỏ bớt trò do xếp hàng/đi bộ lâu 3/10; mưa hoặc show huỷ làm rối lịch phần còn lại 2/10; tới nơi mới biết bé không đủ chiều cao/tuổi hoặc trò đóng cửa 2/10. 3/10 đi trơn tru.
  - 6/10 mất từ 30 phút trở lên để lên lịch (30–60 phút: 5/10; trên 60 phút: 1/10); 4/10 mất 15–30 phút.
  - Mỗi người đi khu vui chơi 1 đến 4 lần/năm (trung vị 2).
  - Cách xoay xở: tự tra web/app công viên 5/10; tự kiểm giới hạn tuổi/chiều cao và cộng giá 5/10; xem review/hỏi bạn rồi ước lượng đi bộ, xếp hàng 3/10; hỏi công cụ AI 2/10.
  - 4/10 người đi cùng gia đình có trẻ nhỏ, tức đúng người dùng chính. Trong 4 người này, 2/4 tới nơi mới biết bé không đủ chiều cao/tuổi; 2/4 đi trơn tru nhưng phải tự cân giờ suất diễn với giờ ăn trưa của bé.
- Phỏng vấn: 0/3, cần làm trước CP3.

## 3. ≥5 trích dẫn nguyên văn (có nguồn, bỏ tên)

1. *"Bảng giới thiệu ghi độ tuổi, đến cổng trò mới thấy có thêm vạch đo chiều cao."* (`results-c1.csv` dòng 5, đi cùng gia đình có trẻ nhỏ)
2. *"Trang bán vé không ghi rõ cách đo chiều cao cho bé."* (dòng 7, đi cùng gia đình có trẻ nhỏ, lên lịch trên 60 phút)
3. *"Phải so giờ hai suất diễn để còn kịp cho bé ăn trưa."* (dòng 1, đi cùng gia đình có trẻ nhỏ)
4. *"Ước lượng sai hàng chờ nên nhóm lỡ suất diễn cuối."* (dòng 10)
5. *"Trời mưa đúng lúc cả nhóm ra sân khấu. Tìm một trò trong nhà gần đó mất khá lâu."* (dòng 6)
6. *"Từ cổng đến sân khấu xa hơn mình tính."* (dòng 2)

## 4. Các nguồn có khớp nhau không

Mới có một nguồn (khảo sát n = 10), chưa đối chiếu được. Các sự cố người trả lời kể khớp với các ràng buộc lát cắt C1 kiểm: điều kiện chiều cao/tuổi, giờ suất diễn, thời gian đi bộ và xếp hàng, xếp lại khi mưa/huỷ show. Cần phỏng vấn ≥3 phụ huynh đi cùng trẻ nhỏ để kiểm lại.

## 5. Kết luận

Giả thuyết C1 (phụ huynh khó ghép đủ ràng buộc khi lên lịch cho trẻ nhỏ) có dấu hiệu ủng hộ nhưng chưa đủ để kết luận. 7/10 người kể sự cố liên quan đúng các ràng buộc này, nhưng mẫu nhỏ (n = 10, chỉ 4 người đúng nhóm đi cùng trẻ nhỏ), chưa đạt ngưỡng khảo sát ≥20 và các dòng có bổ sung trong Sheets. Điều chưa biết: số phút thực tế phụ huynh bỏ ra và thiệt hại (tiền, hoạt động bị lỡ) mỗi lần.

## Lịch hẹn phỏng vấn (chỉ ghi vai và giờ, không tên)

| Vai | Giờ hẹn | Đã xong? |
|---|---|---|
| Phụ huynh đi khu vui chơi cùng trẻ nhỏ | | |
