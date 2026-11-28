# Tổng hợp bằng chứng pain: C1 (lập lịch một ngày tại khu vui chơi)

> Điền ở guide bước 1.2, xong trước **CP3 10:00 Thứ Bảy 28/11**. Chấm ở rubric R1.
> Ba nguồn ngang nhau — tối thiểu **≥1 nguồn đạt ngưỡng**. Mạnh nhất: đào data ra insight → hỏi người dùng để kiểm lại (hoặc ngược lại).

**Hai nguồn đạt ngưỡng R1 cho CP3:** (1) **Đào dữ liệu TouringPlans** — trong `260` mốc tại cùng một trò có cả số phút niêm yết và thực chờ, có **`20/260` mốc (`7,7%`)** khách phải chờ lâu hơn ít nhất `10 phút`, kèm 5 ví dụ đối chiếu và phép đếm tái lập trong [data-mining.md](data-mining.md); và (2) **Phỏng vấn `3/3` phụ huynh ngoài nhóm đi cùng trẻ nhỏ** ([P1.md](interviews/P1.md)–[P3.md](interviews/P3.md)). Khảo sát 10 dòng thật của nhóm được giữ để đối chiếu bổ sung bối cảnh.

## 1. Nguồn đã dùng

| Nguồn | Đạt ngưỡng? | File |
|---|---|---|
| Khảo sát (≥20 người ngoài nhóm, đúng người dùng) | ☐ Chưa, có 10 dòng gắn nhãn thật, trong đó 4 đi cùng trẻ nhỏ (dùng bổ sung bối cảnh) | [CSV đã ẩn danh](survey/results-c1.csv), [đối chiếu trường và tình trạng bản câu hỏi gốc](survey/questions.md) |
| Phỏng vấn (≥3 người ngoài nhóm, đúng người dùng) | ☑ **Đạt** — `3/3` phụ huynh đi cùng trẻ nhỏ ngoài nhóm | [P1.md](interviews/P1.md) · [P2.md](interviews/P2.md) · [P3.md](interviews/P3.md) |
| Đào data (x/N, %, phép đếm chạy lại, ≥5 ví dụ) | ☑ **Đạt** — có `20/260` mốc chờ vượt niêm yết `≥10 phút` (`7,7%`), kèm 5 mốc đối chiếu | [TouringPlans, phương pháp và giới hạn](data-mining.md) |

**Phạm vi dữ liệu khảo sát:** bảng trả lời có 20 dòng với cột `loai_du_lieu`. Theo nhãn nhóm lưu, 10 dòng đầu là `nguoi_dung_that`, 10 dòng sau là `tu_viet` và không được đếm vào bằng chứng. Cột nguồn của các dòng đầu ghi “Google Form · có bổ sung trong Sheets”. Repo chưa có bản câu hỏi gốc hoặc lịch sử cho biết ô nào đã được bổ sung, nên phép đếm xác nhận nội dung CSV, chưa xác minh độc lập nguồn gốc và tính nguyên văn. Các số khảo sát dưới đây chỉ tính bản ghi STT 1 đến 10. Khi trích dẫn “dòng N”, N là giá trị cột `stt`, không tính hàng tiêu đề.

## 2. Số chính

- **Đào data (TouringPlans.com, Kilimanjaro Safaris 2018):** `20/260` mốc (`7,7%`) có thời gian chờ thực tế vượt thời gian chờ niêm yết từ `10 phút` trở lên (xem chi tiết cách đếm chạy lại được và 5 ví dụ có dấu thời gian ở [data-mining.md](data-mining.md)).
- **Phỏng vấn C1 (n = 3 phụ huynh có trẻ nhỏ ngoài nhóm, không ghi %):** **`3/3` người gặp sự cố thực tế** khi đưa trẻ nhỏ đi khu vui chơi (P1: phụ thu trò tính xu ngoài vé cổng; P2: lỡ show 14:00 do không tính đủ quãng đường đi bộ giữa các khu dù chuẩn bị 45–60 phút; P3: bé thiếu 2 cm dưới 1 m không vào được khu nước, bỏ phí tiền vé). Thời gian chuẩn bị 2–60 phút; tần suất đi P1 2–3 lần/tháng, P2 0 lần/1 tháng qua (3–4 lần/năm), P3 1 lần/1 tháng qua (~2 lần/năm).

  | | Vai | Gặp pain? | Số lần / 1 tháng qua | Lần gần nhất mất | Đang xoay xở bằng |
  |---|---|---|---|---|---|
  | P1 | Phụ huynh có 2 con nhỏ (5 tuổi & 2 tuổi) | Có (phụ thu ngoài vé cổng) | 2–3 lần/tháng | 5–10 phút | Fanpage Facebook + ZaloPay/MoMo |
  | P2 | Phụ huynh có con trai 7 tuổi | Có (lỡ show do đi bộ xa) | 0 lần (3–4 lần/năm) | 45–60 phút | TikTok + Klook/Traveloka + ảnh chụp bản đồ |
  | P3 | Phụ huynh đi cùng ông bà & bé gái 4 tuổi | Có (thiếu chiều cao mất vé) | 1 lần (~2 lần/năm) | ~2 phút | Google + hỏi nhóm chat đồng nghiệp |

- **Khảo sát C1 (bổ sung bối cảnh, n = 10 dòng `nguoi_dung_that` — dưới ngưỡng 20 nên chỉ ghi x/n):**
  - `7/10` người kể lần đi gần nhất có sự cố: trễ show hoặc bỏ bớt trò do xếp hàng/đi bộ lâu `3/10`; mưa hoặc show huỷ làm rối lịch phần còn lại `2/10`; tới nơi mới biết bé không đủ chiều cao/tuổi hoặc trò đóng cửa `2/10`. `3/10` đi trơn tru.
  - `6/10` mất từ 30 phút trở lên để lên lịch (30–60 phút: `5/10`; trên 60 phút: `1/10`); `4/10` mất 15–30 phút.
  - Mỗi người đi khu vui chơi 1 đến 4 lần/năm (trung vị 2).
  - Cách xoay xở: tự tra web/app công viên `5/10`; tự kiểm giới hạn tuổi/chiều cao và cộng giá `5/10`; xem review/hỏi bạn rồi ước lượng đi bộ, xếp hàng `3/10`; hỏi công cụ AI `2/10`.
  - `4/10` người đi cùng gia đình có trẻ nhỏ, tức đúng người dùng chính. Trong 4 người này, `2/4` tới nơi mới biết bé không đủ chiều cao/tuổi; `2/4` đi trơn tru nhưng phải tự cân giờ suất diễn với giờ ăn trưa của bé.

## 3. Trích dẫn nguyên văn & ví dụ (≥5 trích dẫn có nguồn, bỏ tên)

**Ba trích dẫn nguyên văn từ 3 phỏng vấn người dùng thật (`P1`–`P3`, gọi điện / nhắn tin ngày 28/11/2026):**
1. *"Cứ tưởng mua vé vào cổng là xong, ai dè tới nơi mấy trò như tô tượng hay gắp thú lại tính tiền xu riêng, thằng lớn nhà mình cứ đứng ăn vạ đòi chơi làm mình lại phải chạy đi đổi tiền lẻ phát mệt."* — **P1** (`interviews/P1.md`)
2. *"Mình đã canh sẵn giờ xem show cá heo lúc 2 giờ chiều rồi, nhưng không tính trước được quãng đường đi bộ từ khu trò chơi cảm giác mạnh sang đó quá xa, lại nắng gắt nên cả nhà đi bộ bở hơi tai tới nơi thì show vừa kết thúc."* — **P2** (`interviews/P2.md`)
3. *"Tới cổng mua vé mới ngã ngửa là khu trò chơi nước yêu cầu bé phải cao trên 1 mét mới được vào dù có bố mẹ đi kèm, con bé nhà mình thiếu đúng 2 phân nên đứng ngoài khóc nức nở, cuối cùng phải bỏ phí tiền vé khu đó."* — **P3** (`interviews/P3.md`)

**Sáu câu trích đang lưu trong CSV khảo sát (nguồn ghi có bổ sung trong Sheets, cần đối chiếu bản gốc trước khi xác nhận nguyên văn):**
4. *"Bảng giới thiệu ghi độ tuổi, đến cổng trò mới thấy có thêm vạch đo chiều cao."* (`results-c1.csv` dòng 5, đi cùng gia đình có trẻ nhỏ)
5. *"Trang bán vé không ghi rõ cách đo chiều cao cho bé."* (`results-c1.csv` dòng 7, đi cùng gia đình có trẻ nhỏ, lên lịch trên 60 phút)
6. *"Phải so giờ hai suất diễn để còn kịp cho bé ăn trưa."* (`results-c1.csv` dòng 1, đi cùng gia đình có trẻ nhỏ)
7. *"Ước lượng sai hàng chờ nên nhóm lỡ suất diễn cuối."* (`results-c1.csv` dòng 10)
8. *"Trời mưa đúng lúc cả nhóm ra sân khấu. Tìm một trò trong nhà gần đó mất khá lâu."* (`results-c1.csv` dòng 6)
9. *"Từ cổng đến sân khấu xa hơn mình tính."* (`results-c1.csv` dòng 2)

*(Ngoài ra còn 5 ví dụ có dấu thời gian thực đo chênh lệch hàng chờ tại [data-mining.md](data-mining.md).)*

## 4. Các nguồn có khớp nhau không

Ba nguồn (**đào data TouringPlans**, **phỏng vấn 3 phụ huynh P1–P3**, và **khảo sát 10 dòng thật**) **khớp hướng rõ rệt**:
- TouringPlans đo được `20/260` mốc (`7,7%`) thời gian chờ thực tế vượt niêm yết ≥10 phút; khảo sát dòng 10 ghi nhận lỡ show vì ước lượng sai hàng chờ; P2 mất 45–60 phút tra cứu nhưng vẫn lỡ show 14:00 do đường đi bộ xa giữa các khu.
- Khảo sát dòng 5, 7 và P3 cùng gặp vấn đề chiều cao/tuổi không rõ trước khi tới cổng; P1 phản ánh thêm chi phí phát sinh ngoài vé cổng. Lưu ý dữ liệu TouringPlans đo tại Mỹ nên không suy ra tỷ lệ phụ huynh Việt Nam gặp vấn đề, còn 3 phỏng vấn bổ sung trực tiếp góc nhìn phụ huynh Việt Nam có trẻ nhỏ.

## 5. Kết luận

Giả thuyết C1 (phụ huynh khó ghép đủ ràng buộc khi lên lịch cho trẻ nhỏ) đạt ngưỡng R1 khi kết hợp nguồn **đào dữ liệu TouringPlans (`20/260` mốc vượt niêm yết ≥10 phút)** và **3 phỏng vấn phụ huynh ngoài nhóm (`3/3` gặp sự cố chiều cao/đi bộ/phụ thu)**, được đối chiếu thêm với 10 dòng khảo sát (`7/10` có sự cố). **Điều vẫn chưa biết:** số tiền thiệt hại cụ thể mỗi sự cố và số phút tiết kiệm thực tế sau khi dùng VinTrip.

## Lịch hẹn phỏng vấn (chỉ ghi vai và giờ, không tên)

| Vai | Giờ hẹn | Đã xong? |
|---|---|---|
| P1 · Phụ huynh có 2 con nhỏ (5 tuổi & 2 tuổi) | 28/11/2026 (gọi điện / nhắn tin) | ☑ Xong (`P1.md`) |
| P2 · Phụ huynh có con trai 7 tuổi | 28/11/2026 (gọi điện / nhắn tin) | ☑ Xong (`P2.md`) |
| P3 · Phụ huynh đi cùng ông bà & bé gái 4 tuổi | 28/11/2026 (gọi điện / nhắn tin) | ☑ Xong (`P3.md`) |
