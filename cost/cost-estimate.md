# Chi phí khi dùng thật

**Đo trên gpt-6-luna, giá trong bảng là giá mẫu của khung.** Số token dưới đây lấy từ usage của các lượt gọi thật. Các khoản USD minh họa chi phí theo cấu hình mẫu.

## 1. Đầu vào

| Persona | Tỉ lệ cấu hình | Phiên / người / tháng | Lượt hỏi / phiên |
|---|---:|---:|---:|
| dung_it | 50% | 4 | 1 |
| dung_vua | 30% | 10 | 3 |
| dung_nhieu | 20% | 20 | 5 |

Ba persona và quy mô thấp 300, cơ sở 700, cao 1.000 người lấy từ cấu hình mẫu. Nhóm chưa có nguồn xác nhận tần suất dùng và quy mô người dùng thật của VinTrip. [Cấu hình mô phỏng](personas.yaml)

Giá thật gpt-6-luna trên 1 triệu token, tính bằng USD: đầu vào ____ · đầu ra ____ · nguồn và ngày đối chiếu ____. Hai mức giá minh họa ở mục 2 lấy từ cùng cấu hình mẫu.

Run-4 đạt 29/30 câu (96,7%) theo **chấm nháp, chờ nhóm duyệt**. Tại thời điểm chạy simulate-1, chưa có lượt eval điền điểm, nên bản tóm tắt gốc để trống chi phí trên task thành công. [Báo cáo chấm nháp](../eval/report.md)

## 2. Kết quả mô phỏng

Run ID `simulate-1@20261127-232039`, seed 42, 50 phiên, 0 phiên lỗi. Các cột token và số lần gọi là trung bình mỗi phiên trong từng persona. [Dữ liệu phiên](simulate-1.csv) · [Bản tóm tắt gốc](simulate-1-summary.md)

| Persona | Số phiên đo | Lượt hỏi / phiên | Token vào / phiên | Token ra / phiên | Gọi model / phiên | Gọi công cụ / phiên |
|---|---:|---:|---:|---:|---:|---:|
| dung_it | 26 | 1 | 732 | 640 | 1,0 | 5,0 |
| dung_vua | 15 | 3 | 1.760 | 1.452 | 3,0 | 11,9 |
| dung_nhieu | 9 | 5 | 3.767 | 3.291 | 5,0 | 27,3 |

| Model tính giá (USD/1 triệu token vào · ra) | USD / phiên | USD / task thành công theo điểm nháp | USD / tháng thấp | USD / tháng cơ sở | USD / tháng cao | USD / người / tháng cơ sở |
|---|---:|---:|---:|---:|---:|---:|
| gemini-3.1-flash-lite (0,25 · 1,50) | 0,0024 | ≈0,0025 | 10,10 | 23,56 | 33,65 | 0,0337 |
| gemini-4-hydrogen (1,50 · 7,50) | 0,0126 | ≈0,0130 | 52,11 | 121,60 | 173,71 | 0,1737 |
| gpt-6-luna (____ · ____) | ____ | ____ | ____ | ____ | ____ | ____ |

Các cột phiên và tháng chép từ simulate-1-summary. Riêng cột task thành công tính bổ sung theo công thức của khung: chi phí trung bình mỗi phiên trong bảng ÷ (29/30). Đây là phép quy đổi từ tỉ lệ đạt theo câu thử. Mô phỏng đo token cho các phiên nhiều lượt hỏi, chưa đo xác suất thành công của cả phiên.

## 3. So với impact

Chi phí mẫu mỗi người ở kịch bản cơ sở là 0,0337 hoặc 0,1737 USD/tháng tùy bảng giá. Spec §2 đã tổng hợp tần suất đi và thời gian chuẩn bị từ khảo sát, nhưng chưa có quy mô người dùng, tần suất gặp sự cố theo tháng hoặc phép đo thời gian tiết kiệm do VinTrip. Nhóm cần cả đơn giá của model/endpoint đã chạy và mức lợi ích có nguồn trước khi kết luận có đáng triển khai. [AI spec §2](../spec.md)

Các mục đang chờ cho CP4: duyệt lượt eval dùng để tính tỷ lệ thành công, xác nhận đơn giá thật, thay hoặc xác nhận các giả định persona/quy mô với nhãn tự ước tính, rồi tính lại. Không sửa bản simulate-1 hoặc bản tóm tắt do khung đã sinh. Không dùng tỷ lệ nháp 29/30 làm số được duyệt.

## 4. *(Muốn sâu hơn, không bắt buộc)*

Khi có giá thật, tính lại chi phí từng phiên bằng (token vào × giá vào + token ra × giá ra) ÷ 1.000.000. Chi phí hosting, lưu trữ và giờ công người duyệt hiện chưa được đo.
