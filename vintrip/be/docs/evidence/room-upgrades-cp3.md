# Room upgrades — C2-CP3 Evidence (HITL Approval Workflow & Transaction Safety)

Ngày: 2026-11-28. Nhánh: `feat/c2-room-upgrade`. Baseline CP3: `a7956c89b2b3ee760c3fbd43cf0bbbd72fca781d` (sau C2-CP1 và C2-CP2).

Mô hình triển khai: **Neon** (Principal Engineer / Tech Lead / Independent QA / Git owner) điều phối **Codex CLI (`gpt-6.1-sol`)** theo 5 work package (WP1–WP5), review độc lập toàn bộ diff và chạy kiểm thử xác minh trực tiếp trên PostgreSQL thật và AI service. Không thay đổi cấu hình runtime LLM `gpt-6-luna` của CP2.

## 1. Tóm tắt hạng mục đã hoàn thành

- **WP1 — Proposal Persistence & Migration:** bổ sung 4 bảng sandbox (`is_mock = true` ép bằng `CHECK`) vào schema `commerce`: `room_upgrade_proposals`, `room_upgrade_proposal_revisions`, `room_upgrade_proposal_audit_events`, `room_upgrade_proposal_idempotency`; sinh migration sạch `20261127175228_room-upgrade-proposals` (không sửa migration CP1, không đụng bảng vận hành).
- **WP2 — State Machine, RBAC & 8 API Endpoints:** triển khai 8 endpoint dưới `/api/commerce/room-upgrades/proposals` (`POST /`, `GET /`, `GET /:proposalId`, `GET /:proposalId/history`, `POST /:proposalId/revise`, `POST /:proposalId/approve`, `POST /:proposalId/reject`, `POST /:proposalId/escalate`), strict Zod validation, `Cache-Control: no-store`, phân quyền theo `room_upgrade_staff_assignments` trên server (kể cả chặn `superadmin` không có phân công và nhân viên bị thu hồi), preview-mismatch guard (`409 PREVIEW_MISMATCH`).
- **WP3 — Transaction Safety & Concurrency Hardening:** transaction `SERIALIZABLE` với bounded retry (tối đa 3 lượt chỉ cho `40001`/`40P01`/`23505` trên `room_upgrade_proposal_idempotency_pkey`, quá hạn trả `409 CONCURRENT_MODIFICATION`), `SELECT ... FOR UPDATE` trên proposal, `SELECT ... FOR SHARE` theo thứ tự chuẩn (`bookings → inventory → rates → policies → benefits`) chống TOCTOU khi nguồn thay đổi cạnh tranh lúc duyệt, CAS `UPDATE ... WHERE hotel_id AND id AND version AND status`, commit `EXPIRED`/`REQUOTE_REQUIRED` cùng audit & idempotency trong cùng transaction, rollback toàn bộ khi ghi audit lỗi.
- **WP4 — AI CP2 Integration (chỉ đọc):** bổ sung trường tùy chọn tương thích ngược `proposalDraft` vào `RoomUpgradeChatResponse` (`vintrip/ai`), cập nhật OpenAPI `vintrip/ai/contracts/openapi/ai-service.json` (LF); không thêm write/approve tool cho LLM và không sửa cấu hình OpenAI `gpt-6-luna`.
- **WP5 — Testing, Hardening & Documentation:** viết và chạy độc lập 230 test domain proposal, 78 test HTTP proposal, 42 test PostgreSQL thật (kèm barrier concurrency & `pg_stat_activity` lock-wait proof), hồi quy CP1/CP2/commerce/analytics/auth, cập nhật đầy đủ tài liệu contract sẵn sàng cho CP4.

## 2. Các lỗi Neon phát hiện khi review độc lập và đã giao Codex sửa

| Mức độ | Phát hiện của Neon | Cách xử lý & xác minh |
|---|---|---|
| **P1 (Migration FK Safety)** | WP1 ban đầu dùng `uniqueIndex('uq_room_upgrade_proposals_hotel_id')`, Drizzle Kit phát sinh `CREATE UNIQUE INDEX` sau `ALTER TABLE ... ADD CONSTRAINT fk_...` có nguy cơ lỗi tạo FK trên PostgreSQL. | Đổi sang table-level `unique('uq_room_upgrade_proposals_hotel_id')` để phát sinh `CONSTRAINT ... UNIQUE` ngay trong `CREATE TABLE`; xác minh áp dụng migration thành công trên PostgreSQL thật (`room_upgrade_test_cp3_20261128`). |
| **P1 (TOCTOU nguồn khi duyệt dưới SSI)** | Dưới PostgreSQL `SERIALIZABLE` SSI, một transaction chỉ cập nhật `room_upgrade_rates` không đọc `room_upgrade_proposals` sẽ không tạo chu trình `rw-antidependency` nếu `approve` không giữ khóa hàng nguồn, dẫn đến nguy cơ duyệt giá cũ trong cửa sổ cạnh tranh. | Bổ sung `lockApprovalSourcesForShare` (`SELECT ... FOR SHARE` theo thứ tự chuẩn `bookings → inventory → rates → policies → benefits`) trước khi nạp snapshot trong `approveProposal`; chứng minh bằng test `D7` quan sát trực tiếp `pg_blocking_pids(pid)` trong `pg_stat_activity` → `40001` retry → `409 REQUOTE_REQUIRED`. |
| **P1 (Cross-stack `null` vs Zod `.optional()`)** | FastAPI `response_model` mặc định tuần tự hóa trường `None` thành JSON `null`, trong khi `CreateProposalRequestSchema` (`benefitId: id.optional()`) và `AiRecommendationMetadataSchema` từ chối `null`; `draft_message_vi` CP2 dài tối đa 1.200 ký tự còn metadata CP3 giới hạn 1.000 ký tự. | Bổ sung `@model_serializer(mode="wrap")` bỏ key `None` (vẫn bảo toàn toàn bộ properties trong OpenAPI JSON Schema — kiểm chứng bằng test `test_proposal_draft_openapi_retains_payload_and_metadata_fields`) và giới hạn text metadata ≤ 1.000 ký tự. |
| **P2 (Stale-quote diagnostic noise)** | Khi `calculateQuote` thoát sớm (`CHECKED_OUT`, `UNAVAILABLE`, `MISSING_DATA`), mảng `breakdown`/`inventoryByNight` rỗng gây phát sinh thêm mã `RATE_CHANGED`/`POLICY_VERSION_CHANGED` không chính xác. | Chặn so sánh các phần chưa tính khi thoát sớm; thêm 4 test end-to-end dùng engine thật trong `room-upgrade-proposal.spec.ts`. |
| **P2 (Spec assertions / type / lint)** | (1) `room-upgrade-proposal.spec.ts` kiểm `status: 'APPROVED'` như trường giả mạo trên `ListProposalsQuerySchema` (vốn chấp nhận filter `status`); (2) `room-upgrade-proposals.controller.spec.ts:165` lỗi TS2345 (`unknown` vào `supertest.send`); (3) `room-upgrade-proposals.controller.spec.ts:512` 1 warning `oxlint` (`require-array-sort-compare`). | Đã sửa sạch cả 3 điểm; đạt **0 lỗi `tsc --noEmit`** và **0 warning / 0 error `oxlint --type-aware`**. |

## 3. Kết quả kiểm thử độc lập (thực chạy 100%, không ước lượng)

### 3.1 Backend TypeScript (`vintrip-core-api-1`, `--maxWorkers=1`)

| Hạng mục | Lệnh chạy | Kết quả thực tế |
|---|---|---|
| Typecheck toàn `@vintrip/core-api` | `NODE_OPTIONS=--max-old-space-size=1536 pnpm --filter @vintrip/core-api typecheck` | **PASS — 0 errors** |
| Type-aware Lint | `pnpm --filter @vintrip/core-api exec oxlint --type-aware src/modules/commerce/room-upgrades src/modules/commerce/db/schema/room-upgrades.ts` | **PASS — 0 warnings, 0 errors** (22 files, 111 rules) |
| Unit & HTTP `room-upgrades` + hồi quy Commerce/Analytics/Auth | `pnpm --filter @vintrip/core-api exec vitest run src/modules/commerce/room-upgrades src/modules/commerce/booking/domain/policy-assistant.spec.ts src/modules/commerce/booking/domain/cancel-policy.spec.ts src/modules/commerce/admin-calendar.e2e.spec.ts src/modules/analytics/ai-usage/ai-usage.spec.ts src/modules/access/auth.e2e.spec.ts src/modules/access/staff.e2e.spec.ts src/modules/access/service-token.e2e.spec.ts --maxWorkers=1` | **PASS — 11/11 files, 396/396 tests**: `room-upgrade-proposal.spec.ts` (230), `room-upgrade-proposals.controller.spec.ts` (78), `upgrade-quote.spec.ts` (26), `room-upgrades.controller.spec.ts` (8), `policy-assistant.spec.ts` (11), `cancel-policy.spec.ts` (6), `admin-calendar.e2e.spec.ts` (5), `ai-usage.spec.ts` (11), `auth.e2e.spec.ts` (7), `staff.e2e.spec.ts` (6), `service-token.e2e.spec.ts` (8) |
| Auth library `@vintrip/auth` | `pnpm --filter @vintrip/auth exec vitest run --maxWorkers=1` | **PASS — 4/4 files, 35/35 tests** (`guards` 21, `verifier` 8, `service-token` 4, `revocation` 2) |
| **PostgreSQL thật (Integration + Concurrency + Stale Quote + Rollback + Side Effects)** | `ROOM_UPGRADE_TEST_DATABASE_URL=".../room_upgrade_test_cp3_20261128" pnpm --filter @vintrip/core-api exec vitest run --config vitest.int.config.ts src/modules/commerce/room-upgrades/infra/drizzle-room-upgrade.store.int.spec.ts src/modules/commerce/room-upgrades/infra/drizzle-room-upgrade-proposals.int.spec.ts --maxWorkers=1` | **PASS — 2/2 files, 46/46 tests** (4 CP1 + 42 CP3: A1–A5, B1–B5, C1–C12 với barrier đồng bộ thật, D1–D8 gồm `D7` chứng minh `pg_blocking_pids`, E1 bất biến byte-for-byte 17 bảng vận hành & nguồn, E2 `23514` CHECK `is_mock=true` trên 4 bảng mới) |

### 3.2 AI Service (`vintrip/ai`), Boundary & C1 Guardrails

| Hạng mục | Lệnh chạy | Kết quả thực tế |
|---|---|---|
| AI Room Upgrades tests (CP2 + CP3 `proposalDraft`) | `uv run pytest tests/test_room_upgrades.py tests/test_room_upgrades_e2e.py` | **PASS — 68/68 tests** (67 unit/contract + 1 E2E) |
| AI Lint (`ruff check`) | `uv run ruff check app/services/room_upgrades app/api/room_upgrades.py tests/test_room_upgrades.py tests/test_room_upgrades_e2e.py` | **PASS — All checks passed** |
| AI Format (`ruff format --check`) | `uv run ruff format --check app/services/room_upgrades app/api/room_upgrades.py tests/test_room_upgrades.py tests/test_room_upgrades_e2e.py` | **PASS — 11 files already formatted** |
| AI Typecheck (`pyright`) | `uv run pyright app/services/room_upgrades app/api/room_upgrades.py tests/test_room_upgrades.py tests/test_room_upgrades_e2e.py` | **PASS — 0 errors, 0 warnings** |
| Module boundaries | `node vintrip/be/tools/check-boundaries.mjs` | **PASS — không có vi phạm** |
| C1 benchmark/metric guard | `python run.py check` | **PASS — 30 câu C1, 4 metric, 4 thành viên** (không sửa §7, benchmark, metric hay harness) |
| Whitespace & diff check | `git diff --check` | **PASS — 0 lỗi** |

## 4. Đối chiếu Acceptance (CP1–CP3)

| Ca | Trạng thái sau C2-CP3 |
|---|---|
| 1–9 | Báo giá 600.000đ, sửa ngày, hết phòng, thiếu giá, checkout/chưa check-in, miễn phí trái policy, quyền lợi xác minh/chưa xác minh/hết hạn, chênh âm `-1.000.000đ`, auth + hotel scope (kể cả `superadmin`): **PASS** (đã mở rộng đủ cho proposal create/revise/approve/reject/escalate) |
| 10 | Chặn giả mạo `actorRole`/`amount`/`status`/`approved`/`isMock` (`400`) và chặn prompt injection yêu cầu tự duyệt (`BLOCKED_INJECTION`, `proposalDraft: null`): **PASS** |
| 11, 12 | Concurrent approve/reject/revise (barrier đồng bộ trên PostgreSQL thật), `expectedVersion` CAS, duplicate idempotency key & payload mismatch, rollback khi audit lỗi: **PASS** (42 ca PostgreSQL thật) |
| 13 | Dữ liệu nguồn thay đổi trước hoặc ngay trong lúc approve (giá, tồn giữa kỳ, booking checkout, policy version, benefit hết hạn, mid-approve concurrent rate update): **PASS** (`409 REQUOTE_REQUIRED` commit + audit `MARKED_REQUOTE_REQUIRED`, không gia hạn `expiresAt`) |
| 14 | Proposal hết hạn: **PASS** (`409 PROPOSAL_EXPIRED` commit + audit `MARKED_EXPIRED`; không cho approve lại) |
| 15 | Model timeout/invalid output/budget cap (CP2, giữ nguyên cấu hình `gpt-6-luna`): **PASS** (68/68 AI tests) |
| 16 | Zero side effects sau create/revise/escalate/approve/reject: **PASS** (chứng minh bất biến byte-for-byte trên 7 bảng vận hành `orders`, `order_items`, `room_inventory`, `room_rates`, `payments`, `refunds`, `idempotency_keys` và toàn bộ bảng nguồn CP1) |

## 5. Giới hạn và bước tiếp theo (CP4)

- Cơ sở dữ liệu test tạm `room_upgrade_test_cp3_20261128` chỉ dùng cho chạy integration test và đã được dọn sạch sau nghiệm thu; database `core` vận hành không bị đụng bởi test.
- Chưa xây dựng giao diện Staff Dashboard (`/admin/room-upgrades`) và luồng hiển thị hàng đợi duyệt trên Next.js — thuộc phạm vi **C2-CP4**.
- Toàn bộ tài liệu contract và OpenAPI đã sẵn sàng cho CP4: [room-upgrades-contract.md](../../../docs/room-upgrades-contract.md) · [ai-service.json](../../../ai/contracts/openapi/ai-service.json).
