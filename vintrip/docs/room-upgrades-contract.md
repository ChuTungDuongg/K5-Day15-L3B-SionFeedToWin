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
