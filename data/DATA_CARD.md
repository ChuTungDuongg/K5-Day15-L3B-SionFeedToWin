# Data card — C1 (lập lịch một ngày tại khu vui chơi)

> Dữ liệu tự dựng hoặc mô phỏng KHÔNG phải bằng chứng pain. Bằng chứng nằm ở `evidence/`.

## Dataset 1 · Công viên Mẫu (dữ liệu cho 6 công cụ C1)

| | |
|---|---|
| Dùng để làm gì | Nguồn duy nhất cho `get_park_catalog`, `get_show_schedule`, `get_park_incidents`, `estimate_walk`; `build_park_plan` và `validate_park_plan` tính trên cùng snapshot |
| Từ đâu | Nhóm tự dựng theo *kế hoạch sản phẩm C1/C2/C3 của nhóm* mục 4.3; **mô phỏng, không phải công viên thật**. File [`park_mau.json`](park_mau.json) được phục hồi nguyên bản từ stash C1 `24d4494` (nhánh Manh) theo ticket C1-01 |
| Trường | Công viên (ID, ngày, múi giờ, giờ mở/đóng, cổng) · Hoạt động (ID, khu, thời lượng, chờ mô phỏng, trong/ngoài trời) · Điều kiện (tuổi, chiều cao, người lớn đi cùng) · Show (suất, giờ đến sớm, trạng thái) · Giá (theo nhóm khách, khoản đã gồm, phụ thu) · Ma trận phút đi bộ · Sự cố (mưa, điểm đóng, show huỷ) · `source`, `observedAt`, `snapshotId`, `isMock` |
| Số dòng | 1 công viên, 16 hoạt động, 4 show (8 suất), ma trận đi bộ đủ 28 cặp giữa 8 khu/vị trí và thời gian cùng khu; danh sách sự cố ban đầu rỗng |
| Bảng giá demo | Người lớn 300.000đ; trẻ từ 100 đến dưới 140 cm: 175.000đ; dưới 100 cm miễn vé, từ 140 cm tính vé người lớn. Ăn trưa 80.000đ/người. Vé cổng gồm các trò, trừ phụ thu Làng cổ tích 25.000đ/người |
| Đối chiếu gia đình mẫu | 2 người lớn và bé cao 108, 132 cm: vé 600.000 + 350.000, ăn trưa 4 × 80.000 = 320.000 → tối thiểu **1.270.000đ**, vượt ngân sách 1.000.000đ **270.000đ** (`C1-11`). Thêm Làng cổ tích 4 × 25.000 = 100.000 → **1.370.000đ**, còn 130.000đ trên ngân sách 1.500.000đ (`C1-01`) |
| Phiên bản / ngày | `snapshotId: park-mau-2026-11-27-v1`, `observedAt: 2026-11-27`; dữ liệu cố định, không sinh ngẫu nhiên nên không dùng seed. Mở cửa 08:00–19:00, múi giờ `Asia/Ho_Chi_Minh` |
| Nhãn | `isMock = true` |
| Giới hạn | Giá, thời gian chờ và đi bộ đều tự dựng cho demo; không phản ánh vận hành thật của công viên nào. Ma trận đi bộ lưu một nửa, dùng đối xứng khi đọc; cùng khu dùng `same_zone`. Hoạt động A16 có tuổi/chiều cao `null`: chưa biết điều kiện, không được hiểu thành không giới hạn |
| Kiểm dữ liệu | [`tests/test_park_data.py`](../tests/test_park_data.py): 7 ca dữ liệu bắt buộc của ticket, hai phép tính tiền độc lập, kiểm cấu trúc, giờ show và độ phủ ma trận đi bộ. Đây là kiểm dữ liệu, chưa xác nhận solver/validator C1 đã triển khai |

## Dataset 2 · Khảo sát C1 (`evidence/survey/results-c1.csv`)

| | |
|---|---|
| Dùng để làm gì | Bằng chứng pain (`evidence/summary.md`) và nguồn của 11 câu thử `nguoi_dung` (`C1-20`…`C1-30`) |
| Từ đâu | Google Form của nhóm, ngày 27/11/2026 |
| Xử lý | Chỉ giữ các cột câu hỏi C1, bỏ cột nhận ra người trả lời; cột `loai_du_lieu` tách 10 dòng thật (`nguoi_dung_that`) và 10 dòng nhóm tự viết trong Sheets (`tu_viet`) |
| Số dòng | 20 (10 thật, 10 tự viết; chỉ 10 dòng thật được đếm) |
| Giới hạn | n = 10, dưới ngưỡng khảo sát ≥20; 10 dòng thật có ghi "có bổ sung trong Sheets"; chỉ 4/10 đi cùng trẻ nhỏ |

## Dataset 3 · Bộ câu thử (`eval/benchmark.csv`)

| | |
|---|---|
| Số câu | 30 (`thuong` 14 · `kho` 11 · `tu_choi` 5) |
| Nguồn | `nguoi_dung` 11 (dựng từ khảo sát thật, ghi dòng nguồn) · `tu_viet` 19 (kịch bản demo và tình huống ở `spec.md` §5) |

## Ngữ cảnh trong câu thử

Một số câu xếp lại lịch có thêm lịch trước đó, vị trí hiện tại hoặc khoản đã chi ngay trong ô `input` của `eval/benchmark.csv`. Đây là bối cảnh mô phỏng do nhóm bổ sung để mỗi câu chạy độc lập. Không phải dữ liệu phỏng vấn và không được cộng vào bằng chứng. Phần `expected` và `pass_criterion` được giữ nguyên.

## Dữ liệu của lát cắt cũ (không dùng cho C1)

Nhánh main hiện không có các bộ dữ liệu nghiệp vụ hủy phòng, khách sạn, chuyến bay hay lịch chuyến đi. Bộ khung chỉ có công cụ trả một đoạn dữ liệu ví dụ. Tài liệu cũ trên máy chưa commit không phải dữ liệu của VinTrip và không được dùng thay bằng chứng C1.
