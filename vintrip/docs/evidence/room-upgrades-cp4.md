# Bằng chứng Kiểm thử & Nghiệm thu C2-CP4 — Staff Portal, E2E Integration & Evaluation

- **Nhánh:** `feat/c2-room-upgrade`
- **Baseline CP3 / Remote sync:** `866322c1c1d10756d688de392669d608fc6a68b0` → fast-forward đồng bộ `dd59d42ae64358363fc2b584def7dea6a8a18a40` (`Merge branch 'vintrip' into feat/c2-room-upgrade`) trước khi commit CP4.
- **Phạm vi:** Giao diện Staff Portal (`/staff/*`), `@vintrip/api-client`, 2 endpoint đọc `staff-context` & `proposals/summary`, tích hợp CORS/Gateway, kiểm thử E2E trực tiếp, Browser QA 4 kích thước màn hình, đánh giá thực tế 24 ca trên OpenAI Responses API `gpt-6-luna` và hồi quy toàn hệ thống CP1–CP4.
- **Ranh giới an toàn:** Mọi dữ liệu và đề xuất đều là sandbox mô phỏng (`isMock: true`, `operationalEffects: "NONE"`, `requiresHumanApproval: true`). Không chuyển phòng, giữ tồn kho, sửa booking vận hành, thu/hoàn tiền hay gửi thông báo thật.

## 1. Kiểm thử tự động (Unit / HTTP / PostgreSQL / AI / FE / C1 Guardrails)

| Nhóm kiểm thử | Lệnh thực thi | Kết quả thực tế |
|---|---|---|
| BE module boundaries | `node vintrip/be/apps/core-api/scripts/check-boundaries.mjs` | **PASS** — `Ranh giới module: không có vi phạm.` |
| BE TypeScript | `pnpm --filter @vintrip/core-api typecheck` | **PASS** — `0 errors` |
| BE Lint | `pnpm --filter @vintrip/core-api exec oxlint --type-aware src/modules/commerce/room-upgrades src/platform/http.ts` | **PASS** — `0 warnings, 0 errors` (22 files) |
| BE Unit & HTTP + Regression | `pnpm --filter @vintrip/core-api exec vitest run src/modules/commerce/room-upgrades src/modules/analytics src/modules/commerce/inventory/api/http.spec.ts --maxWorkers=1` | **PASS** — **426/426** tests (17 files: 350 room-upgrades + 72 analytics + 4 inventory HTTP) |
| BE PostgreSQL Integration & Concurrency | `ROOM_UPGRADE_TEST_DATABASE_URL=...room_upgrade_test_cp4_20261128 pnpm --filter @vintrip/core-api exec vitest run --config vitest.int.config.ts ... --maxWorkers=1` | **PASS** — **56/56** tests (52 proposal/summary/staff-context + 4 CP1); sau khi chạy đã `DROP DATABASE room_upgrade_test_cp4_20261128` |
| AI Lint, Format, Typecheck | `ruff check`, `ruff format --check`, `pyright --pythonpath .venv/Scripts/python.exe` | **PASS** — `0 errors, 0 warnings` (11 files) |
| AI Unit & E2E Tests | `pytest -q tests/test_room_upgrades.py tests/test_room_upgrades_e2e.py tests/test_usage_events.py tests/test_health.py` | **PASS** — **82 passed, 1 skipped** (70 room-upgrades + 12 usage_events/health) |
| FE `@vintrip/api-client` | `oxlint`, `tsc --noEmit`, `vitest run src/room-upgrades.test.ts src/session-cache.test.ts --maxWorkers=1` | **PASS** — `0 warnings, 0 errors`, `0 TS errors`, **95/95** tests (84 room-upgrades + 11 session-cache) |
| FE `@vintrip/web` Lint | `oxlint -c /repo/.oxlintrc.json` trên toàn bộ 26 file C2 mới/sửa | **PASS** — `0 warnings, 0 errors` |
| FE `@vintrip/web` Unit Tests | `vitest run src/features/staff src/features/auth/auth-return.test.ts src/features/shell/mobile-tabs.test.ts src/features/assistant/assistant.test.ts --maxWorkers=1` | **PASS** — **273/273** tests (6 files: 45 staff-portal + 66 copilot + 76 proposal + 17 auth-return + 45 mobile-tabs + 24 assistant) |
| FE `@vintrip/web` Production Build | `pnpm exec next build` (Next.js 16.4.5 Turbopack) | **Turbopack compile PASS** (`Compiled successfully in 11.7s`, 0 lỗi ở toàn bộ code C2); bước `tsc` toàn repo dừng ở 1 lỗi baseline có sẵn trước CP4 tại file không liên quan `src/features/auth/mobile-google-return.test.ts(2,22)` (`TS2307` thiếu route `../../app/auth/google/mobile/route`) — không sửa code ngoài phạm vi C2 |
| C2 Eval Harness Offline Tests | `python -m unittest discover -s eval/room-upgrades -p test_run_eval.py -v` | **PASS** — **14/14** tests |
| C1 Guardrails | `python run.py check` & `git diff --check` & `git diff --stat` trên file C1 đã khóa | **PASS** — `Không thấy vấn đề`, 0 lỗi whitespace, 0 thay đổi trên `eval/benchmark.csv`, `eval/metric_spec.yaml`, `eval/run_eval.py`, `run.py`, `codebase/tracing.py`, `cost/simulate.py`, `spec.md` §7 |

## 2. Kiểm thử End-to-End trực tiếp trên Stack thật (7/7 PASS)

Chạy trực tiếp qua Gateway `http://localhost:8080` (`core-api` + `ai-service` gọi OpenAI Responses API `gpt-6-luna` thật + PostgreSQL `core` đã áp dụng migration `15 | 20261127175228_room-upgrade-proposals` + Mailpit `http://127.0.0.1:8025`), tổng chi phí LLM cho lần chạy E2E: **`$0.000748`**:

1. **E2E-1 (PASS, 5.600ms):** Luồng chuẩn lễ tân (`member@vintrip.local`) → `GET /staff-context` (`RECEPTIONIST`) → `POST /ai/room-upgrades/chat` (`gpt-6-luna`, 2 calls, 3.789 in / 514 out, `$0.000309`, `600.000đ`) → `POST /proposals` (`201 PENDING_RECEPTIONIST`) → `POST /approve` (`200 APPROVED`, `operationalEffects: "NONE"`) → replay cùng `Idempotency-Key` (`200`, `Idempotency-Replayed: true`, không tạo audit trùng) → `GET /history` (1 revision, 2 audit events).
2. **E2E-2 (PASS, 50ms):** Đề xuất chênh lệch âm cần quản lý (`C2-0010` → `DLX`, `-1.000.000đ`, `PENDING_MANAGER`) → `RECEPTIONIST` duyệt bị chặn `403 INSUFFICIENT_APPROVAL_ROLE` → `MANAGER` (`superadmin@vintrip.local`) duyệt thành công `200 APPROVED`.
3. **E2E-3 (PASS, 8.734ms):** Hội thoại nhiều lượt (`NEEDS_INPUT` thiếu `effectiveAt`, dừng sớm 1 model call) → bổ sung ngày giờ lượt 2 (`2026-11-28 14:00`) → `gpt-6-luna` trả `VALID`, áp dụng quyền lợi xác minh `GOLD-10` (10%) ra đúng `540.000đ`.
4. **E2E-4 (PASS, 136ms):** Tạo đề xuất `C2-0007` (`DLX`, `600.000đ`, Rev #1) → `REVISE` sang `STE` (`2.000.000đ`, Rev #2, v2) → `ESCALATE` (`PENDING_MANAGER`, v3) → `MANAGER` `REJECT` (`REJECTED`, v4) → xác minh Rev #1 bất biến và audit đủ `CREATED, REVISED, ESCALATED, REJECTED`.
5. **E2E-5 (PASS, 660ms):** Cập nhật giá sandbox đêm `2026-11-28` của `DLX` từ `1.500.000đ` lên `1.650.000đ` → `POST /approve` bị chặn `409 REQUOTE_REQUIRED` (`freshQuote = 750.000đ`) → phục hồi qua `REVISE` tạo Rev #2 (`750.000đ`, `PENDING_RECEPTIONIST`) → hoàn nguyên giá sandbox về `1.500.000đ` trong `finally`.
6. **E2E-6 (PASS, 66ms):** Hai lệnh `POST /approve` song song cùng `expectedVersion: 1` với 2 `Idempotency-Key` khác nhau → đúng 1 lệnh `200 APPROVED`, 1 lệnh `409 VERSION_CONFLICT`, đúng `1` sự kiện audit `APPROVED`.
7. **E2E-7 (PASS, 389ms):** Chặn `401` không token trên Core & AI; `moderator@vintrip.local` nhận `hasAccess: false` và `403` trên bookings/summary/AI; chặn `403` truy cập chéo khách sạn; chặn prompt injection (`BLOCKED_INJECTION`, `0` model calls); `GET /proposals/summary` trả `inHouseBookings: 8`; đối chiếu bảng vận hành PostgreSQL trước & sau (`orders = 0, payments = 0, refunds = 0, room_inventory held+sold = 0` — không đổi byte nào).

## 3. Real Browser QA trên Trình duyệt Thật (4 Viewports)

- **Origin được host xác minh (`BROWSER_HOST_FACTS`):** `http://localhost:3100`, `blocked_origins: none`.
- **Luồng thực tế trên trình duyệt:**
  - Chưa đăng nhập tại `/` (không có mục Cổng nhân viên) và `/staff` (hiện màn hình đăng nhập, không có header/footer/Vini nổi của khách).
  - Đăng nhập `member@vintrip.local` qua form 2 bước + mã 8 số từ Mailpit → menu tài khoản tại `/` hiện `"Cổng nhân viên khách sạn"`.
  - Vào `/staff` (8 khách lưu trú, banner Sandbox, không có chrome khách) → `/staff/bookings` → `/staff/bookings/C2-0001` → mở `/staff/room-upgrades?booking=C2-0001` → gửi yêu cầu tiếng Việt tự nhiên → nhận báo giá xác minh `600.000đ` (2 đêm, `DLX`) từ `gpt-6-luna` → bấm `"Tạo đề xuất chờ duyệt"` (tạo thành công proposal ID **`d270a3b5-bcc6-424e-a1a6-72f0a678f01b`**) → mở chi tiết đề xuất → mở modal xác nhận duyệt → bấm `"Xác nhận duyệt báo giá"` → hiện chính xác thông báo `"Đã duyệt đề xuất báo giá. Chưa thực hiện chuyển phòng hoặc thu tiền."` → tải lại trang xác nhận `Đã duyệt` và lịch sử kiểm toán lưu bền vững trong PostgreSQL (đã xác minh độc lập trực tiếp bằng truy vấn `psql` trên `core`: `status=APPROVED, version=2, current_revision=1`, 2 audit rows `CREATED` & `APPROVED`).
  - Đăng xuất và đăng nhập `moderator@vintrip.local` → menu `/` không có `"Cổng nhân viên khách sạn"`, truy cập trực tiếp `/staff` hiển thị cổng từ chối `"Bạn chưa được phân công khách sạn"`, 0 rò rỉ dữ liệu.
- **Kết quả Viewport & Telemetry:**
  - `1440×900`, `1280×800`, `768×1024`, `390×844`: `0` tràn ngang (`html.width == body.width <= viewportWidth` trên mọi trang; bảng cuộn gọn trong khung cuộn riêng; mobile drawer mở/đóng/điều hướng ổn định).
  - Console errors trên `/login` và `/staff*`: **0** (trang chủ khách `/` có 1 lỗi pre-existing không liên quan C2: duplicate key `"Hà Nội"`).
  - Hydration warnings: **0** · Uncaught page errors: **0** · Unexpected failed network requests: **0**.
- **Lỗi giao diện/tích hợp phát hiện và đã sửa trong vòng audit CP4:**
  1. CORS: bổ sung `credentials: 'omit'` cho `chatCopilot` và expose `Idempotency-Replayed` ở `core-api` `http.ts`.
  2. UI bảng & pill: thêm `white-space: nowrap` cho cột ngày/giờ (`.dateCell`) và `.pill` để không gãy dòng ngày hay trạng thái `"Đã duyệt"`.
  3. Copilot: loại bỏ hiển thị trùng lặp nguồn chính sách giữa `quote.policy.sources` và `response.policySources`.
  4. Mobile drawer & accessibility: thay nút backdrop trùng nhãn bằng đóng dialog khi bấm ngoài vùng panel; khắc phục sạch toàn bộ cảnh báo `oxlint` (`0 warnings, 0 errors` trên 28/28 file C2).

## 4. Đánh giá AI C2 độc lập trên `gpt-6-luna` thật (`eval/room-upgrades/`)

Toàn bộ 24 ca trong `eval/room-upgrades/benchmark.json` là **synthetic / authored** theo fixture `room-upgrades-v1@2026-11-27` (`8 normal`, `6 hard`, `4 missing_info_or_data`, `2 injection_or_auth`, `4 service_error_or_stale`), không phải phỏng vấn người dùng thật. Tất cả các lượt đều chạy tuần tự qua Gateway thật với model `gpt-6-luna` (`reasoning.effort = "low"`, OpenAI Responses API) và được lưu bất biến tại `eval/room-upgrades/runs/`:

| Lượt chạy | Tỉ lệ đạt | Model calls | Tool calls | Input tokens (cached) | Output tokens (reasoning) | p50 / p95 (ms) | Chi phí thực (USD) | Ghi chú kỹ thuật |
|---|---|---:|---:|---:|---:|---:|---:|---|
| `run-1.json` | 22/24 (91.7%) | 28 | 89 | 57.089 (46.316) | 6.638 (1.760) | 2.942 / 7.229 | `$0.004859` | Baseline sau sửa `resolve_benefit_id`; phát hiện 2 lỗi thực tế: `N08` (`match_room_type_id` coi cụm tiện nghi là hạng phòng lạ) và `H02` (prompt chặn nhầm yêu cầu hạ hạng hợp lệ) |
| `run-2.json` | 21/24 (87.5%)* | 30 | 100 | 61.874 (53.060) | 7.241 (1.791) | 2.935 / 7.165 | `$0.005032` | *24/24 đúng dữ liệu cấu trúc & VND sau sửa `N08`/`H02`; 3 ca `H02`/`H03`/`H04` bị false-positive từ regex kiểm chữ tiếng Việt (`"chênh lệch âm"`, `"miễn phí chưa đủ điều kiện"`) |
| `run-3.json` | 21/24 (87.5%)* | 31 | 100 | 63.468 (58.786) | 7.427 (1.610) | 2.447 / 6.693 | `$0.004770` | Lặp lại kết quả ổn định như `run-2` (24/24 đúng structured quote & VND) |
| `run-4.json` | **24/24 (100.0%)** | 31 | 100 | 63.436 (58.786) | 7.271 (1.481) | 2.364 / 7.505 | `$0.004688` | Đạt 100% sau khi sửa parser tiếng Việt trong `run_eval.py` (không đổi expected) |
| `run-5.json` | **24/24 (100.0%)** | 30 | 100 | 61.874 (58.786) | 7.532 (2.058) | 3.664 / 7.303 | `$0.004663` | Lượt kiểm chứng lặp lại độc lập — đạt 100% ổn định |

- **Tổng chi phí 5 lượt full 24 ca (120 ca trực tiếp):** **`$0.024013`** (cộng thêm smoke 5 ca `$0.001538` và E2E `$0.000748` ≈ **`$0.0263 USD`**, thấp hơn ~38 lần so với trần ngân sách `$1.00`).
- **Bảo vệ an toàn đã xác minh:** `P01` (prompt injection) = `0` model calls, `P02` (unassigned `403`) = `0` model calls, `S01` (`401`) = `0` model calls, `S02` (forged authority `422`) = `0` model calls, `S03` (`409 PREVIEW_MISMATCH`) không lưu proposal mới.
