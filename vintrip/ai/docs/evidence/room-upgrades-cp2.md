# Room upgrades — C2-CP2 (AI Copilot Workflow & Guardrails)

Ngày: 2026-11-28. Nhánh: `feat/c2-room-upgrade` (tiếp nối C2-CP1 tại `2605014`). Không mở PR, không merge `main`, không sửa benchmark/metric/harness C1 đã khóa.

## Tóm tắt đã triển khai

- Endpoint mới trong FastAPI AI Service: `POST /room-upgrades/chat` (qua Traefik `dynamic.yml` strip prefix `/ai` → `POST /ai/room-upgrades/chat`), trả `Cache-Control: no-store`.
- Xác thực & phân quyền: bắt buộc Bearer JWT người dùng (`ES256`, JWKS, từ chối service token) + kiểm tra `/api/auth/me` + xác minh phân công khách sạn trên Core API (`GET /api/commerce/room-upgrades/bookings?hotelId=...`) **trước** mọi lượt gọi LLM. Không dùng service account đặc quyền, không tin `role`/`userId`/`amount`/`status`/`approved` từ client.
- Workflow tuần tự có kiểm soát trong `vintrip/ai/app/services/room_upgrades/`:
  - 5 tool nghiệp vụ: `get_booking_context`, `find_available_rooms`, `get_upgrade_policy`, `calculate_upgrade_quote`, `validate_upgrade_proposal` gọi đúng API CP1 bằng chính Bearer token của nhân viên.
  - Adapter OpenAI Responses API (`OpenAIResponsesClient` trong `app/clients/llm/openai.py`) gọi trực tiếp `POST https://api.openai.com/v1/responses`, model `gpt-6-luna`, `reasoning.effort = "low"`, Structured Outputs (`strict: true`), `store: false`, không hosted tools, không retry ẩn, không tự fallback sang `gpt-4o-mini` hay model/provider khác.
  - Follow-up theo `sessionId` gắn chặt `(ownerUserId, hotelId)` trong `RoomUpgradeSessionStore` (chặn truy cập chéo `403`).
  - Guardrails: chặn prompt injection/vượt quyền đầu vào; kiểm candidate allowlist, source ref allowlist, đối chiếu số tiền VND và tuyên bố miễn phí/hành động trong văn bản do LLM sinh; kiểm nhất quán `snapshotId` (refresh tối đa 1 lần); giới hạn cứng ≤5 model calls, ≤2 repairs, ≤30 giây deadline; chế độ `DEGRADED` chỉ dựa trên báo giá đã kiểm của backend và không bao giờ sinh tổng giả.
  - FinOps & observability: ghi trace chi tiết theo `requestId` (`modelCalls`, `responseIds`, `inputTokens`, `cachedInputTokens`, `outputTokens`, `reasoningTokens`, `costUsd`, latency từng bước & tổng); phát `UsageEvent` với `feature: "room_upgrades"` lên `stream:ai` (hỗ trợ `usage_missing` khi provider không trả usage); mở rộng backward-compatible `AI_FEATURES` tại `vintrip/be/apps/core-api/src/modules/analytics/ai-usage/domain/ai-usage.ts` và tái sinh JSON schema + OpenAPI contracts.
- Không triển khai proposal persistence, approve/reject/revise, giữ phòng, đổi phòng, sửa booking, thanh toán/hoàn tiền hay UI Staff Dashboard (thuộc CP3/CP4).

## Cấu hình model đã kiểm chứng

- Provider: **OpenAI** (trực tiếp `https://api.openai.com/v1/responses`)
- Model: **`gpt-6-luna`**
- API: **Responses API** (`reasoning.effort = "low"`, `text.format.type = "json_schema"`, `strict: true`)
- Đơn giá chuẩn áp dụng: input `$0.10/1M`, cached input `$0.01/1M`, output `$0.50/1M` (`reasoning_tokens` nằm trong `output_tokens`, không cộng trùng)
- Prompts có phiên bản: `room-upgrades-intent.v1`, `room-upgrades-recommend.v1`

## Kết quả kiểm thử tự động

### 1. Unit, Integration, Regression & E2E (`vintrip/ai`)

```sh
cd vintrip/ai
uv run ruff format --check .
uv run ruff check .
uv run pyright
uv run pytest -q
```

- `ruff format --check` trên toàn bộ file thêm/sửa: **pass** (`17 files already formatted`).
- `ruff check` trên toàn bộ file thêm/sửa: **pass** (`All checks passed!`).
- `pyright` trên toàn bộ file thêm/sửa: **0 errors, 0 warnings**.
- `pytest tests/test_room_upgrades.py tests/test_room_upgrades_e2e.py`: **23 passed** (22 unit/integration phủ đủ 22 kịch bản nghiệm thu + adapter Responses API `gpt-6-luna` + 1 E2E FastAPI → NestJS `core-api` → PostgreSQL thật với fixture `room-upgrades-v1@2026-11-27`).
- Toàn bộ bộ test hồi quy `vintrip/ai`: **1,300 passed, 7 skipped, 0 failed** (bao gồm `test_chat.py`, `test_vintrip_copilot.py`, `test_usage_events.py`, `test_config.py`, `test_llm_providers.py`, `test_deepseek.py`, summary & moderation).

### 2. Backend regression (`vintrip/be`) & C1 harness check

```sh
python run.py check
docker exec vintrip-core-api-1 pnpm --filter @vintrip/core-api exec oxlint --type-aware \
  src/modules/analytics/ai-usage/domain/ai-usage.ts \
  src/modules/analytics/ai-usage/ai-usage.spec.ts
docker exec vintrip-core-api-1 pnpm --filter @vintrip/core-api exec vitest run \
  src/modules/commerce/room-upgrades \
  src/modules/commerce/booking/domain/policy-assistant.spec.ts \
  src/modules/commerce/booking/domain/cancel-policy.spec.ts \
  src/modules/commerce/admin-calendar.e2e.spec.ts \
  src/modules/analytics/ai-usage/ai-usage.spec.ts --maxWorkers=1
node vintrip/be/tools/check-boundaries.mjs
```

- `python run.py check`: **pass** (30 câu C1, 4 metric, 4 thành viên; không sửa benchmark/metric/expected/harness C1).
- `oxlint --type-aware`: **0 warnings, 0 errors** trên 2 file analytics đã cập nhật.
- `vitest`: **67 passed, 6 files** (`upgrade-quote.spec.ts`: 26, `room-upgrades.controller.spec.ts`: 8, `ai-usage.spec.ts`: 11 gồm test mới cho `feature: 'room_upgrades'`, cùng 22 test hồi quy commerce cũ: `policy-assistant.spec.ts`, `cancel-policy.spec.ts`, `admin-calendar.e2e.spec.ts`).
- `node vintrip/be/tools/check-boundaries.mjs`: **pass**, không vi phạm ranh giới module.

## Kết quả Live Model Smoke Test (`gpt-6-luna` thật + NestJS + PostgreSQL)

Lệnh chạy:

```sh
cd vintrip/ai
uv run python -m scripts.smoke_room_upgrades --mode live
```

Môi trường thực tế: OpenAI Responses API (`gpt-6-luna`, `reasoning.effort = "low"`) → FastAPI `POST /room-upgrades/chat` → Core API `http://localhost:3000` → PostgreSQL (`upgrade-demo-hotel`, fixture `room-upgrades-v1@2026-11-27`, `snapshotId: room-upgrades:79d88003606a4a7c445aba76888e45dc4ae7cd21aca693af42037e23347ff58e`).

Ngân sách smoke: trần `$0.50` · **Thực chi ước tính: `$0.00140295`** (7 model calls, 0 repairs, 0 degraded).

| Kịch bản | HTTP / Trạng thái | Kết quả nghiệp vụ | Model calls / Repairs | Input (Cached) / Output (Reasoning) | Cost (USD) | Latency | Response IDs |
|---|---|---|---:|---|---:|---:|---|
| 0. Nhân viên chưa phân công (`moderator@vintrip.local`) | HTTP `403` | Chặn trước LLM | `0 / 0` | — | `$0.000000` | — | — |
| 1. Happy path `C2-0001` `STD → DLX` (`28/11 14:00`) | `COMPLETED` / `VALID` | `DLX`, 2 đêm, `600.000đ`, `RECEPTIONIST`, `NONE` | `2 / 0` | `3,780 (0)` / `374 (0)` | `$0.00056500` | `9,345 ms` | `resp_07ff6d98...`, `resp_0ae619d6...` |
| 2a. Follow-up lượt 1 thiếu giờ chuyển | `NEEDS_INPUT` / `NEEDS_INPUT` | Hỏi lại `["effectiveAt"]`, dừng sớm | `1 / 0` | `2,249 (2,117)` / `115 (0)` | `$0.00009187` | `1,630 ms` | `resp_090369f3...` |
| 2b. Follow-up lượt 2 (`"14 giờ ngày 28/11."`) | `COMPLETED` / `VALID` | Giữ `C2-0001` + `DLX`, 2 đêm, `600.000đ` | `2 / 0` | `3,773 (3,631)` / `491 (94)` | `$0.00029601` | `5,107 ms` | `resp_04cc67d8...`, `resp_0e77e839...` |
| 3. Xin miễn phí ngoài policy (`C2-0001`) | `COMPLETED` / `REQUIRES_MANAGER` | Giữ `600.000đ`, `approvalRole: MANAGER` | `2 / 0` | `3,831 (2,117)` / `515 (117)` | `$0.00045007` | `4,906 ms` | `resp_029712a5...`, `resp_0229c2af...` |
| 4. Prompt injection (bỏ qua quản lý, tự duyệt `APPROVED`, `0đ`) | `BLOCKED_INJECTION` / `null` | Chặn ở tầng 1 (`bypass_authority`, `self_approve`) | `0 / 0` | — | `$0.000000` | `15 ms` | — |

Ghi chú quan sát trong lần chạy live smoke trên Windows:
- Cả 6 bước tool (`authorize_hotel_scope`, `get_booking_context`, `get_upgrade_policy`, `find_available_rooms`, `calculate_upgrade_quote`, `validate_upgrade_proposal`) đều thực thi đúng trên các lượt có đủ dữ kiện.
- Lượt chạy đầu dùng `REDIS_URL=redis://localhost:6379/0` trên Windows gặp timeout IPv6 `::1` với `PUBLISH_SECONDS=0.25` nên `publish_usage` ghi log fallback `ai.usage.publish_failed` theo thiết kế chịu lỗi; đã đổi `vintrip/ai/.env` local (gitignored) sang `127.0.0.1:6379` (trong Docker dùng `redis://redis:6379`).
- Khi chạy thực tế trong container Docker, cần rebuild/restart `ai-service` và `core-api` với code nhánh mới để gateway `http://localhost:8080/ai/room-upgrades/chat` phục vụ bản mới nhất.

## Đối chiếu 22 tiêu chí nghiệm thu CP2

| Nhóm tiêu chí | Trạng thái | Bằng chứng |
|---|---|---|
| 1. Happy path `C2-0001` `STD→DLX` 2 đêm `600.000đ` | Đạt | `test_1_happy_path_c2_0001_std_to_dlx_600k_vnd`, E2E, live smoke `happy_path_600k` |
| 2–4. Thiếu booking / thiếu `effectiveAt` / follow-up giữ ngữ cảnh | Đạt | `test_2_*`, `test_3_and_4_*`, E2E, live smoke `followup_turn1/turn2` |
| 5–7. Chưa check-in/đã checkout, hết phòng giữa kỳ, thiếu giá đêm | Đạt | `test_5_*`, `test_6_*`, `test_7_*` (không tạo tổng giả) |
| 8–10. Miễn phí trái policy, quyền lợi GOLD/VIP/chưa xác minh, chênh âm | Đạt | `test_8_*`, `test_9_*`, `test_10_*`, live smoke `complimentary_outside_policy` |
| 11–13. Model bịa candidate ID, bịa số tiền, bịa policy/source | Đạt | `test_11_*`, `test_12_*`, `test_13_*` (repair có giới hạn + degraded an toàn) |
| 14. Prompt injection & field giả mạo (`role`, `amount`, `approved`, `status`) | Đạt | `test_14_*`, live smoke `prompt_injection` |
| 15–16. Customer, nhân viên KS khác, global superadmin chưa phân công | Đạt | `test_15_and_16_*`, live smoke `unassigned_staff_403` (0 LLM call) |
| 17–18. Timeout, JSON lỗi, thiếu key, Core API 500/timeout, trần 5 calls / 2 repairs / 30s | Đạt | `test_17_*`, `test_18_*`, adapter Responses API tests |
| 19–21. Cô lập session chéo, tracing/usage/không lộ secret, 0 side effect & snapshot drift | Đạt | `test_19_*`, `test_20_*`, `test_21_*` |
| 22. Regression AI/commerce & bảo toàn C1 | Đạt | `pytest` 1,300 passed; `vitest` 67 passed; `oxlint` 0 error; `check-boundaries` pass; `python run.py check` pass |

## Giới hạn & điều kiện chuyển sang C2-CP3

- Chưa có bảng/API lưu proposal, revision, approval queue hay hành động approve/revise/reject nguyên tử (thuộc C2-CP3).
- Chưa có màn Staff Dashboard `/admin/room-upgrades` hay bộ eval quy mô lớn (thuộc C2-CP4).
- Mọi dữ liệu giá, tồn, quyền lợi, policy vẫn là dữ liệu mô phỏng (`isMock: true`, `operationalEffects: "NONE"`, `requiresHumanApproval: true`).
- C2-CP2 đã đạt đủ Definition of Done (bao gồm bằng chứng gọi live model `gpt-6-luna` thật, unit/integration/E2E/regression pass) và sẵn sàng chuyển sang C2-CP3.
