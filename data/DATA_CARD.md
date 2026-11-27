# Data card — C1 (lập lịch một ngày tại khu vui chơi)

> Dữ liệu tự dựng hoặc mô phỏng KHÔNG phải bằng chứng pain. Bằng chứng nằm ở `evidence/`.

## Dataset 1 · Công viên Mẫu (dữ liệu cho 6 công cụ C1)

| | |
|---|---|
| Dùng để làm gì | Nguồn duy nhất cho `get_park_catalog`, `get_show_schedule`, `get_park_incidents`, `estimate_walk`; `build_park_plan` và `validate_park_plan` tính trên cùng snapshot |
| Từ đâu | Nhóm tự dựng theo *kế hoạch sản phẩm C1/C2/C3 của nhóm* mục 4.3; **mô phỏng, không phải công viên thật**. Code C1 (`codebase/park_engine.py`, `codebase/tools.py`) đọc file [`cong_vien_mau.json`](cong_vien_mau.json); `park_mau.json` (ticket C1-01) được giữ làm bản thay thế, xem mục dưới |
| Trường | Công viên (ID, ngày, múi giờ, giờ mở/đóng, cổng) · Hoạt động (ID, khu, thời lượng, chờ mô phỏng, trong/ngoài trời) · Điều kiện (tuổi, chiều cao, người lớn đi cùng) · Show (suất, giờ đến sớm, trạng thái) · Giá (theo nhóm khách, khoản đã gồm, phụ thu) · Ma trận phút đi bộ · Sự cố (mưa, điểm đóng, show huỷ) · `source`, `observedAt`, `snapshotId`, `isMock` |
| Số dòng | File `data/cong_vien_mau.json`: 1 công viên (mở 09:00–19:00), 8 khu, ma trận đi bộ 28 cặp khu, 16 hoạt động (`X1` thiếu điều kiện, `X2` Vườn âm thanh cố ý để trống phụ thu để thử trường hợp thiếu giá của trò bắt buộc), 6 suất show (đến sớm 15 phút), 2 sự cố hôm nay (huỷ suất 11:00 và 15:00) |
| Bảng giá demo | Vé người lớn 300.000đ, trẻ 100–139cm 175.000đ, dưới 100cm miễn phí; ăn trưa 80.000đ/người; chỉ `A1` phụ thu 100.000đ/nhóm → 2 người lớn 600.000đ, 2 bé 350.000đ, ăn trưa 4 người 320.000đ, phụ thu 100.000đ (khớp câu thử `C1-01`, `C1-11`) |
| Phiên bản / ngày | `snapshotId = CVM-2026-11-28-v1`, ngày 28/11/2026; viết tay, không sinh ngẫu nhiên nên không có seed |
| Nhãn | `isMock = true` |
| Giới hạn | Thời gian chờ và đi bộ là mô phỏng; không phản ánh vận hành thật của công viên nào. Mưa không nằm trong snapshot: luồng chính dùng khoảng mưa do phụ huynh báo tại chỗ. Sự cố "hôm nay" chỉ áp dụng khi xếp lại, không áp cho lịch ngày khác |

### Bản thay thế `park_mau.json` (ticket C1-01, code C1 hiện chưa đọc)

Giữ nguyên từ nhánh `vintrip` (commit `0c17673`). Đẹp hơn ở phần show (4 show, 3 sân khấu, có show trong nhà) nhưng danh sách sự cố rỗng, nên chưa đủ căn cứ cho câu thử show bị huỷ (`C1-12`, `C1-27`). Nhóm quyết có chuyển code sang file này không.

| | |
|---|---|
| Từ đâu | Nhóm tự dựng theo *kế hoạch sản phẩm C1/C2/C3 của nhóm* mục 4.3; **mô phỏng, không phải công viên thật**. File [`park_mau.json`](park_mau.json) được phục hồi nguyên bản từ stash C1 `24d4494` (nhánh Manh) theo ticket C1-01 |
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

## Dataset mở rộng C3 · Snapshot chuyến bay mô phỏng trên nhánh vintrip

File: [`c3_snapshot.json`](../vintrip/ai/app/services/assistant/skills/c3_snapshot.json). Nguồn: Codex tự dựng cho demo theo yêu cầu triển khai C3 của nhóm ngày 27/11/2026; nhóm chưa xác nhận kiểm tay. Có 2 đặt chỗ giả, 5 chuyến thay thế giả và 1 quy tắc hoàn/đổi giả; không dùng dữ liệu cá nhân hoặc nhà cung cấp thật. Phiên bản `c3-demo-v1`, `isMock=true`, thời điểm snapshot `2026-11-27T12:00:00+07:00` là mốc mô phỏng; hết hạn báo giá `2026-12-10T09:00:00+07:00`. Giá và tồn chỗ là giá trị tự dựng minh hoạ, không phải số đo thị trường hay bằng chứng pain. Fixture cố định nên không có seed ngẫu nhiên. Xem [giới hạn và kiểm thử C3](../docs/c3-flight-disruption.md).

## Dữ liệu Ocean Park thật (bổ trợ, không thay Công viên Mẫu)

Các bộ dưới đây cào từ trang công khai (VinWonders, GreenSM, Vinhomes Market) hoặc lọc từ seed TripFlix. Chúng phục vụ các ý phụ của Vini (gợi ý điểm, quán ăn, chỗ ở, xe buýt ở Ocean Park và Hà Nội). Câu thử C1 vẫn chạy trên Công viên Mẫu (`isMock`). Không phải bằng chứng pain.

## Dataset 4 · Địa điểm vui chơi Ocean Park (`ocean_park_places.json`)

| | |
|---|---|
| Dùng để làm gì | nguồn cho công cụ `plan_and_verify_itinerary` (lập lịch vui chơi Ocean Park 1/2/3) và câu thử lịch trình |
| Từ đâu | cào công khai 57 trang trên vinwonders.com, greensm.com, market.vinhomes.vn (danh sách URL trong `data/scrape/fetch_pages.py`). vinpearl.com chặn bot (HTTP 403) nên không dùng |
| Xử lý những bước gì | `fetch_pages.py` tải HTML → bóc text → `data/scrape/raw/` (không commit vì bản quyền bài viết). `build_ocean_park.py`: (1) địa điểm, sự kiện, tuyến xe khai báo tay kèm một đoạn `evidence` chép nguyên văn, script kiểm đoạn đó vẫn có trong trang, sai là dừng; (2) quán ăn được parse tự động từ 4 trang có cấu trúc lặp (tên / Địa chỉ / Giờ / Mức giá), gộp trùng theo tên đã bỏ dấu, mỗi quán giữ danh sách `sources` |
| Số dòng | 25 địa điểm, 8 sự kiện/show, 7 tuyến xe buýt / xe điện, 1 vé combo; quán ăn chơi xem mục `venues`, lưu trú xem mục `lodging` |
| Phiên bản / ngày lấy | cào ngày 27/11/2026 (trường `fetched_at` từng dòng). Bài nguồn ghi ngày 29/07/2025, bảng giá ghi "2026" |
| Nhãn | thật (giá vé, giờ có nguồn) + **tự ước tính** cho các trường liệt kê trong `estimated` của từng dòng |
| Giới hạn | Giá là giá ưu đãi trên web, có thể đổi theo ngày, cuối tuần, lễ. Nhiều giờ mở cửa và thời lượng tham quan nguồn không nêu, nhóm tự ước tính. Giờ nghỉ trưa (vd. kayak 12:00–14:00) chỉ ghi trong `price_note`, bộ lập lịch chỉ dùng một khung giờ. Giá Crystal Lagoon lấy từ bài GreenSM 12/2024, cũ hơn các nguồn khác. Tiện ích chỉ cho cư dân (`requires_resident`) bị loại khỏi lịch |

Cập nhật: `python data/scrape/fetch_pages.py && python data/scrape/build_ocean_park.py`. Trang nguồn đổi nội dung thì build báo dòng nào mất căn cứ.

### Phần ăn uống, cà phê, bar, karaoke, chỗ chơi (`venues` trong cùng file)

| | |
|---|---|
| Dùng để làm gì | nguồn cho công cụ `find_venues` (Vini tìm chỗ ăn chơi theo khu, quận, khu Vin, loại, giá, mở khuya) |
| Từ đâu | 4 trang về Ocean Park (parser riêng) + 30 bài tổng hợp VinWonders / GreenSM về Long Biên, Gia Lâm, Cầu Giấy, Ba Đình, Đống Đa, Hoàng Mai và Hà Nội nói chung (`data/scrape/venues.py`, parser chung đọc khuôn "## Tên / Địa chỉ / Giờ / Giá") + 1 bài Vinhomes Market Ocean Park 2 + 1 quán khai báo tay có evidence |
| Xử lý những bước gì | đưa chữ về Unicode NFC (vài trang lưu dấu tách rời) → tách tên quán khỏi câu mô tả trong tiêu đề → bỏ tiêu đề nhóm và dịch vụ ship → suy khu (Ocean Park 1/2/3 hay Hà Nội), quận, khu Vin (Times City, Royal City, Aeon Mall Long Biên…) từ địa chỉ → đổi giờ, giá sang số, đánh dấu `open_late` (mở tới 23:00 trở đi / qua nửa đêm) → gộp trùng khi cùng tên và cùng địa chỉ (chuỗi nhiều chi nhánh vẫn tách) |
| Số dòng | 444 chỗ: 217 nhà hàng, 74 cà phê, 59 quán nhậu, 34 quán ăn (ăn đêm), 30 bar / pub, 20 karaoke, 10 chỗ vui chơi. Ocean Park 54, Hà Nội 390. 287 chỗ có giá, 344 có giờ, 162 mở khuya |
| Nhãn | thật (tên, địa chỉ, giờ, giá trích từ bài viết); không lấy số điện thoại |
| Giới hạn | Bài viết 1–2 năm tuổi, giá và giờ có thể đã đổi. Chỉ 113/444 địa chỉ ghi quận, nên lọc theo quận bỏ sót quán không ghi quận. Một số quán chuỗi ghi nhiều chi nhánh trong một ô địa chỉ. Hai trang "Hà Nội về đêm" và "địa điểm vui chơi Hà Nội" không theo khuôn có địa chỉ nên chưa lấy. Không có karaoke / bar trong Ocean Park ở các nguồn đã cào; Vini nói rõ rồi tìm ở Hà Nội. Tên quán do luật tự tách, có thể còn sót vài tên kèm mô tả |

### Phần lưu trú (`lodging` trong cùng file)

| | |
|---|---|
| Từ đâu | GreenSM "homestay Ocean Park Gia Lâm" (5 homestay, parse tự động tên / địa chỉ / giá ngày thường – cuối tuần), blog Vinhomes Market về Ocean Park 3 (2 khách sạn, biệt thự nguyên căn, 1 homestay), VinWonders "Hung Yen Province" (mô tả StaynFun) |
| Số dòng | 10 chỗ ở: 6 homestay, 2 khách sạn, 1 biệt thự, 1 homestay Vinpearl (StaynFun) |
| Nhãn | `confidence`: "nguồn chính" hoặc "thấp". Dòng "thấp" lấy từ blog có khoảng giá rộng, lệch bảng giá chính thức ở chỗ khác (vd Water Park 100k–300k so với 250k của VinWonders); Vini luôn kèm lời nhắc "cần kiểm lại" |
| Giới hạn | Không có giá StaynFun: staynfun.vinpearl.com và vinpearl.com chặn cả script lẫn trình duyệt tự động (Cloudflare), nhóm không lách. Không cào Booking / Trip.com / Hotels.com (trang động, điều khoản cấm cào). Bài GreenSM 12/2024; lễ Tết tăng 20–30% theo chính bài đó. Hai khách sạn và StaynFun chỉ biết thuộc "Ocean Park", chưa rõ khu |

### Phần trò chơi và bảng giá vé khu vui chơi (`park_catalog` trong cùng file)

| | |
|---|---|
| Dùng để làm gì | Nguồn cho công cụ `get_park_catalog` (`codebase/tools.py`, `is_mock = false`, `snapshot_id` = băm file data). Bản thật để đối chiếu hoặc thay dần Công viên Mẫu: giá vé theo chiều cao, quy định vé, dịch vụ thu thêm, danh sách trò của VinWonders Wave Park (OP2), Water Park (OP3) và trò tính phí ở Grand World |
| Từ đâu | Bảng giá + nội quy chính thức `vinwonders.com/vi/vinwonders-wave-park-water-park-price-regulations/`; danh sách trò từ 5 bài Wonderpedia (`data/scrape/rides.py`) |
| Số dòng | 7 dòng giá vé (≥140cm, 80–140cm, <80cm miễn phí; ngày thường / cuối tuần & lễ; combo 2 công viên), 6 quy định vé, 6 dịch vụ thu thêm, 21 trò (Water Park 11, Wave Park 8, Grand World 2) |
| Nhãn | thật; mỗi giá vé được build kiểm lại trên trang quy định. `kid_zone`, `thrill`, `indoor` suy từ chính câu mô tả của nguồn |
| Giới hạn | **VinWonders không công bố giới hạn chiều cao của từng trò ở Ocean Park** — nội quy chỉ ghi "tuân thủ quy định chiều cao của từng trò" tại chỗ — nên `min_height_cm` để trống, không tự đặt số. Không có thời lượng chơi, thời gian chờ, phút đi bộ giữa các khu, lịch show từng suất đầy đủ và sự cố trong ngày; các phần này vẫn phải mô phỏng như Công viên Mẫu |

## Dataset 5 · Hạng phòng khách sạn sát Ocean Park (`rooms_sample.json`)

| | |
|---|---|
| Dùng để làm gì | nguồn cho `draft_room_change` (bản nháp đổi hạng phòng) |
| Từ đâu | seed khách sạn của `vintrip/be/.../commerce/db/seed/catalog.json` (bản sao TripFlix). Lọc khách sạn cách tâm Ocean Park 1/2/3 ≤ 3km bằng `data/scrape/build_rooms.py` |
| Số dòng | 9 hạng phòng của 4 khách sạn: Ks Á Đông (0,3km), Homestay HL, Tiny Cozy House (1,6km), Melia Grand Hotel (1,8km) |
| Nhãn | tên khách sạn và toạ độ thật (OpenStreetMap, mã node trong trường `source`); hạng phòng, giá, gói hủy là `synthetic` do seed TripFlix sinh; phụ phí đổi phòng 0 *(tự ước tính)* |
| Giới hạn | giá không phải giá niêm yết thật; tâm từng khu Ocean Park đọc xấp xỉ trên bản đồ |

## Dataset 6 · Chính sách hủy mẫu (`policies_sample.json`)

| | |
|---|---|
| Dùng để làm gì | nguồn cho `lookup_cancel_policy`, `calculate_cancel_fee` |
| Từ đâu | nhóm tự viết |
| Nhãn | `synthetic` |
| Số dòng | 5 chính sách [C1]–[C5], giờ nhận phòng 14:00 Asia/Ho_Chi_Minh. Đã bỏ 3 chính sách khách sạn nước ngoài (Tokyo, Singapore, Dubai) vì Ocean Park không dùng |
| Giới hạn | chưa đối chiếu điều khoản thật của khách sạn Ocean Park. Người dùng vẫn ghi được múi giờ khác trong câu hỏi (vd UTC) và công cụ vẫn tính theo múi đó |
