# Room upgrades — backend/domain contract (C2-CP1)

## Phạm vi và audit

Nguồn thiết kế: `TripFlix_Chot_C1_C2_C3.pdf`, mục 4, 6, 9; yêu cầu triển khai trong chat. C1 vẫn là case chính với benchmark CP2 đã khóa. Đây là tính năng mở rộng độc lập, chỉ tính và kiểm báo giá.

Tái sử dụng NestJS commerce, PostgreSQL/Drizzle, transaction host, auth/principal, CLS request trace, Zod, Vitest và Testcontainers hiện có. Không thêm dependency/framework. LLM adapter FastAPI và API client Next.js đã được rà soát nhưng không thay đổi trong CP1.

Catalog hiện có có loại phòng/giá/tồn ngày nhưng chưa có lịch sử tiền booking, trạng thái lưu trú, nhãn/version sandbox, quyền nhân viên cơ sở và điều kiện phòng sẵn sàng. Job mở lịch tự áp dụng cho catalog. Vì vậy dùng schema commerce và infrastructure chung, thêm dữ liệu sandbox `room_upgrade_*`; không seed C2 vào bảng bán phòng đang được các job/checkout sử dụng. Không có PMS theo phòng vật lý: `outOfService` là số phòng bị loại khỏi tồn khả dụng, do fixture mô phỏng cung cấp.

Tên code là `room-upgrades`, không dùng tên checkpoint làm tên feature. Bản đồ luồng/file: [feature README](../be/apps/core-api/src/modules/commerce/room-upgrades/README.md).

## Auth và quyền

Tất cả API dưới đây bắt buộc access token hợp lệ qua `@Authenticated()` hiện có. `AuthUser.userId` được đối chiếu phân công active trên server tại đúng `hotelId`; vai là `RECEPTIONIST` hoặc `MANAGER`. Vai global `superadmin` không bỏ qua phân công khách sạn.

Không có endpoint tự phân công. Body/query strict, không nhận role, amount, status, approval flag hoặc policy do client tự khai. Ngoài phạm vi trả 403 trước khi tra booking. Booking không có trong khách sạn đã được cấp quyền trả 404. Không trả PII khách; fixture không chứa tên, email hay số điện thoại thật.

## API

Namespace `/api/commerce/room-upgrades` dùng tên nghiệp vụ; thay đề xuất `/commerce/c2` để các developer dễ tìm. Gateway `/api/*` sẵn có đã chuyển tới core-api, không cần sửa Traefik.

| Method/path | Input | Kết quả |
|---|---|---|
| `GET /bookings` | Query `hotelId`, tùy chọn `roomNumber` | Booking hiện đang lưu trú theo status và thời gian server; `staffRole`, hotel, snapshot/version, requestId, isMock |
| `GET /bookings/:bookingCode` | Query `hotelId` | Booking, roomTypes/candidate IDs, inventory và rates từng ngày, policy và quyền lợi của riêng booking đó |
| `POST /quotes` | JSON bên dưới | Báo giá đã kiểm hoặc trạng thái thiếu dữ kiện/dữ liệu/không đủ điều kiện |

Tất cả phản hồi nghiệp vụ có `caseId: C2`, `requestId`, `snapshotId`, `fixtureVersion`, `isMock: true`; quote có `currency: VND`, `calculatedAt`, `expiresAt`. HTTP response dùng `Cache-Control: no-store`. POST chỉ tính toán, không lưu proposal nên không cần Idempotency-Key để chống tác động; mỗi lượt có quoteId mới.

Request ví dụ, dùng fixture neo ngày **2026-11-27**; nếu đổi ngày seed phải đổi ngày chuyển tương ứng:

```json
{
  "hotelId": "upgrade-demo-hotel",
  "bookingCode": "C2-0001",
  "targetRoomTypeId": "DLX",
  "effectiveAt": "2026-11-28T14:00:00+07:00",
  "requestType": "UPGRADE",
  "requiredFeatures": ["NON_SMOKING"]
}
```

`roomNumber` thay cho `bookingCode`, không gửi cả hai. Nhiều booking active cùng số phòng yêu cầu bổ sung bookingCode; booking đã hết thời gian ở không được chọn bằng số phòng. `targetRoomTypeId` phải là ID backend cung cấp, không phải tên do model bịa. `requestType`: `UPGRADE`, `ROOM_CHANGE`, `COMPLIMENTARY_UPGRADE`. `benefitId` tùy chọn, chỉ được dùng nếu backend xác minh là hợp lệ.

Đầu vào thiếu booking reference, target hay effectiveAt trả `NEEDS_INPUT` kèm `missingFields`, không đoán. Datetime phải có UTC offset hoặc Z; không tự hiểu ngày đơn lẻ thành số đêm/giờ chuyển. `UPGRADE` và `COMPLIMENTARY_UPGRADE` yêu cầu rank cao hơn; `ROOM_CHANGE` theo transition cho phép của policy.

Phần tiền của response thành công cho ví dụ trên (trích cấu trúc, không phải báo cáo benchmark):

```json
{
  "caseId": "C2",
  "status": "VALID",
  "currency": "VND",
  "isMock": true,
  "remainingNights": 2,
  "priceDiffVnd": 600000,
  "totals": {
    "newRoomTotalVnd": 3000000,
    "eligibleOriginalCreditVnd": 2400000,
    "additionalFeesVnd": 0,
    "additionalTaxVnd": 0,
    "eligibleDiscountVnd": 0,
    "priceDiffVnd": 600000
  },
  "validation": {"checked": true, "passed": true, "violations": []},
  "requiresHumanApproval": true,
  "approvalRole": "RECEPTIONIST",
  "operationalEffects": "NONE"
}
```

Response đầy đủ còn có quoteId, requestId, SHA-256 snapshotId, fixtureVersion, timezone, effectiveAt, calculatedAt, expiresAt, policy code/version/sources, benefit đã xác minh, `inventoryByNight`, `breakdown`, missingFields và violations. Mỗi dòng breakdown có ngày, tồn khả dụng, giá mới, giá gốc đã trả, đối trừ, phí, thuế, ưu đãi, chênh lệch, sourceRefs và version booking/inventory/rate/policy/benefit.

`VALID` chỉ là báo giá hợp lệ và vẫn chờ con người; không có `APPROVED` trong CP1. `REQUIRES_MANAGER` giữ số tiền tính được, cho chênh âm, vượt hạn mức hoặc miễn phí ngoài điều kiện. `UNAVAILABLE`, `MISSING_DATA`, `NEEDS_INPUT`, `INELIGIBLE` không có tổng tiền chính thức. `VALIDATION_FAILED` loại bỏ bảng tiền/tổng nếu bộ kiểm độc lập phát hiện sai.

## Quy tắc nghiệp vụ P0 (tất cả là giả định mô phỏng, có nguồn policy trong fixture)

- Một booking tương ứng một phòng. Status phải IN_HOUSE và server time nằm trong `[checkInAt, checkOutAt)`. EffectiveAt từ hiện tại, trong kỳ ở, trước checkout.
- Policy `FULL_LOCAL_NIGHT`: mỗi ngày địa phương từ ngày chuyển tới trước ngày checkout là một đêm đầy đủ. Chuyển giữa ngày cũng tính đêm đầy đủ do policy quy định; không chia giờ hoặc làm tròn thời lượng. Không có đêm mới vào ngày checkout. Liệt kê ngày theo lịch, không chia elapsed milliseconds/24h nên không sai ở DST. Thời điểm chuyển mơ hồ phải được bổ sung offset.
- Tồn khả dụng từng đêm = total − held − sold − outOfService; stopSell hoặc bất cứ đêm nào dưới một phòng đều chặn toàn kỳ. Không có giữ chỗ.
- Policy đang hiệu lực tại lúc báo giá và còn hiệu lực khi chuyển; chọn version mới nhất. Hai policy cùng version đang hiệu lực làm dữ liệu mơ hồ và chặn báo giá. Snapshot là một transaction repeatable-read/read-only; content hash phát hiện thay đổi cả khi nguồn chưa tăng version.
- Đối trừ dùng `creditEligibleVnd` trên từng đêm booking gốc, không vượt `paidVnd`; đây là tiền gốc đã gồm thuế. Không đọc giá niêm yết phòng cũ để tính credit. Policy có tỷ lệ đối trừ theo basis points.
- Công thức: `newRoomTotalVnd - eligibleOriginalCreditVnd + additionalFeesVnd + additionalTaxVnd - eligibleDiscountVnd`.
- Phí đổi một lần gán vào đêm đầu. Thuế chỉ cộng cho giá/phí chưa gồm thuế. Mức mô phỏng 10%; phí mặc định bằng 0 do policy ghi rõ, không phải fallback cho thiếu dữ liệu.
- Mọi tiền là số nguyên VND an toàn trong JSON. Nhân tỷ lệ và cộng tiền dùng BigInt, làm tròn half-up từng khoản tới VND theo policy. Vượt safe integer chặn báo giá; không silently clamp.
- Quyền lợi phải có verifiedAt trong quá khứ, có hiệu lực lúc báo giá và chuyển, đúng booking/hotel/target, thuộc policy cho phép. Không cộng dồn; tự chọn mức cao nhất hợp lệ, hoặc kiểm benefitId được yêu cầu. Giảm phần chênh dương trước phí/thuế theo từng đêm.
- GOLD-10 giảm 10% chênh lệch đủ điều kiện; VIP-FREE giảm 100% cho target được cho phép. Yêu cầu “miễn phí” không tạo quyền lợi hoặc sửa số tiền. Chênh âm không tạo hoàn tiền. Mọi báo giá vẫn chờ người duyệt.
- Hạn mức lễ tân mô phỏng 3.000.000đ; TTL 15 phút, giới hạn bởi thời hạn policy và checkout. Các mức này là fixture có phiên bản, không phải chính sách của khách sạn thật.
- Thiếu một ngày giá/tồn/credit hoặc policy thì tổng là null, kèm missingFields. Không thay thiếu dữ liệu bằng 0.

## Migration và fixture

Schema nguồn: `be/apps/core-api/src/modules/commerce/db/schema/room-upgrades.ts`. Migration sinh bằng lệnh có sẵn `pnpm --filter @vintrip/core-api db:generate commerce --name=room-upgrades`, thư mục `20261127163246_room-upgrades`. Chỉ thêm tám bảng sandbox với CHECK `is_mock = true`, version dương và FK có hotel scope. Không sửa migration cũ.

Chạy migration theo quy trình hiện có rồi seed rõ ràng, từ `vintrip/be/apps/core-api` sau build:

```sh
node dist/cli/seed-room-upgrades.js --date 2026-11-27 \
  --receptionist-user-id <UUID-tai-khoan-le-tan-da-co> \
  --manager-user-id <UUID-tai-khoan-quan-ly-da-co>
```

CLI chặn NODE_ENV=production, kiểm UUID/principal qua kết nối access riêng và chỉ phân công các principal được truyền vào. Không tạo tài khoản hoặc tăng global role. Không truyền UUID thì không cấp quyền ngầm. Không tự seed lúc startup. Chạy lại cùng fixture không tạo trùng/ghi đè; ngày hoặc version khác bị từ chối để tránh thay dữ liệu đang dùng. Dùng database sandbox mới để thử fixture khác.

Fixture có ba hạng STD/DLX/STE, mười booking giả định, tám booking đang ở, một đã checkout, một chưa check-in; giá/tồn tám ngày. Booking C2-0001 chứng minh chênh 600.000đ cho hai đêm, C2-0002 GOLD, C2-0003 VIP, C2-0006 quyền lợi chưa xác minh, C2-0010 chênh âm. Mọi giá, tồn, quy tắc và quyền lợi là **tự ước tính để mô phỏng**, không phải dữ liệu vận hành hoặc bằng chứng nghiên cứu.

## Kiểm tra và ranh giới checkpoint

```sh
pnpm --filter @vintrip/core-api exec vitest run src/modules/commerce/room-upgrades --maxWorkers=1
pnpm --filter @vintrip/core-api exec vitest run --config vitest.int.config.ts src/modules/commerce/room-upgrades/infra/drizzle-room-upgrade.store.int.spec.ts --maxWorkers=1
pnpm --filter @vintrip/core-api typecheck
```

Integration test mặc định dùng Testcontainers như repo. Khi chạy trong container không có Docker socket, có thể truyền `ROOM_UPGRADE_TEST_DATABASE_URL`; bắt buộc tên database riêng `room_upgrade_test_*`, tuyệt đối không dùng database vận hành. Test chạy toàn bộ migration commerce và Nest HTTP với Drizzle/transaction thật, kiểm seed idempotent, read-only, giá/tồn thay đổi, thiếu giá và bất biến bảng vận hành. Không sửa benchmark/expected/metric C1.

Acceptance CP1 kiểm các ca 1–9; ca 10 mới kiểm authority/schema ở backend, chưa phải thử model injection. Ca 13 kiểm fresh requests nhận dữ liệu mới; kiểm lúc approve thuộc CP3. Ca 16 hiện chứng minh tính báo giá không gây side effect; approve thuộc CP3. Ca 11,12,14 và phần approve chưa triển khai; ca 15 thuộc CP2. Không ghi các ca chưa triển khai là pass.

CP2 chỉ bắt đầu sau khi checkpoint này qua test. Còn phải nối LLM thật với structured extraction, năm tool nghiệp vụ, candidate allowlist, giới hạn 5 calls/2 repairs/30 giây và usage/trace thật. CP3 mới lưu proposal/revision/audit và triển khai duyệt nguyên tử; CP4 mới có UI lễ tân/eval AI. Hiện không có API approve/revise/reject và không có màn `/admin/room-upgrades`.

---

# Room upgrades — AI Copilot contract (C2-CP2)

## Phạm vi và kiến trúc CP2

CP2 bổ sung tầng AI orchestration, tool execution, guardrails và observability ngay trong FastAPI AI Service (`vintrip/ai`), không tạo microservice mới, không dùng LangGraph/RAG/vector DB, và không sao chép pricing/policy engine sang Python. Backend NestJS CP1 tiếp tục là nguồn sự thật duy nhất về quyền, tồn phòng, giá, quyền lợi, chính sách và kiểm độc lập.

Luồng tuần tự có kiểm soát:

`Authenticate (JWT + /api/auth/me) → Authorize hotel scope (Core API /bookings) → Scoped session check → Input injection guardrail → Structured Intent Extraction (LLM #1) → Resolve booking & hotel-timezone datetime → Tools (get_booking_context, get_upgrade_policy, find_available_rooms, calculate_upgrade_quote, validate_upgrade_proposal) → Recommendation & draft (LLM #2 + allowlist/price guardrails) → Structured JSON response + FinOps usage + trace`.

CP2 **không** lưu proposal, không approve/reject/revise, không giữ phòng, không đổi phòng, không sửa booking, không thu/hoàn tiền.

## Endpoint, routing và bảo mật

- Gateway (Traefik `dynamic.yml` strip prefix `/ai`): `POST /ai/room-upgrades/chat`
- FastAPI AI Service: `POST /room-upgrades/chat` (trả `Cache-Control: no-store`)
- Bắt buộc `Authorization: Bearer <accessToken>` của chính nhân viên (`401` nếu thiếu/hết hạn/thu hồi hoặc dùng service token).
- Luôn xác minh phân công khách sạn trên Core API (`GET /api/commerce/room-upgrades/bookings?hotelId=...`) **trước** khi gửi dữ liệu nghiệp vụ cho LLM (`403` cho khách hàng, nhân viên khách sạn khác hoặc global `superadmin` chưa được phân công).
- Không dùng service account đặc quyền để bypass phạm vi người dùng; không tin `role`, `userId`, `amount`, `status`, `approved` do client gửi (schema `extra="forbid"` trả `422`).
- Session theo `sessionId` gắn chặt `(ownerUserId, hotelId)`; tái sử dụng `sessionId` bởi nhân viên hoặc khách sạn khác bị chặn `403`.
- Không log `Authorization` header, Bearer token, API key hoặc raw PII.

## Request contract

```json
{
  "hotelId": "upgrade-demo-hotel",
  "message": "Khách booking C2-0001 muốn nâng từ STD lên Deluxe lúc 14 giờ ngày 28/11.",
  "sessionId": "8f3c6a71-3d21-4c76-9e7d-2f07f6a7d101",
  "selectedBookingCode": "C2-0001",
  "context": {
    "targetRoomHint": "Deluxe"
  }
}
```

- `hotelId` (bắt buộc), `message` (bắt buộc, 1–1000 ký tự).
- `sessionId` (tùy chọn UUID; tự cấp mới nếu không truyền).
- `selectedBookingCode` và `context` (tùy chọn, chỉ chứa gợi ý chưa xác thực cho lượt follow-up; mọi giá trị được kiểm lại trên backend).

## Response contract (sẵn sàng cho Staff Dashboard CP4)

Tách rõ hai lớp trạng thái:

- `workflowStatus`: `COMPLETED` | `NEEDS_INPUT` | `OUT_OF_SCOPE` | `BLOCKED_INJECTION` | `DEGRADED` | `AI_ERROR` | `DEPENDENCY_ERROR`
- `quoteStatus`: giữ nguyên enum CP1 (`VALID`, `REQUIRES_MANAGER`, `UNAVAILABLE`, `MISSING_DATA`, `NEEDS_INPUT`, `INELIGIBLE`, `VALIDATION_FAILED`) hoặc `null` khi chưa có báo giá.

Trích cấu trúc phản hồi thành công (happy path `C2-0001`, `STD → DLX`, 2 đêm):

```json
{
  "requestId": "...",
  "caseId": "C2",
  "sessionId": "...",
  "sessionContext": {
    "hotelId": "upgrade-demo-hotel",
    "bookingCode": "C2-0001",
    "targetRoomTypeId": "DLX",
    "effectiveAt": "2026-11-28T14:00:00+07:00",
    "requestType": "UPGRADE",
    "requiredFeatures": [],
    "guestPreferences": [],
    "pendingMissingFields": []
  },
  "workflowStatus": "COMPLETED",
  "quoteStatus": "VALID",
  "messageVi": "Đề xuất Deluxe hướng vườn (DLX) cho booking C2-0001: 2 đêm, chênh lệch 600.000đ (VALID). Chờ RECEPTIONIST duyệt.",
  "recommendationReasonVi": "...",
  "draftMessageVi": "...",
  "missingFields": [],
  "violations": [],
  "bookingSummary": { "bookingCode": "C2-0001", "roomNumber": "101", "currentRoomTypeId": "STD", "status": "IN_HOUSE", "guests": 2 },
  "candidates": [ { "candidateId": "DLX", "quoteStatus": "VALID", "priceDiffVnd": 600000, "remainingNights": 2, "approvalRole": "RECEPTIONIST", "requiresHumanApproval": true } ],
  "selectedCandidateId": "DLX",
  "selectedQuote": { "status": "VALID", "priceDiffVnd": 600000, "remainingNights": 2, "requiresHumanApproval": true, "operationalEffects": "NONE" },
  "policySources": [ { "ref": "STAY-UPGRADE:v1:TIME", "code": "TIME", "policyCode": "STAY-UPGRADE", "policyVersion": 1, "clause": "..." } ],
  "requiresHumanApproval": true,
  "approvalRole": "RECEPTIONIST",
  "staffRole": "RECEPTIONIST",
  "snapshotId": "room-upgrades:...",
  "fixtureVersion": "room-upgrades-v1@2026-11-27",
  "isMock": true,
  "operationalEffects": "NONE",
  "model": {
    "provider": "openai",
    "api": "responses",
    "model": "gpt-6-luna",
    "reasoningEffort": "low",
    "promptVersions": ["room-upgrades-intent.v1", "room-upgrades-recommend.v1"],
    "status": "ok",
    "degraded": false,
    "callCount": 2,
    "repairCount": 0,
    "usageStatus": "reported",
    "inputTokens": 0,
    "cachedInputTokens": 0,
    "outputTokens": 0,
    "reasoningTokens": 0,
    "costUsd": 0,
    "responseIds": ["resp_..."],
    "guardrailEvents": []
  },
  "trace": { "requestId": "...", "totalLatencyMs": 0, "steps": [], "tools": [], "modelCalls": [], "policyVersion": 1 }
}
```

## Cấu hình model, guardrails và FinOps

- Provider chính thức: **OpenAI Responses API** trực tiếp (`https://api.openai.com/v1/responses`), model `gpt-6-luna`, `reasoning.effort = "low"`, `text.format.type = "json_schema"` (`strict: true`), `store: false`. Không bật hosted tools (`web_search`, `file_search`, `code_interpreter`). Không tự fallback sang `gpt-4o-mini` hoặc provider khác.
- Cấu hình riêng qua `ROOM_UPGRADES_LLM_*` + `OPENAI_API_KEY` để không ảnh hưởng C1/C3 và chat cũ.
- Giới hạn cứng: tối đa **5 model calls/lượt**, **2 lần repair**, **30 giây** deadline toàn workflow (tính từ lúc nhận request gồm auth, backend tools và LLM); single-attempt per HTTP call (không retry ngầm ở SDK).
- Allowlist & guardrails:
  - Candidate ID chỉ lấy từ `roomTypes` của backend; từ chối ID bịa (`HALLUCINATED_CANDIDATE_ID`).
  - Nguồn chính sách kiểm theo allowlist từ backend (`HALLUCINATED_SOURCE_REF`).
  - Kiểm tra số tiền VND và tuyên bố hành động/miễn phí trong văn bản do LLM sinh (`FABRICATED_PRICE_IN_TEXT`, `UNAUTHORIZED_WAIVER_CLAIM`, `FORBIDDEN_ACTION_CLAIM`); số tiền chính thức luôn lấy trực tiếp từ backend CP1.
  - Nhất quán snapshot: nếu `snapshotId` lệch giữa `get_booking_context` và `calculate_upgrade_quote`, đọc lại và báo giá lại tối đa 1 lần; nếu vẫn lệch thì trả `SNAPSHOT_INCONSISTENT` (`MISSING_DATA`, không gộp snapshot).
  - Nếu lỗi model xảy ra ở bước Intent Extraction → trả `workflowStatus: "AI_ERROR"`, `quoteStatus: null` (không bao giờ sinh báo giá chưa xác minh). Nếu lỗi model xảy ra ở bước Recommendation sau khi backend đã kiểm báo giá → fallback deterministic an toàn có gắn nhãn `workflowStatus: "DEGRADED"`, `model.degraded: true`.
- FinOps & analytics:
  - Đơn giá chuẩn `gpt-6-luna`: input `$0.10/1M`, cached input `$0.01/1M`, output `$0.50/1M` (`reasoning_tokens` đã nằm trong `output_tokens`, không tính trùng).
  - Phát `UsageEvent` với `feature: "room_upgrades"` lên `stream:ai` cho mọi model call kể cả output lỗi/repair; thiếu usage từ provider ghi `usage_missing` (`inputTokens: null`, `outputTokens: null`), không tự bịa số.
  - `vintrip/be` analytics consumer (`AI_FEATURES`) đã bổ sung `'room_upgrades'` theo hướng tương thích ngược.

Chi tiết bản đồ code và bằng chứng kiểm thử CP2: [AI feature README](../ai/app/services/room_upgrades/README.md) · [evidence CP2](../ai/docs/evidence/room-upgrades-cp2.md).
