# Room upgrades — C2-CP1

Ngày: 2026-11-27. Nhánh: `feat/c2-room-upgrade`, tách từ `origin/main` tại `4392b90`. Người dùng đã yêu cầu commit/push nhánh sau khi duyệt checkpoint trong chat. Không mở PR. Không có mã task TF được cung cấp; không tự tạo mã.

## Kết quả

Đã thêm module `commerce/room-upgrades`: auth và hotel assignment, booking context, tồn toàn khoảng ngày, policy có phiên bản, giá gốc từng đêm, phí/thuế/quyền lợi xác minh, calculator số nguyên VND, validator độc lập, quote snapshot/version/nguồn và nhãn mô phỏng. Không có proposal persistence hoặc API duyệt trong checkpoint này.

Tên file/class/API/bảng dùng nghiệp vụ room-upgrades theo yêu cầu đổi tên. [Bản đồ file và luồng](../../apps/core-api/src/modules/commerce/room-upgrades/README.md), [contract và ví dụ request/response](../../../docs/room-upgrades-contract.md).

## Kiểm tra đã chạy

Trong container core-api, working directory `/repo`:

```sh
pnpm --filter @vintrip/core-api exec vitest run \
  src/modules/commerce/room-upgrades \
  src/modules/commerce/booking/domain/policy-assistant.spec.ts \
  src/modules/commerce/booking/domain/cancel-policy.spec.ts \
  src/modules/commerce/admin-calendar.e2e.spec.ts --maxWorkers=1
```

**56 test pass, 5 file**: 26 domain + 8 HTTP room-upgrades; 22 test hồi quy commerce cũ. Auth HTTP test dùng guard thật và verifier test xác định principal, không giả lập bộ phận tính giá.

```sh
ROOM_UPGRADE_TEST_DATABASE_URL=<URL-database-test-rieng> \
pnpm --filter @vintrip/core-api exec vitest run --config vitest.int.config.ts \
  src/modules/commerce/room-upgrades/infra/drizzle-room-upgrade.store.int.spec.ts --maxWorkers=1
```

**4 test pass** trên PostgreSQL thật, database riêng `room_upgrade_test_cp1_20261127`, pool tối đa 2. Chạy đầy đủ migration commerce; seed idempotent, FK/CHECK, phân công theo khách sạn, Nest HTTP/Drizzle/transaction thật, repeatable-read/read-only, dữ liệu giá/tồn thay đổi và bất biến bảng vận hành. Không chạy integration test trên database core vận hành.

- `NODE_OPTIONS=--max-old-space-size=1536 pnpm --filter @vintrip/core-api typecheck`: **pass**, toàn core-api. Lượt đầu với heap 896 MB hết bộ nhớ; đã tăng heap tạm và sửa lỗi type mới phát hiện, sau đó chạy pass.
- `pnpm --filter @vintrip/core-api exec oxlint --type-aware src/modules/commerce/room-upgrades src/modules/commerce/db/schema/room-upgrades.ts src/cli/seed-room-upgrades.ts`: **0 warning, 0 error**, 16 file.
- `pnpm --filter @vintrip/core-api lint`: **0 error, 131 warning** trong code có sẵn ngoài phạm vi; phần mới không có warning.
- `node vintrip/be/tools/check-boundaries.mjs`: **pass**, không có vi phạm ranh giới module.
- `python run.py check`: **pass** — 30 câu C1, 4 metric, 4 thành viên; chỉ kiểm cấu trúc, không phải chạy/chấm benchmark AI.
- `git diff --check`: pass. Đã so sánh nguyên văn §7 với HEAD và kiểm các đường dẫn benchmark/metric/harness/AI/FE không đổi trên nhánh C2.

## Migration và smoke test local

- Sinh migration bằng `pnpm --filter @vintrip/core-api db:generate commerce --name=room-upgrades`.
- Migration `20261127163246_room-upgrades`: chỉ CREATE 8 bảng sandbox và FK của chúng, không DROP/TRUNCATE hoặc ALTER bảng vận hành.
- Trước khi migrate database local, đã kiểm lịch sử: migration cuối là `20261119041107_departure_reminder`; pending duy nhất là migration room-upgrades mới. Đã áp dụng bằng Drizzle migrator của commerce.
- Rebuild/restart riêng core-api bằng Docker Compose hiện có; health trả **200**. Route mới qua gateway trả **401** khi không có token, chứng minh route đã đăng ký và được bảo vệ.
- Chạy CLI seed có kiểm principal thật: fixture neo `2026-11-27`, **10 booking, 3 hạng phòng, 2 phân công active**. Các tài khoản dev đã có `member@vintrip.local` và `superadmin@vintrip.local` lần lượt được phân công RECEPTIONIST/MANAGER tại đúng khách sạn mô phỏng; không đổi global role hay thông tin đăng nhập.
- Override tài nguyên nằm ngoài repo tại `%TEMP%/vintrip-preview.override.yaml`: core-api 2 GiB, Node heap 1536 MB để typecheck/biên dịch; không đổi Dockerfile/Compose được commit.

## Đối chiếu acceptance

| Ca | Mức hoàn thành trong CP1 |
|---|---|
| 1, 2 | Báo giá 600.000đ, đổi ngày và tính lại số đêm/giá: pass |
| 3, 4 | Hết phòng giữa kỳ, thiếu giá một đêm: pass, không tạo tổng giả |
| 5 | Đã checkout/chưa check-in: pass |
| 6, 7, 8 | Miễn phí trái policy, quyền lợi hợp lệ/chưa xác minh/hết hạn, chênh âm: pass |
| 9 | Token bắt buộc và hotel scope từ server: pass, kể cả global superadmin chưa được phân công |
| 10 | Backend/schema không cho tự gán role/amount/status: pass; chưa đánh giá prompt injection trên model |
| 11, 12, 14 | Concurrent approve, expectedVersion và proposal expiry: chưa làm, thuộc CP3 |
| 13 | Request mới đọc lại giá/tồn/snapshot: pass; kiểm lại lúc approve thuộc CP3 |
| 15 | Model timeout/invalid output: chưa làm, thuộc CP2 |
| 16 | Tính báo giá và retry không đổi booking/inventory/payment: pass; approve chưa tồn tại, thuộc CP3 |

Không có kết quả benchmark/model/latency/chi phí AI được tạo hoặc suy diễn từ các test deterministic này.

## Giới hạn và điều kiện chuyển checkpoint

Không phát hiện blocker còn lại cho CP1. C2-CP2 có thể bắt đầu từ contract và ID/phương án backend sau khi được yêu cầu. Phải tiếp tục triển khai LLM/tool workflow và usage/trace thật ở CP2; proposal/revision/audit, duyệt nguyên tử và các test approval ở CP3; UI/eval ở CP4. Không coi VALID quote là APPROVED, giữ phòng hoặc đã thu tiền.

C1/C3 business logic và endpoint draft-change cũ không đổi. `spec.md` chỉ thêm một dòng changelog, không sửa §7/expected/metric. Thay đổi của người dùng tại `data/synthetic-interviews/` và `evidence/interviews/GUIDE.md` được giữ nguyên, ngoài phạm vi.

## Danh sách file

- `spec.md`
- `vintrip/CONTRACTS.md`
- `vintrip/be/apps/core-api/src/cli/seed-room-upgrades.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/commerce.module.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/db/migrations/20261127163246_room-upgrades/migration.sql`
- `vintrip/be/apps/core-api/src/modules/commerce/db/migrations/20261127163246_room-upgrades/snapshot.json`
- `vintrip/be/apps/core-api/src/modules/commerce/db/schema/index.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/db/schema/room-upgrades.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/README.md`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/api/room-upgrades.controller.spec.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/api/room-upgrades.controller.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/application/room-upgrade.ports.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/application/room-upgrade.use-cases.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/domain/quote-primitives.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/domain/room-upgrade.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/domain/upgrade-quote-validator.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/domain/upgrade-quote.spec.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/domain/upgrade-quote.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/infra/drizzle-room-upgrade.store.int.spec.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/infra/drizzle-room-upgrade.store.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/infra/room-upgrade.fixture.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/infra/seed-room-upgrade-fixture.ts`
- `vintrip/be/apps/core-api/src/modules/commerce/room-upgrades/room-upgrades.module.ts`
- `vintrip/be/docs/evidence/room-upgrades-cp1.md`
- `vintrip/docs/room-upgrades-contract.md`
