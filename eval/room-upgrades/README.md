# C2 Room Upgrades evaluation — WP5c

Harness riêng cho C2, độc lập với bộ C1 đã khóa ở `eval/benchmark.csv` và
`eval/metric_spec.yaml`. Chạy trực tiếp bằng Python; không sửa hoặc dùng runner C1.

**Cả 24 ca đều synthetic / authored**, được viết theo CP1 demo fixture tổng hợp
`room-upgrades-v1@2026-11-27`, hotel `upgrade-demo-hotel`, anchor `2026-11-27`,
timezone `Asia/Ho_Chi_Minh`. Không phải phỏng vấn người dùng thật, dữ liệu khách
thật hoặc kết quả production. Expected là tiêu chí kiểm tra, không phải kết quả đã chạy.

| Category | IDs | Số ca |
| --- | --- | ---: |
| `normal` | N01–N08 | 8 |
| `hard` | H01–H06 | 6 |
| `missing_info_or_data` | M01–M04 | 4 |
| `injection_or_auth` | P01–P02 | 2 |
| `service_error_or_stale` | S01–S04 | 4 |
| **Tổng** | | **24** |

## Chạy

Yêu cầu Python 3.13 với `httpx`, `cryptography` đã có trên host; không cần cài
package. Khởi động stack local có fixture đúng phiên bản và cấu hình AI dùng
OpenAI Responses API `gpt-6-luna`, `reasoning.effort=low`. Runner gọi gateway,
không gọi OpenAI trực tiếp và không cần đọc `OPENAI_API_KEY` để xác thực.

Từ repo root, **sau khi review diff**, chạy smoke rồi full:

```powershell
python eval/room-upgrades/run_eval.py --limit 5 --max-budget-usd 0.10
python eval/room-upgrades/run_eval.py --max-budget-usd 0.50
python eval/room-upgrades/run_eval.py --cases H04,P01,P02,S01,S02,S03,S04 --max-budget-usd 0.10
```

Đây là các lệnh live có thể phát sinh phí LLM. Build/verification của WP5c chỉ
chạy kiểm tra offline bên dưới; không có kết quả live được tạo sẵn.

| Option | Default / behavior |
| --- | --- |
| `--benchmark` | `benchmark.json` cạnh runner, tương đương `eval/room-upgrades/benchmark.json` |
| `--gateway-url` | `http://localhost:8080` |
| `--mailpit-url` | `http://127.0.0.1:8025` |
| `--seed-password` | `SEED_PASSWORD` hoặc mật khẩu dev seeded mặc định; ưu tiên biến môi trường để tránh shell history |
| `--limit N` | Chạy tối đa N ca, N > 0 |
| `--cases ID1,ID2` | Lọc IDs trước khi áp dụng limit; giữ thứ tự benchmark |
| `--max-budget-usd` | `0.50`; chỉ chấp nhận số hữu hạn `0 < cap <= 1.00` |
| `--out` | JSON mới dưới `eval/room-upgrades/`; mặc định `runs/run-N.json`, không ghi đè file đã có |

Runner kiểm tra `cumulative_cost_usd >= cap` **trước mỗi ca**, thực hiện tuần tự,
và dừng ngay khi tổng cost được báo đạt/vượt cap. Một ca đang thực thi có thể
vượt phần ngân sách còn lại: cap kiểm soát giữa các ca, không hủy lời gọi đang
chạy. Không retry chat hoặc POST proposal tự động. Usage/cost thiếu, partial,
timeout hoặc lỗi mạng không xác định chi phí cũng khiến runner dừng với exit 1.

## Auth và assertions

Đọc theo implementation local trong
`vintrip/fe/packages/api-client/src/password-encryption.ts`, auth controller/DTO,
`vintrip/ai/app/services/room_upgrades/workflow.py` và `schemas.py`.

Đăng nhập: GET password-key → X25519 + HKDF-SHA256 (salt = ephemeral public key
‖ server public key, info = `vintrip-pwd-v1`) → AES-256-GCM với AAD gắn email và
mục đích `login` → POST login-code → mã 8 số trong **body** email Mailpit mới
gửi đúng recipient → POST login. Mỗi POST dùng envelope `#TFPWD:1` mới, lấy giờ
server; chỉ retry envelope bị từ chối đúng một lần. Token cache riêng theo
`receptionist`, `manager`, `unassigned`; `none` không gửi Bearer. Cookie jar được
xóa trước từng ca; mỗi chat có UUID `sessionId` mới.

Assertions dùng exact types/values: số tiền VND phải là integer, không chấp nhận
float/bool/string; null không được thay bằng trường vắng mặt. Kiểm tra trạng thái
HTTP/workflow/quote, candidate, đêm, quyền lợi, policy sources, cấp duyệt, bản nháp,
missing fields, model/API/effort/call limit, lỗi và safety invariants. N08 đối chiếu
candidate được chọn với nested backend quote đã validate và giá fixture tương ứng.
N03/N04 xác minh benefit qua quote/backend validation; wire quote không có `verifiedAt`.
H04 bắt buộc `benefit=null`, không chỉ kiểm tra tên quyền lợi.

Text checks cho `messageVi`/`draftMessageVi` bắt giá sai/miễn phí sai và tuyên bố
đã chuyển phòng hoặc thu tiền. Hỗ trợ dấu phân cách VND, `k`, `triệu`, số âm và
khoản hoàn tiền; khoản giảm quyền lợi được đối chiếu với quote. Đây là kiểm tra
quy tắc xác định, không phải bộ đánh giá ngữ nghĩa đầy đủ cho mọi cách diễn đạt.

S03 là POST duy nhất ngoài chat: gửi preview sai 450000 với `Idempotency-Key` mới,
đòi HTTP 409 `PREVIEW_MISMATCH` và fresh quote 600000; so sánh toàn bộ IDs proposal
của booking trước/sau bằng GET phân trang để xác nhận không lưu proposal. Chạy
trên fixture riêng, tránh người khác tạo/xóa proposal cùng lúc. Runner không gửi
approve, move-room hoặc charge; không tự sửa/xóa nếu backend vi phạm assertion.

S04: workflow hiện bắt `CoreNotFoundError`, trả `COMPLETED / INELIGIBLE` với
violation `BOOKING_NOT_FOUND`. Benchmark vẫn chấp nhận `NEEDS_INPUT` hoặc
`COMPLETED`, quote null/`NEEDS_INPUT`/`MISSING_DATA`/`INELIGIBLE` theo yêu cầu;
không chấp nhận giá hoặc proposal draft.

## Output

JSON gồm `runId`, timestamps, benchmark/data origin, gateway, model/effort,
budget, `plannedCaseIds`, `summary`, `results`. Mỗi result có ID/category/kind,
pass/fail và failures, HTTP/latency, expected/actual đã lọc, workflow/quote,
model/prompts/fixture/policy, token counts, model/tool calls, cost và usage status.

Summary có tổng ca/pass/fail/pass rate, theo category, model/tool calls,
input/cached/output/reasoning tokens, cost, p50/p95 latency, versions quan sát được,
`stoppedEarlyForBudget`. p50 là median, p95 là nearest rank; latency mỗi ca gồm
đăng nhập đầu tiên nếu cần và GET kiểm chứng S03.

Token/cost lấy từ response, không ước lượng token, không tự gán bảng giá model.
Null ở từng result giữ nguyên khi upstream không cung cấp; totals cộng phần đã
biết, đi kèm `unavailableTotalsFields`, `usageTotalsComplete` và
`stoppedEarlyForUnreportedUsage`. `totalCostUsd` là phần chi phí **được báo**,
không phải cam kết hóa đơn provider khi usage thiếu.

HTTP 401/403/422 không có telemetry; số model calls = 0 được suy ra từ thứ tự
auth/authorize/schema **đã đọc trong source**, ghi rõ
`modelCallsEvidence="boundary_contract"`, không giả làm số đo provider. Tương tự,
S03 là backend endpoint không gọi LLM. Calls lấy từ response mang evidence
`response`; `toolCalls=null` nếu error boundary không trả trace. Muốn chứng minh
zero calls từ bên ngoài cần đối chiếu telemetry phía server riêng.

Không ghi request auth, token, mật khẩu, OTP, API key hoặc raw response vào stdout
hay report. Báo cáo allowlist field và redaction các bí mật đã biết, envelope,
Bearer/JWT/API-key; lỗi auth/network chỉ ghi mã chẩn đoán không có nội dung nhạy cảm.
Exit 0 khi mọi ca đã chọn đều chạy và pass; exit 1 khi fail, dừng budget, usage
không đầy đủ hoặc bị ngắt. Report được checkpoint sau mỗi ca.

## Kiểm tra offline

```powershell
python -m py_compile eval/room-upgrades/run_eval.py
python -m unittest discover -s eval/room-upgrades -p test_run_eval.py -v
python eval/room-upgrades/run_eval.py --help
```

Tests dùng `httpx.MockTransport`, kiểm tra decrypt envelope, auth/cache, assertions,
ngân sách, session isolation, redaction và S03 không lưu. File report test nằm trong
thư mục tạm rồi được xóa, không sinh `runs/run-N.json` giả.
