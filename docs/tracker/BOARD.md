# Bảng việc C1 — người giao và nghiệm thu: Claude · người làm: Codex

## Rà soát hồ sơ checkpoint ngày 28/11/2026

Đối chiếu hai tài liệu nhóm cung cấp: `SionFeedToWin-huong-dan.html` (bước 06–23) và `slide-kickoff-zoom-hoc-vien-k5.html` (các trang CP1–CP4, điều kiện xét giải và khóa repo). Ví dụ hủy phòng trong sổ tay được áp dụng theo phạm vi lập lịch khu vui chơi hiện tại. Chỉ kiểm phần đã lưu trong repo, chưa xác minh việc gửi Form 1/Form 2 hoặc trạng thái cổng BTC.

**Kết luận:** CP1 và CP2 đủ các nội dung bắt buộc trong repo. Nhóm xác nhận chưa làm/nộp CP3 và CP4. Những code, log eval và mô phỏng đã xuất hiện là phần chuẩn bị, chưa được dùng để tự đánh dấu checkpoint hoàn tất.

| Mốc và hạn giờ Việt Nam | Phải có | Tình trạng hồ sơ |
|---|---|---|
| CP1, 17:00 ngày 27/11 | Repo công khai, TEAMS đủ 4 người, Track, canvas 7 mục, bài toán không dùng chữ AI và lát cắt một câu | Có đủ file và nội dung, `run.py check` nhận 4 thành viên. Chưa có xác nhận Form và đúng hạn để đối chiếu trong repo |
| CP2, 19:30 ngày 27/11 | Spec §4 có sơ đồ, ≥10 câu thử, ≥3 metric, data card, khung chạy được bằng AI giả, §7 chốt ngưỡng số | Đủ sơ đồ, 30 câu, 4 metric, data card, ngưỡng số và ghi nhận khung chạy AI giả. Chuẩn đạt giữ nguyên. Không đòi khảo sát đủ ngưỡng hoặc video phải xong ở mốc này |
| CP3, 10:00 ngày 28/11 | Ít nhất một nguồn bằng chứng đạt ngưỡng và ≥5 trích dẫn, 20–30 câu, AI thật ở quyết định chính, video 30 giây, eval lượt 1 có điểm và run ID | Nhóm chưa làm/nộp. Có 30 câu, code và các log model, nhưng còn chờ các mục nêu dưới đây |
| CP4, 14:30 ngày 28/11 | So sánh hai lượt sau một cải tiến, mô phỏng ≥50 phiên, chi phí/task thành công, slide PDF ở gốc và video dự phòng, bốn điều kiện xét giải | Nhóm chưa làm/nộp. Có log 50 phiên nhưng giá và tần suất còn là mẫu; chưa có slide hoặc video |
| Khóa repo, 23:59 ngày 28/11 | Changelog, docs/ai-usage, reflection đủ 4 người, hoàn thiện link và hướng dẫn chạy | Changelog và khai báo AI đã có. Reflection hiện chỉ có TEMPLATE, chưa có bài của 4 thành viên |

### Các mục đang chờ

| Mục | Đã có | Chờ gì / ai dự kiến phụ trách theo TEAMS |
|---|---|---|
| Bằng chứng CP3 | 10 dòng gắn nhãn thật, 10 tự viết; chỉ 4/10 đi cùng trẻ nhỏ; 6 câu trả lời mở | Hà Lê Duy: khảo sát đủ ≥20 người ngoài đội đúng đối tượng và đối chiếu nguồn gốc, sự đồng ý trích dẫn. Có thể chọn nguồn thay thế đạt ngưỡng, không bắt buộc làm thêm cả khảo sát lẫn phỏng vấn |
| Vai trò model trong C1 | Model có token trong log, code lập và kiểm lịch | Nguyễn Lê Trọng Mạnh: hiện model chỉ diễn đạt kết quả cuối, chưa tham gia quyết định trung tâm. Cần hoàn thiện và chứng minh trước khi xác nhận điều kiện AI thật |
| Điểm eval CP3 | Run-2 nháp 26/30, run-4 nháp 29/30, hai metric code run-4 kiểm được 25/25 và 14/14 | Nguyễn Thiên Bảo và người duyệt: chọn lượt, duyệt từng câu và hai metric người chấm, người thứ hai kiểm 5 output. Các run gốc còn trống pass, chưa có điểm chính thức |
| Video CP3 | Nhóm xác nhận chưa có | Chu Nguyễn Tùng Dương điều phối quay 30 giây với input, lời gọi thật và kết quả; cấp quyền và mở thử ẩn danh |
| Hai lượt CP4 | Có run-1 đến run-4 và log thay đổi | Nhóm chọn cặp lượt, ghi rõ cải tiến và so sánh bằng cùng benchmark. Giữ cả lượt lỗi và lượt chạy giữa lúc sửa |
| Chi phí CP4 | Simulate-1 có 50 phiên, seed 42, token model gpt-6-luna | Chờ nguồn đơn giá model/endpoint, duyệt tỷ lệ thành công và xác nhận giả định persona/quy mô. Giá Gemini trong bảng là kịch bản mẫu, không phải phí thực trả |
| Slide và video dự phòng | Chỉ có dàn ý slide | Nhóm xác nhận chưa làm. Chờ `demo-slides.pdf` ở gốc và link video được cấp quyền |
| Reflection cuối ngày | TEMPLATE có 3 câu hỏi | Mỗi thành viên tự viết trải nghiệm thật, phần việc và câu thử trượt. Không điền thay trải nghiệm chưa được xác nhận |
| Tình trạng nộp | Hướng dẫn đã có link các Form | Đội trưởng đối chiếu biên nhận và cổng BTC. Có file trên GitHub chưa xác nhận được đã gửi Form đúng hạn |

Không tự tick đủ bốn điều kiện xét giải chỉ vì `run.py check` đạt. Phần kiểm cấu trúc không xác minh nguồn khảo sát, tính đúng của mọi câu trả lời, vai trò AI hoặc quyền xem video. Chuẩn đạt §7, metric, benchmark và các lượt đã chạy được giữ nguyên khi rà hồ sơ.

Kiểm tra trong worktree rà soát: `python run.py check` đạt; 73 test có sẵn chạy với `MODEL_PROVIDER=fake` đều qua; checker run-4 đối chiếu được 25/25 câu có căn cứ và 14/14 lịch VALID sau khi chuẩn hóa xuống dòng. Kiểm tra cố ý thay một đoạn nội dung vẫn bị checker phát hiện. Không gọi API thật, không chạy thêm eval hoặc simulate, không điền cột pass và không thay trạng thái nghiệm thu ticket bên dưới.

## Theo dõi triển khai C1

> Chỉ tiêu chất lượng của nhóm: **≥ 24/30** câu và đủ 4 ngưỡng ở `spec.md` §7. Đây là chuẩn chất lượng đã chốt, không phải yêu cầu phải đạt 80% mới được nộp CP3. Tài liệu kickoff cho phép nộp kết quả thấp nhưng thật. Mốc triển khai ban đầu (27/11 22:40): **~3/30**.
> C3 (chuyến bay bị huỷ) làm ở nhánh riêng `c3-flight-disruption`. Thư mục này chỉ làm C1.

## Quy trình

1. **Codex** lấy ticket `TODO` trên cùng, đổi trạng thái thành `ĐANG LÀM`, làm xong thì chuyển `CHỜ NGHIỆM THU`. Mỗi ticket ít nhất một commit, tiêu đề bắt đầu bằng mã ticket, ví dụ `[C1-02] validator ...`.
2. **Codex không tự chuyển `XONG`.** Chỉ Claude chuyển, sau khi chạy test thật và ghi kết quả vào mục "Nhật ký nghiệm thu".
3. Claude không đạt thì chuyển `LÀM LẠI`, ghi rõ lý do. Codex làm lại ticket đó trước khi nhận ticket mới.
4. Kẹt hoặc cần quyết định: ghi vào cột "Ghi chú", để trạng thái `KẸT`, rồi chuyển sang ticket không phụ thuộc.

## Bảng

| Mã | Việc | Phụ thuộc | Trạng thái | Ghi chú |
|---|---|---|---|---|
| C1-00 | Dọn chỗ làm: cất thay đổi C3 vào stash | — | XONG | C3 đã cất trong stash 7f7aaaa, tên "C3 da chuyen sang nhanh c3-flight-disruption" (25 file, gồm file chưa theo dõi). Giữ nhánh vintrip; stash C1 cũ 24d4494 còn nguyên. |
| C1-01 | Dữ liệu Công viên Mẫu + test dữ liệu | C1-00 | XONG | Phục hồi nguyên bản park_mau.json từ stash 24d4494; Dataset 1 đã cập nhật. 13 test dữ liệu đạt (7 mục bắt buộc, tổng 1.370.000đ và tối thiểu 1.270.000đ); toàn bộ 41 unittest và run.py check đạt với MODEL_PROVIDER=fake. |
| C1-02 | `validate_park_plan` + test từng luật | C1-01 | CHỜ NGHIỆM THU | Đã có trong commit `f42e681`: `park_engine.validate_plan` + công cụ `validate_park_plan`; test ở `tests/test_c1_park_plan.py` (bé 108 cm với trò ≥120 cm, vượt ngân sách, mưa, show trễ). |
| C1-03 | 4 công cụ đọc + `build_park_plan` | C1-01, C1-02 | CHỜ NGHIỆM THU | Đã có trong `f42e681`: `get_park_catalog`, `get_show_schedule`, `get_park_incidents`, `estimate_walk`, `build_park_plan` (beam search thư viện chuẩn, SEARCH_TIMEOUT trung thực). Đọc `data/cong_vien_mau.json`, chưa đọc `park_mau.json`. |
| C1-04 | Luồng `answer()` C1, các trạng thái, khoá `plan` | C1-03 | CHỜ NGHIỆM THU | Đã có trong `f42e681`: `codebase/c1_flow.py` (VALID/NEEDS_INPUT/MISSING_DATA/INFEASIBLE/SEARCH_TIMEOUT, xếp lại khi mưa/huỷ show), gọi từ `agent._route`. |
| C1-05 | Từ chối và phạm vi C1 (5 câu `tu_choi`) | C1-04 | CHỜ NGHIỆM THU | Đã có trong `f42e681`: từ chối mua vé/thanh toán/đặt chỗ, nới chiều cao, injection, lộ system prompt/.env (C1-15…19). |
| C1-06 | Model: báo rõ chế độ offline, model chỉ chuẩn hoá và giải thích | C1-04 | CHỜ NGHIỆM THU | Đã có trong `f42e681`: model chỉ diễn đạt lại căn cứ đã kiểm (`agent._verified_reply`). Lưu ý: đã chạy `run.py eval` có đánh số `run-1..4` bằng gpt-6-luna trước khi biết luật bảng này; nhóm quyết lượt dùng để chấm. |

## Luật chung (mọi ticket)

- Không sửa `run.py`, `codebase/tracing.py`, `eval/run_eval.py`, `cost/simulate.py`, `spec.md` §7, `eval/metric_spec.yaml`, cột `expected` của `eval/benchmark.csv`.
- Không cài câu thử vào code: không so khớp nguyên văn input, không rẽ nhánh theo mã C1-xx.
- **Không chạy `python run.py eval` bản đầy đủ** (tạo `eval/run-N.csv` được tính điểm). Claude chấm bằng script gọi thẳng `answer()`.
- Chạy test với `MODEL_PROVIDER=fake`. Không gọi model thật khi chưa được duyệt.
- Mọi thay đổi sau CP2: thêm 1 dòng vào nhật ký `spec.md` §10.

---

## C1-00 · Dọn chỗ làm

Thư mục đang có thay đổi C3 chưa commit (đã sao lưu sang nhánh `c3-flight-disruption`, mốc `542af2a`). Cất lại, không xoá:

```
git stash push -u -m "C3 da chuyen sang nhanh c3-flight-disruption"
```

**Nghiệm thu:** `git status` sạch, ngoại trừ `.env` (bị git bỏ qua), vẫn ở nhánh `vintrip`.

## C1-01 · Dữ liệu Công viên Mẫu

- Lấy file viết sẵn từ stash "WIP agent C1 tren Manh" (xem số thứ tự bằng `git stash list`): `git restore --source=stash@{N}^3 -- data/park_mau.json`.
- File có 16 hoạt động, 4 show, ma trận đi bộ; giá `adult 300000`, `child 175000`, `lunch_per_person 80000`, Làng cổ tích phụ thu 25000/người; mở cửa 08:00–19:00; `snapshotId`, `isMock: true`.
- Giá phải khớp đáp án: C1-01 tổng 1.370.000; C1-11 tối thiểu 1.270.000.
- Cập nhật `data/DATA_CARD.md` Dataset 1 (bỏ chữ "chưa tạo").

**Nghiệm thu:** có test kiểm dữ liệu có đủ: show 11:00; show trưa có 2 suất; show đầu giờ chiều; suất cuối ngày; trò yêu cầu ≥ 120 cm; hoạt động trong nhà cùng khu với sân khấu ngoài trời; một hoạt động thiếu điều kiện.

## C1-02 · `validate_park_plan`

Hàm thuần, tính lại độc lập trên cùng dữ liệu, trả danh sách vi phạm và tổng tiền. Phải kiểm:

- trong khung giờ khách và giờ mở cửa;
- không chồng giờ, đủ phút đi bộ;
- show đúng suất, đủ giờ đến sớm;
- **từng bé** đủ tuổi và chiều cao cho mọi hoạt động;
- tổng tiền (vé, ăn, phụ thu, đã chi) ≤ ngân sách;
- ăn trưa liên tục đủ phút, trong khung yêu cầu;
- không hoạt động ngoài trời trong khoảng mưa;
- yêu cầu bắt buộc vẫn còn;
- xếp lại: giữ phần đã xong, không cộng vé cổng lần hai.

**Nghiệm thu:** mỗi luật có ít nhất 1 test, test đỏ khi luật sai. Có ca bé 108 cm với trò ≥ 120 cm, và ca 1.270.000 > 1.000.000.

## C1-03 · Công cụ đọc và bộ xếp lịch

- `get_park_catalog`, `get_show_schedule`, `get_park_incidents`, `estimate_walk`: chỉ đọc dữ liệu, có `@tool`, docstring đủ 4 ý (tên · input · output · có tác động ra ngoài không).
- `build_park_plan`: thuật toán tham lam bằng thư viện chuẩn. Đặt cố định show bắt buộc và bữa trưa trước, rồi lấp trò theo điểm (sở thích, đi bộ, hàng chờ). Phút và tiền là số nguyên. Ghi `shortcut:` kèm giới hạn.
- `INFEASIBLE` khi có cơ sở: tổng phút > khung giờ (10 × 20 > 120), hoặc chi phí tối thiểu > ngân sách. Hết thời gian thì `SEARCH_TIMEOUT`.

**Nghiệm thu:** test với gia đình mẫu (2 người lớn, bé 5 tuổi 108 cm, bé 9 tuổi 132 cm, 09:00–14:00, 1.500.000 đ, show 11:00, ăn trưa 45 phút) ra lịch mà `validate_park_plan` không báo lỗi, tổng 1.370.000.

## C1-04 · Luồng `answer()` cho C1

- Câu nhắc khu vui chơi / Công viên Mẫu / lịch đi chơi thì vào luồng C1. Các luồng Vini khác giữ nguyên cho câu không phải C1.
- Đọc từ câu: người lớn, tuổi và chiều cao từng bé, khung giờ, ngân sách, sở thích, show bắt buộc, ăn trưa (phút, khung giờ, "trước show"), mưa / huỷ show, đã chi, vị trí hiện tại. Bỏ số chiều cao của *trò* khỏi phần đọc chiều cao của bé.
- Trạng thái:
  - `NEEDS_INPUT`: thiếu tuổi/chiều cao bé, khung giờ, ngân sách;
  - `MISSING_DATA`: công viên lạ;
  - `INFEASIBLE`;
  - `VALID` chỉ khi validator không báo lỗi;
  - show bắt buộc bị huỷ thì hỏi trước khi bỏ;
  - mưa thì xếp lại phần còn lại.
- Output có dòng `TRẠNG THÁI: <status> · TỔNG: <số> đ · NGÂN SÁCH: <số> đ`, rồi timeline, bảng tiền, kết quả kiểm.
- Trả thêm khoá `plan`: `status`, `timeline[{start,end,name,type,note}]` (type ride/show/food/walk), `costs[{item,amount}]`, `total`, `budget`, `kids[{label,ok,blocked}]`, `checks[{ok,text}]`, `questions[]`.

**Nghiệm thu:** Claude chấm 30 câu, các câu `thuong` và `kho` đạt ≥ 19/25.

## C1-05 · Từ chối và phạm vi C1

- Mua vé, thanh toán; đặt khách sạn, vé máy bay: từ chối, nêu phạm vi "chỉ lập và kiểm lịch một ngày ở khu vui chơi".
- Ép bỏ giới hạn chiều cao: không nới, nêu căn cứ từ catalog, gợi ý trò hợp với bé.
- Prompt injection ép `VALID`, đòi lộ system prompt hay API key: chặn bằng code trước khi gọi model.
- Câu trả lời C1 không còn lời mời "đổi phòng".

**Nghiệm thu:** 5/5 câu `tu_choi` (C1-15…C1-19) đạt.

## C1-06 · Model

- Model chỉ chuẩn hoá câu khó hoặc viết lời giải thích. Giờ và tiền luôn lấy từ công cụ.
- `codebase/ai.py` đang lặng lẽ chạy offline với 0 token khi thiếu key. Phải ghi rõ chế độ offline (note trong trace và một dòng trong output), không im lặng.

**Nghiệm thu:** test chứng minh khi không có key thì có ghi chú offline; khi `MODEL_PROVIDER=fake` thì vẫn chạy hết 30 câu, không lỗi.

---

## Nhật ký nghiệm thu (Claude ghi)

| Thời điểm | Ticket | Kết quả | Bằng chứng |
|---|---|---|---|
| 27/11 22:40 | — | Mốc ban đầu | unittest 40/40 (1 skip); `run.py check` đạt; 30 câu C1 ~3/30 |
| 27/11 23:06 | C1-00 | XONG | Nhánh `vintrip`, `git status` sạch (`.env` bị bỏ qua). Stash C3 có 17 file đã theo dõi và 8 file mới, khớp từng file với mốc `542af2a` ở nhánh `c3-flight-disruption`. Commit `e67ef50` chỉ sửa bảng và một dòng nhật ký §10; §7 giữ nguyên. unittest đạt (1 skip); `run.py check` đạt. |
| 27/11 23:16 | C1-01 | XONG | `data/park_mau.json` khớp từng byte với bản gốc trong stash. Giá ra đúng: gia đình mẫu 1.370.000, tối thiểu 1.270.000. `tests/test_park_data.py` có 13 test, đủ 7 mục bắt buộc (show 11:00, show trưa 2 suất, show đầu giờ chiều, suất cuối ngày, trò ≥ 120 cm, hoạt động trong nhà cùng khu sân khấu, hoạt động thiếu điều kiện) và 2 test giá. DATA_CARD bỏ chữ "chưa tạo". §7 giữ nguyên. unittest đạt, `run.py check` đạt. |
