# C3 · Xử lý chuyến bay bị huỷ trên nhánh vintrip

Đây là phần mở rộng demo theo yêu cầu của nhóm, chạy qua `python run.py` và chat Vini (`POST /chat`, SSE). Bộ đánh giá C1 và chuẩn đạt ở `spec.md` §7 giữ nguyên. C3 chưa có dữ liệu hay bằng chứng người dùng thật, chưa tích hợp nhà cung cấp vé.

C3 có hai phần:

- **Luồng có trạng thái `TRV-7Q2K`** (`c3_flow.py`, chỉ chạy qua CLI `python run.py`): giữ chỗ, đổi vé, yêu cầu hoàn trên một adapter nhà cung cấp giả lập trong bộ nhớ. Đây là lát cắt chính của C3, mô tả ngay dưới đây.
- **Bản nháp chỉ đọc `DEMO-C3-001`** (`c3_engine.py`, CLI và chat SSE): xem phương án và soạn bản nháp chờ duyệt, mô tả từ mục "Chạy thử bản nháp chỉ đọc".

## Luồng có trạng thái TRV-7Q2K

Lát cắt: hành khách đi cùng con nhỏ báo chuyến `VT-DEMO-215` HAN → SGN tối 10/12/2026 bị huỷ (lý do mẫu: thời tiết), muốn bay sáng hôm sau. Booking mô phỏng `TRV-7Q2K` có 1 người lớn (`P1`) và 1 trẻ em (`P2`, người đi kèm `P1`), đã trả 3.400.000đ. `TRV-UM01` là booking chỉ có một trẻ em. Mọi chuyến, ghế, giá, chính sách (`DEMO-IROP-V1`) là dữ liệu tự dựng, không phải của hãng thật; mọi câu trả lời ghi "Mô phỏng".

Chạy `python run.py` rồi nhập lần lượt (phiên C3 giữ trong tiến trình CLI):

```text
Chuyến bay bị huỷ, mã TRV-7Q2K, mình đi cùng con nhỏ, muốn bay sáng mai
ừ                      → còn 2 phương án nên hỏi lại
phương án 1            → giữ 2 ghế VT-DEMO-303 trong 20 phút, báo giá, hỏi xác nhận
xác nhận đổi           → xuất vé mới, rồi mới chuyển vé gốc sang EXCHANGED
xác nhận đổi           → trả lại kết quả cũ, không đổi lần hai
```

Phương án sáng 11/12: `VT-DEMO-301` chỉ còn 1 ghế (bị loại, không báo cả nhóm có chỗ), `VT-DEMO-303` phải trả 0đ (được tự giữ chỗ), `VT-DEMO-305` thu chênh lệch 300.000đ (không tự giữ, chỉ báo giá rồi xin xác nhận). `VT-DEMO-311` (chiều) và `VT-DEMO-399` (huỷ) bị loại.

### Công cụ

Mỗi hàm ở `vintrip/ai/app/services/assistant/skills/c3_flow.py`, nhận adapter `MockSupplier` làm tham số đầu, được `codebase/tools.py` bọc `@tool` (`C3_TOOLS`) để ghi trace.

| Công cụ | Việc | Tác động |
|---|---|---|
| `get_disrupted_booking` | đọc booking, chặng bị huỷ, cờ trẻ em đi một mình | đọc |
| `get_disruption_policy` | chính sách đổi/hoàn mẫu | đọc |
| `find_alternative_flights` | chuyến cùng hành trình, sáng hôm sau, trong 72 giờ, đủ ghế cho cả nhóm; kèm số tiền phải trả | đọc |
| `hold_alternative` | giữ ghế cho cả nhóm, có hạn 20 phút; chỉ khi chính sách cho phép, phải trả 0đ, chưa dùng quyền đổi, vé gốc còn OPEN; giữ từng ghế, thiếu ghế thì trả lại hết (`PARTIAL_RELEASED`); từ chối tách trẻ em (`MINOR_UNACCOMPANIED`) | adapter mô phỏng |
| `quote_exchange` | proposal gồm `proposalId`, `bookingVersion`, số tiền và `confirmationToken` (băm từ proposal + phiên bản + số tiền) | đọc |
| `commit_exchange` | kiểm token, phiên bản booking, hạn giữ chỗ, giá hiện tại, ghế; khoá chống lặp (gửi lại cùng khoá trả kết quả đã lưu); xuất vé mới trước rồi mới chuyển vé gốc sang `EXCHANGED` | adapter mô phỏng |
| `quote_refund` | số tiền hoàn, phí, thời gian, token riêng | đọc |
| `request_refund` | sau xác nhận riêng: vé sang `REFUND_PENDING`, giải phóng chỗ giữ, giao dịch `PENDING` | adapter mô phỏng |
| `get_transaction_status` | tra giao dịch theo khoá chống lặp hoặc `txId` | đọc |
| `handoff_to_staff` | tạo phiếu `PENDING_STAFF` (bản nháp, không gửi) | bản nháp |

"Adapter mô phỏng" nghĩa là chỉ đổi trạng thái trong bộ nhớ của tiến trình, không gọi hãng hay cổng thanh toán. Bản thật phải đặt các lệnh này sau bước người duyệt (AGENTS.md).

### Trạng thái

`LOOKUP → NEEDS_INPUT | OPTIONS_READY → HELD → AWAITING_CONFIRMATION → EXCHANGING → EXCHANGED`. Khi chỉ có một phương án 0đ, hệ thống tự giữ chỗ ngay sau `OPTIONS_READY`. Phương án có thu tiền bỏ qua `HELD`.

- Hết hạn giữ, booking đổi phiên bản: quay về `OPTIONS_READY`, kiểm lại phương án, phải chọn và xác nhận lại. Giá đổi: proposal cũ hết hiệu lực, tạo proposal và token mới, quay lại `AWAITING_CONFIRMATION`.
- Nhánh hoàn: báo giá nêu phạm vi (cả 2 khách), số tiền, hậu quả, rồi chờ đúng câu `xác nhận hoàn` ("ừ" không đủ) → `REFUND_REQUESTED`. Chỉ chuyển `REFUNDED` khi `get_transaction_status` trả `SETTLED` kèm bằng chứng (`MockSupplier.settle_refund` giả lập).
- Timeout hoặc chưa rõ kết quả: `PENDING_RECONCILIATION`. Lượt sau luôn tra `get_transaction_status` trước; đã hoàn tất thì báo `EXCHANGED`, hãng chưa ghi nhận thì chỉ gửi lại đúng lệnh cũ với cùng khoá khi người dùng nói "thử lại". Trong `EXCHANGING`/`PENDING_RECONCILIATION` mọi lệnh đổi/hoàn mới cho booking đều bị chặn.
- Trẻ em bay một mình, hoặc yêu cầu đổi/hoàn tách trẻ em khỏi người lớn: tạo phiếu chuyển nhân viên, trạng thái `HANDOFF`.
- Tự xưng nhân viên hãng đòi bỏ quy định/bỏ xác nhận: từ chối, trạng thái và proposal giữ nguyên.
- Hỏi bồi thường: không tự kết luận quyền lợi, không nêu số tiền; trỏ về điều lệ vận chuyển của hãng và quy định hàng không, tạo phiếu chuyển nhân viên.

### Tình huống khó và test

| Tình huống | Test trong `tests/test_c3_flow.py` |
|---|---|
| "đổi đi" khi chưa rõ booking/chuyến | `test_doi_di_without_booking_or_flight_asks_again` |
| "huỷ hết, hoàn tiền" | `test_cancel_all_refund_clarifies_scope_and_needs_separate_confirmation` |
| "ừ" khi còn 2 phương án | `test_u_with_two_options_asks_again` |
| 1 ghế cho nhóm 2 người | `test_one_seat_for_group_of_two_is_never_offered_or_half_held` |
| Hết hạn giữ / giá đổi | `test_expired_hold_rechecks_options_and_needs_new_confirmation`, `test_price_change_requires_a_new_confirmation` |
| Trẻ em bay một mình | `test_unaccompanied_child_goes_to_staff`, `test_splitting_child_from_adult_goes_to_staff` |
| Tự xưng nhân viên hãng | `test_self_declared_airline_staff_cannot_override` |
| Gửi xác nhận hai lần | `test_double_confirmation_has_single_effect`, `test_commit_needs_matching_token_and_booking_version` |
| Timeout khi có thể đã đổi | `test_timeout_after_apply_reconciles_without_blind_retry`, `test_timeout_before_apply_blocks_new_commands_then_retries_same_key` |
| Bồi thường do thời tiết | `test_weather_compensation_is_not_inferred` |

### Giới hạn

- Một phiên C3 cho cả tiến trình CLI (một người dùng); chưa có khoá theo phiên cho nhiều người. Chat SSE chưa nối luồng này vì server không giữ trạng thái; SSE và giao diện vẫn dùng bản nháp chỉ đọc `DEMO-C3-001`.
- Parser theo mẫu câu tiếng Việt, chưa hiểu mọi cách nói. Chưa có saga bù trừ thật, phân quyền truy cập booking hay đối soát với hãng thật.

## Chạy thử bản nháp chỉ đọc

Chạy `python run.py`, rồi nhập một trong các câu sau. Nếu máy đã cấu hình model thật thì lời gọi model vẫn tuân theo cấu hình hiện có; phép tính C3 luôn lấy từ công cụ.

```text
C3 xem phương án DEMO-C3-001
C3 giữ chỗ DEMO-C3-001 sang DEMO-VT101
C3 đổi vé DEMO-C3-001 sang DEMO-VT101
C3 hoàn tiền vé DEMO-C3-001
C3 DEMO-C3-001 đến trước 2026-12-10T15:00:00+07:00
```

Trong giao diện chat, sau câu đầu có thể nhập ngắn `Đổi vé DEMO-VT101` hoặc `Hoàn tiền vé C3`. Chat gửi lại các trường yêu cầu trong `trip.pendingFlightDisruption`; CLI chạy mỗi câu độc lập nên phải ghi đủ mã đặt chỗ. Giờ đến tối đa cần ngày, giờ và UTC offset. Đây là parser theo mẫu, chưa hỗ trợ mọi cách diễn đạt tự nhiên.

Có thể nhập `Bỏ giới hạn giờ đến` để xem lại toàn bộ phương án trong chat. Khi chuyển sang hoàn vé, giờ đến không còn là điều kiện bắt buộc. Nếu câu chứa nhiều mã đặt chỗ hoặc nhiều mã chuyến thay thế, hệ thống hỏi lại để chọn một mã; không tự chọn mã đầu tiên. Parser nhận biết các phủ định trực tiếp như `không hoàn tiền`, `đừng đổi vé`, `chưa muốn giữ chỗ` và không tạo bản nháp cho hành động bị phủ định. Gợi ý giữ chỗ/đổi vé lấy từ các chuyến đủ điều kiện ở lượt hiện tại.

`DEMO-C3-001` là đặt chỗ mô phỏng 2 khách SGN → HAN ngày 10/12/2026, chuyến cũ bị huỷ. `DEMO-VT101` có tổng giá mẫu 5.200.000đ, bù thêm 400.000đ so với 4.800.000đ giá vé chưa sử dụng. `DEMO-VT103` có tổng giá mẫu 4.600.000đ, dư 200.000đ và cần hãng xác nhận cách xử lý. `DEMO-VT102` chỉ có 1 chỗ nên bị loại. Mọi giá, chỗ, thời gian và quy tắc đều là dữ liệu tự dựng cho demo, không phải báo giá hay chính sách hãng bay thật.

## Luồng và trạng thái

1. Đọc đặt chỗ từ snapshot, kiểm chuyến cũ có trạng thái `cancelled`.
2. Lọc chuyến mới theo hành trình, trạng thái khai thác, số chỗ đủ cả nhóm, thời gian bay và giờ đến tối đa nếu được yêu cầu. Tính tổng giá cho cả nhóm, phần bù thêm và giá vé dư bằng số nguyên VND.
3. Trả `OPTIONS_READY` hoặc `NO_OPTIONS`, kèm phương án hoàn vé theo quy tắc mô phỏng. `NO_OPTIONS` có nghĩa là không có phương án trong snapshot đáp ứng điều kiện, không khẳng định hãng đã hết chỗ.
4. Với yêu cầu giữ chỗ/đổi vé, kiểm lại chuyến được chọn; thiếu mã thì `NEEDS_INPUT`, mã không đáp ứng điều kiện thì `OPTION_UNAVAILABLE`.
5. Tạo `FLIGHT_HOLD_DRAFT`, `FLIGHT_CHANGE_DRAFT` hoặc `FLIGHT_REFUND_DRAFT`, trạng thái `PENDING_USER_APPROVAL`. Nội dung bản nháp ghi rõ chuyến được đề nghị, giờ bay và các khoản tiền mẫu liên quan hoặc số tiền đề nghị hoàn. Không có endpoint thực thi. Nhập “đã duyệt” vẫn giữ bản nháp, không gọi hãng hay thay đổi đặt chỗ.

`MISSING_DATA` dùng cho mã đặt chỗ không có trong dữ liệu mẫu. `NOT_ELIGIBLE` dùng khi snapshot chưa ghi nhận chuyến cũ bị huỷ (ví dụ `DEMO-C3-002`). `STALE_DATA` chặn đề xuất đổi/giữ chỗ khi báo giá mẫu hết hạn; vẫn có thể soạn đề nghị hoàn vé. Snapshot v1 hết hạn báo giá lúc **09:00 ngày 10/12/2026 (+07:00)**; muốn demo sau đó phải tạo phiên bản dữ liệu mới, không vô hiệu kiểm tra thời hạn.

## Hợp đồng và giới hạn

- Engine dùng thư viện chuẩn ở `vintrip/ai/app/services/assistant/skills/c3_engine.py`, dữ liệu trong `c3_snapshot.json` cùng thư mục. Bridge `codebase/tools.py` nạp chính engine này, không cần cài FastAPI để chạy CLI.
- Mọi kết quả có `isMock`, `snapshotId`, `observedAt`, nhãn mô phỏng và thông báo chưa thực hiện giao dịch. SSE dùng `kind: "flight_disruption"`, các sự kiện `cards`, `trip`, `done` như hiện có; không có nút thực thi giao dịch.
- Bộ nhớ chỉ chứa `bookingCode`, `action`, `targetFlightId`, `arrivalBefore`. Giá, trạng thái vé và tồn chỗ được đọc lại mỗi lượt; trường giá giả trong bộ nhớ bị schema từ chối.
- Cùng yêu cầu có cùng mã bản nháp theo snapshot và nội dung giao dịch. Đây là định danh bản nháp ổn định, **chưa phải cơ chế chống giao dịch lặp trong production**. Chưa có giữ chỗ thật, hết hạn giữ chỗ thật, xuất vé, hoàn qua cổng thanh toán, đối soát, phân quyền truy cập đặt chỗ hoặc saga bù trừ. Không dùng mã đặt chỗ thật với demo.

## Kiểm tra

```powershell
python -m unittest discover -s tests -v   # gồm tests/test_c3_flow.py (luồng TRV-7Q2K)
python run.py check
cd vintrip/ai
.venv/Scripts/python.exe -m pytest tests/test_vintrip_copilot.py -q
cd ../fe
pnpm.cmd --filter @vintrip/web exec vitest run src/features/assistant/assistant.test.ts
pnpm.cmd --filter @vintrip/web typecheck
```

Các test C3 là ca tự viết cho dữ liệu mô phỏng, không bổ sung vào bộ đánh giá C1 và không tính là bằng chứng người dùng.

Kết quả rà soát ngày 27/11/2026: 698 test AI/chat/assistant, 25 test render/giao diện liên quan và 40 unittest ở repo đạt. `python run.py check`, lint Python cho các file AI thay đổi, kiểm kiểu hai module C3 và typecheck API client đạt. Đã chạy CLI thật với model offline. Typecheck toàn web còn lỗi có sẵn: `src/features/auth/mobile-google-return.test.ts` import `../../app/auth/google/mobile/route` nhưng route không có trong repo. Lint hai file giao diện có một cảnh báo sẵn ở `ApprovalDraftCard` về thẻ có `role="status"`.

Kết quả sau khi hoàn tất luồng `TRV-7Q2K` (27/11/2026, nhánh `c3-flight-disruption`, `MODEL_PROVIDER=fake`): `python -m unittest discover -s tests` 56 test đạt (1 bỏ qua), trong đó 16 test ở `tests/test_c3_flow.py`; `pytest` của `vintrip/ai` 1292 đạt, 7 bỏ qua; `python run.py check` đạt; `ruff check` và `ruff format` cho `c3_flow.py` đạt. Đã thử đột biến code (bỏ khoá chống lặp, bỏ giải phóng ghế, bỏ hỏi lại khi "ừ", bỏ đối soát, bỏ chặn tự xưng nhân viên, bỏ chuyển nhân viên khi hỏi bồi thường hoặc trẻ đi một mình, gộp xác nhận hoàn, bỏ kiểm hạn giữ, bỏ kiểm đủ ghế): mỗi đột biến làm ít nhất một test đỏ. Chưa chạy test giao diện vì worktree không có `node_modules`; luồng này không đổi file giao diện.
