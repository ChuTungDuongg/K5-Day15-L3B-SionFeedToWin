# Báo cáo Nghiệm thu Tổng thể C2 Room Upgrades (CP1–CP4) & Kịch bản Demo

- **Tính năng:** VinTrip Hotel Room Upgrades AI Copilot & Staff Approval Portal (`room-upgrades` / `room_upgrades`, case `C2`)
- **Nhánh giao nộp:** `feat/c2-room-upgrade`
- **Model vận hành AI:** OpenAI Responses API `gpt-6-luna` (`reasoning.effort = "low"`, Structured Outputs, tách biệt hoàn toàn với C1/C3 `gpt-4o-mini`)
- **Trạng thái tổng thể:** **ĐẠT NGHIỆM THU CP1–CP4 (SANDBOX)**

## 1. Bảng phân tách trạng thái xác minh (CP1–CP4)

| Hạng mục | Trạng thái | Mức độ xác minh thực tế | Giới hạn / Ranh giới rõ ràng |
|---|---|---|---|
| **CP1 — Deterministic Pricing & Domain Engine** (`vintrip/be/.../room-upgrades`) | Đã triển khai & xác minh | 26 unit tests + 8 HTTP tests + 4 Postgres integration tests (`REPEATABLE READ READ ONLY`), số nguyên VND, tồn toàn kỳ, policy có phiên bản, validator độc lập | Dữ liệu khách sạn/phòng/giá/booking là fixture mô phỏng (`room-upgrades-v1@2026-11-27`, `isMock: true`), không phải PMS thật |
| **CP2 — AI Copilot Workflow (`vintrip/ai`)** | Đã triển khai & xác minh | 70 unit/E2E tests (`pytest`), `ruff`, `pyright` 0 lỗi + chạy trực tiếp OpenAI Responses API `gpt-6-luna` trong E2E, Browser QA và 5 lượt đánh giá 24 ca | Không có tool ghi/duyệt; chỉ xuất `proposalDraft` chỉ đọc; sửa 3 lỗi thực tế trong CP4 (`resolve_benefit_id`, `match_room_type_id` cụm tiện nghi, prompt hạ hạng `ROOM_CHANGE`) |
| **CP3 — HITL Proposal Persistence & Transaction Safety** | Đã triển khai & xác minh | 230 domain tests + 86 HTTP tests + 52 Postgres `SERIALIZABLE`/concurrency/stale/idempotency tests + E2E-1..7 trên PostgreSQL thật | `APPROVED` chỉ duyệt đề xuất báo giá mô phỏng (`operationalEffects: "NONE"`, `requiresHumanApproval: true`); không giữ tồn kho sau commit, không sửa `commerce.orders`/`payments`/`refunds`/`room_inventory` |
| **CP4 — Staff Portal UI & API Client (`vintrip/fe`)** | Đã triển khai & xác minh | 95 tests `@vintrip/api-client` + 273 tests `@vintrip/web` + `oxlint` 0 warning/0 lỗi trên 28 file C2 + Turbopack compile pass + Browser QA thực tế 4 viewport (`1440/1280/768/390px`) | 1 lỗi baseline có sẵn trước CP4 tại `src/features/auth/mobile-google-return.test.ts(2,22)` và 1 lỗi console duplicate key `"Hà Nội"` ở trang chủ khách `/` nằm ngoài phạm vi C2, không sửa code ngoài phạm vi |
| **Đánh giá AI C2 (`eval/room-upgrades/`)** | Đã triển khai & xác minh live | 14 unit tests offline + 5 lượt chạy live `gpt-6-luna` (`run-4` và `run-5` đạt **24/24 — 100%**, tổng chi phí 5 lượt `$0.024013`) | Toàn bộ 24 ca là **synthetic / authored**, tách biệt hoàn toàn khỏi bộ C1 đã khóa (`eval/benchmark.csv`) |
| **Bảo vệ phạm vi C1 & Vận hành** | Đã kiểm chứng | `python run.py check` pass, 0 diff ở C1 locked files, bảng vận hành PostgreSQL không đổi (`0` orders/payments/refunds/held+sold) | Không thay đổi benchmark C1, `spec.md` §7, harness chấm điểm C1 hay model chat C1/C3 |

## 2. Ranh giới Sandbox & Những điều C2 KHÔNG làm

1. Không tự động đổi/chuyển phòng trên PMS hay bảng đặt chỗ vận hành.
2. Không khóa/giữ/trừ tồn phòng trên `commerce.room_inventory`.
3. Không tạo giao dịch thu tiền, hoàn tiền hay cập nhật `commerce.orders` / `commerce.payments` / `commerce.refunds`.
4. Không gửi email/SMS/push thật tới khách hàng (chỉ tạo văn bản gợi ý `draftMessageVi` để lễ tân tự kiểm tra).
5. Không cho phép AI, trình duyệt hay global `superadmin` (khi không có dòng phân công tại khách sạn) vượt qua kiểm soát phân quyền khách sạn trên server.

## 3. Kịch bản Demo trực tiếp (90–120 giây)

**Chuẩn bị trước demo:** Stack local đang chạy (`http://localhost:3100`, Gateway `http://localhost:8080`, Mailpit `http://127.0.0.1:8025`), tài khoản `member@vintrip.local` (Lễ tân) / `superadmin@vintrip.local` (Quản lý) / `moderator@vintrip.local` (chưa phân công), mật khẩu dev `vintrip-dev-123`.

- **0:00–0:20 — Tách biệt quyền & Cổng nhân viên (`/`, `/staff`):**
  - Mở `http://localhost:3100/` khi đăng nhập `member@vintrip.local`, mở menu tài khoản chỉ ra mục `"Cổng nhân viên khách sạn"` (được xác minh từ server `GET /staff-context`, tài khoản không được gán như `moderator@vintrip.local` sẽ không thấy mục này và bị chặn tại `/staff`).
  - Vào `/staff`: chỉ ra banner **Sandbox** cố định, KPI thực từ PostgreSQL (`8` khách đang lưu trú) và hoàn toàn không lẫn header/footer/chat khách hàng.
- **0:20–0:55 — Tra cứu booking & Vini AI Copilot (`/staff/bookings/C2-0001` → `/staff/room-upgrades?booking=C2-0001`):**
  - Mở booking `C2-0001` (`STD`, tiền gốc `1.200.000đ/đêm`), bấm `"Yêu cầu nâng hạng với Vini Copilot"`.
  - Gõ câu tự nhiên: *"Khách booking C2-0001 muốn nâng lên Deluxe hướng vườn từ ngày 2026-11-28 lúc 14:00"*.
  - Giải thích luồng: `gpt-6-luna` trích xuất ý định → Backend CP1 tính và kiểm độc lập **2 đêm × 300.000đ = 600.000đ** (LLM không tự tính tiền) → hiện đầy đủ bảng từng đêm, tồn phòng, trích dẫn chính sách `STAY-UPGRADE v1`.
- **0:55–1:30 — Tạo đề xuất & Duyệt HITL có xác nhận (`/staff/proposals/[id]`):**
  - Bấm `"Tạo đề xuất chờ duyệt"` (kèm `Idempotency-Key` và `previewExpectation` chống lệch giá xem trước).
  - Mở chi tiết đề xuất: chỉ ra `Revision #1`, `Version v1`, `"Tác động vận hành: Không có — mô phỏng"`.
  - Bấm `"Duyệt báo giá"` → chỉ ra modal xác nhận nêu rõ booking, hạng phòng, `600.000đ`, version và cảnh báo không chuyển phòng/thu tiền → xác nhận → hiện đúng thông báo `"Đã duyệt đề xuất báo giá. Chưa thực hiện chuyển phòng hoặc thu tiền."`.
  - Tải lại trang: chứng minh trạng thái `Đã duyệt` và dòng thời gian kiểm toán (`Tạo đề xuất` → `Đã duyệt`) lưu bền vững trên PostgreSQL.
- **1:30–1:55 — An toàn & Kiểm chứng kỹ thuật (nêu ngắn gọn bằng số thực):**
  - Nhấn mạnh: trường hợp vượt thẩm quyền/chênh lệch âm tự định tuyến `MANAGER` (lễ tân bị chặn `403`); nếu giá nguồn đổi trước khi duyệt, giao dịch `SERIALIZABLE` tự chặn `409 REQUOTE_REQUIRED`; 7/7 kịch bản E2E trực tiếp pass; bộ đánh giá 24 ca synthetic trên `gpt-6-luna` đạt **24/24 (100%)** ở 2 lượt độc lập (`run-4`, `run-5`) với chi phí chỉ ~`$0.0047`/lượt.

## 4. Liên kết Bằng chứng Chi tiết

- Hợp đồng đầy đủ CP1–CP4: [room-upgrades-contract.md](../room-upgrades-contract.md)
- Bằng chứng CP1: [room-upgrades-cp1.md](../../be/docs/evidence/room-upgrades-cp1.md)
- Bằng chứng CP2: [room-upgrades-cp2.md](../../ai/docs/evidence/room-upgrades-cp2.md)
- Bằng chứng CP3: [room-upgrades-cp3.md](../../be/docs/evidence/room-upgrades-cp3.md)
- Bằng chứng CP4: [room-upgrades-cp4.md](room-upgrades-cp4.md)
- Bộ đánh giá C2 độc lập: [eval/room-upgrades/README.md](../../../eval/room-upgrades/README.md)
