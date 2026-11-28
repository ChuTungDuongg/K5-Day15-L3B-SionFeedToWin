# Vintrip 3-Stack & Hackathon Contracts (`CONTRACTS.md`)

> Single Source of Truth cho 4 Codex CLI Workers (`BE`, `AI`, `FE`, `Bridge & QA`). Mọi worker PHẢI tuân thủ đúng tên trường, cổng và phạm vi file ở tài liệu này.

---

## 1. Thương hiệu & Linh vật
- **Tên sản phẩm:** **Vintrip** (OTA Du lịch thông minh Việt Nam)
- **Linh vật & Trợ lý AI:** **Vini** — Bé Rái Cá Biển đeo khăn rằn xanh ngọc – vàng Hội An, ba lô du lịch.
- **Tài nguyên thương hiệu FE (`vintrip/fe/apps/web/public/brand/`):**
  - `/brand/vintrip-logo.svg`
  - `/brand/vintrip-logo-white.svg`
  - `/brand/vintrip-mark.svg`
  - `/brand/vini/vini-welcome.png`
  - `/brand/vini/vini-curious.png`
  - `/brand/vini/vini-planning.png`
  - `/brand/vini/vini-success.png`
  - `/brand/vini/vini-rowing.png`
- **Lưu ý kỹ thuật FE:** Giữ nguyên tên gói workspace nội bộ `@vintrip/*` để không gãy `pnpm-lock.yaml` / `turbo`, chỉ đổi 100% bề mặt hiển thị người dùng, SEO, i18n, metadata, logo, linh vật và prompt AI sang **Vintrip** & **Vini**.

---

## 2. Cổng mạng & Định tuyến Docker (`compose.vintrip.yaml`)
- **Web FE (`vintrip/fe`):** `http://localhost:3100` (`NEXT_PUBLIC_API_URL=http://localhost:8080`)
- **Traefik Gateway (`vintrip/be/deploy/traefik/dynamic.yml`):** `http://localhost:8080`
  - `/api/*` → `http://core-api:3000`
  - `/ai/chat` & `/ai/*` → `http://ai-service:8000` (dùng middleware StripPrefix `/ai` nếu FastAPI mount `/chat`, `/health`, `/moderate` tại root `/`)
- **Core API (`vintrip/be`):** `http://localhost:3000` (`GET /health`)
- **AI Service (`vintrip/ai`):** `http://localhost:8000` (`GET /health`, `POST /chat`)

---

## 3. API Mới ở Core API (`vintrip/be`)

### 3.1 `POST /api/commerce/policies/evaluate`
- **Input JSON:**
  ```json
  {
    "policyCode": "FLEX-48H",
    "hotelSlug": "coastal-pearl-da-nang",
    "checkInIso": "2026-12-10T14:00:00+07:00",
    "cancelAtIso": "2026-12-08T10:00:00+07:00",
    "timezone": "Asia/Ho_Chi_Minh",
    "totalVnd": 3200000,
    "nights": 2
  }
  ```
  *(Lưu ý: `checkInIso` hoặc `cancelAtIso` có thể thiếu/rỗng → trả `status: "need_info"` + `missingFields`.)*
- **Output JSON:**
  ```json
  {
    "policyCode": "FLEX-48H",
    "status": "free | partial | non_refundable | need_info",
    "hoursBeforeCheckIn": 52.0,
    "cutoffLocal": "2026-12-08T14:00:00+07:00",
    "feeVnd": 0,
    "refundVnd": 3200000,
    "citations": [
      { "code": "C1", "clause": "Hủy miễn phí trước 48 giờ so với giờ nhận phòng (14:00 giờ địa phương)." }
    ],
    "missingFields": [],
    "summaryVi": "Miễn phí hủy 100%, hoàn lại 3.200.000đ."
  }
  ```

### 3.2 `POST /api/commerce/bookings/draft-change`
- **Input JSON:**
  ```json
  {
    "bookingCode": "VT-2026-8841",
    "currentRoom": "Deluxe City View",
    "targetRoom": "Premier Sea View",
    "nights": 2,
    "guestNote": "Ưu tiên tầng cao"
  }
  ```
- **Output JSON:**
  ```json
  {
    "draftId": "DRAFT-...",
    "bookingCode": "VT-2026-8841",
    "actionType": "ROOM_CHANGE_DRAFT",
    "status": "PENDING_USER_APPROVAL",
    "priceDiffVnd": 900000,
    "requiresConfirmation": true,
    "draftMessageVi": "Kính gửi Bộ phận Đặt phòng...",
    "disclaimer": "Đây chỉ là bản nháp chờ người dùng duyệt. Hệ thống không tự động sửa/hủy đơn hay thu phí."
  }
  ```

---

## 4. Hợp đồng Card SSE (`vintrip/ai` ↔ `vintrip/fe`)

Giữ nguyên toàn bộ cấu trúc `Card` + `CardLine` trong `vintrip/ai/app/services/assistant/schemas.py` và `vintrip/fe/packages/api-client/src/assistant.ts` (`ref`, `id`, `kind`, `title`, `priceFrom`, `priceBasis`, `currency: "VND"`, `observedAt`, `totalPrice`, `lines`, `source`, `actions`), **MỞ RỘNG thêm 3 `kind` mới** mà không phá schema `WireModel`:

1. **`kind: "cancel_policy"`**
   - `title`: Tiêu đề kết quả (vd: `"Chính sách hủy · FLEX-48H (Miễn phí hủy)"`)
   - `priceFrom`: `feeVnd` (hoặc `0` / `null` nếu `need_info`)
   - `totalPrice`: `refundVnd` (số tiền được hoàn)
   - `priceBasis`: `"per_night_per_room"` (hoặc `"unavailable"` nếu `need_info`)
   - `source`: `"Vintrip Policy Engine · [C1]"`
   - `lines`: danh sách chi tiết theo đúng thứ tự đọc:
     - `{ label: "Trạng thái", detail: "Miễn phí hủy | Phí một phần | Không hoàn tiền | Cần bổ sung thông tin" }`
     - `{ label: "Phí hủy", detail: "0đ" }` (hoặc `1.600.000đ`)
     - `{ label: "Hoàn lại dự kiến", detail: "3.200.000đ" }`
     - `{ label: "Mốc giờ địa phương (cutoff)", detail: "14:00 08/12/2026 (+07:00)" }`
     - `{ label: "[C1] Điều khoản trích dẫn", detail: "..." }`
     - *(Nếu thiếu dữ liệu: `{ label: "Thông tin cần bổ sung", detail: "Ngày nhận phòng, thời điểm hủy dự kiến" }`)*

2. **`kind: "approval_draft"`**
   - `title`: `"Bản nháp đổi phòng · CHỜ NGƯỜI DÙNG DUYỆT"`
   - `priceFrom`: `priceDiffVnd` (chênh lệch)
   - `priceBasis`: `"per_night_per_room"`
   - `source`: `"CHỜ NGƯỜI DÙNG DUYỆT · Không tự động gửi"`
   - `lines`:
     - `{ label: "Trạng thái", detail: "CHỜ NGƯỜI DÙNG DUYỆT" }`
     - `{ label: "Thay đổi phòng", detail: "Deluxe City View → Premier Sea View (2 đêm)" }`
     - `{ label: "Chênh lệch ước tính", detail: "+900.000đ" }`
     - `{ label: "Nội dung bản nháp", detail: "Kính gửi Bộ phận Đặt phòng..." }`
     - `{ label: "Lưu ý an toàn", detail: "Vui lòng kiểm tra và tự xác nhận trước khi gửi." }`

3. **`kind: "verified_itinerary"`**
   - `title`: `"Lịch trình Đà Nẵng 2 ngày · 0 xung đột"`
   - `priceFrom`: tổng chi phí ước tính (`estimatedTotalVnd`)
   - `totalPrice`: ngân sách (`budgetVnd`)
   - `priceBasis`: `"estimated_per_person"`
   - `source`: `"Vintrip Verifier · 0 xung đột · Đúng ngân sách"`
   - `lines`: các dòng lịch trình chuẩn tương thích `groupItineraryLines()` (mỗi dòng có `Ngày 1 · Sáng (08:30–11:00) · ... · ~150.000đ`) + dòng tổng kết ngân sách & thời tiết.

---

## 5. Hợp đồng Hackathon Bridge (`codebase/`, `data/`, `tests/`)
- `codebase/agent.py`: `answer(text: str) -> {"output": str}`
- `codebase/ai.py`: `call_model(system: str, user: str) -> {"text": str, "model": str, "tokens_in": int, "tokens_out": int}` (giữ `@model_call`, đọc token thật từ OpenAI `usage`, hỗ trợ `--fake`).
- `codebase/tools.py`: mỗi công cụ có `@tool` và docstring đủ 4 mục (`tên · input · output · có tác động ra ngoài không`).
- **KHÔNG BAO GIỜ SỬA:** `run.py`, `codebase/tracing.py`, `eval/run_eval.py`, `cost/simulate.py`.

## 6. Mở rộng demo C3 trên nhánh vintrip

Theo yêu cầu triển khai C3 ngày 27/11/2026, bổ sung `kind: "flight_disruption"` ngoài ba loại thẻ ở §4. Giữ nguyên hợp đồng `Card`/SSE; thẻ C3 có `priceFrom: null`, `priceBasis: "unavailable"`, `actions: null`, chi tiết phương án và nội dung bản nháp nằm trong `lines`. `source` bắt buộc ghi mô phỏng và không tự động gửi. Giao diện hiển thị qua thẻ thông tin với biểu tượng máy bay.

`trip.pendingFlightDisruption` chỉ chứa `bookingCode`, `action` (`review`, `hold`, `change`, `refund`, `choose`), `targetFlightId`, `arrivalBefore`; không nhận giá hay tồn chỗ từ client. Engine đọc lại snapshot `c3-demo-v1` mỗi lượt. Các yêu cầu giao dịch chỉ tạo bản nháp `PENDING_USER_APPROVAL`; không có API thực thi giao dịch hay thay đổi dữ liệu đặt chỗ. Bridge CLI và AI service dùng chung engine thư viện chuẩn trong `ai/app/services/assistant/skills/c3_engine.py`.

Hướng dẫn, dữ liệu giả, trạng thái và giới hạn: [`docs/c3-flight-disruption.md`](../docs/c3-flight-disruption.md). Đây là demo mở rộng; bộ đánh giá và chuẩn đạt C1 giữ nguyên.

## 7. Room upgrades — lễ tân khách sạn (case C2, CP1–CP4)

- Backend CP1/CP4 (`/api/commerce/room-upgrades`): bắt buộc access token và phân công nhân viên tại đúng khách sạn trên server.
  - `GET /staff-context` (trả `{ hasAccess, assignments[] }` không tạo lỗi 403 cho khách hàng thường), `GET /bookings?hotelId=...`, `GET /bookings/:bookingCode?hotelId=...`, `POST /quotes`.
- AI Copilot CP2 (`POST /ai/room-upgrades/chat` qua Traefik → FastAPI `POST /room-upgrades/chat`):
  - Bắt buộc access token hợp lệ (`401` nếu thiếu/sai), xác minh phân công khách sạn trên Core API trước khi gọi LLM (`403` nếu không được phân công, kể cả global `superadmin`).
  - Dùng trực tiếp OpenAI Responses API (`gpt-6-luna`, `reasoning.effort = "low"`, Structured Outputs); tách biệt khỏi cấu hình chat C1/C3 (`gpt-4o-mini`).
  - Phát sự kiện FinOps `ai.usage.recorded` (`feature: "room_upgrades"`) lên `stream:ai`; `core-api` analytics consumer chấp nhận `room_upgrades`.
  - Trả trường chỉ đọc `proposalDraft` (khớp payload `POST /api/commerce/room-upgrades/proposals` kèm `previewExpectation` và `aiMetadata`); không thêm write/approve tool cho LLM.
- HITL Approval Workflow CP3/CP4 (`/api/commerce/room-upgrades/proposals`):
  - 9 endpoint: `POST /`, `GET /`, `GET /summary`, `GET /:proposalId`, `GET /:proposalId/history`, `POST /:proposalId/revise`, `POST /:proposalId/approve`, `POST /:proposalId/reject`, `POST /:proposalId/escalate`.
  - CORS `core-api` expose thêm `Idempotency-Replayed` để trình duyệt đọc cờ replay; FE gọi `/ai/room-upgrades/chat` với `credentials: 'omit'` (chỉ gửi Bearer JWT).
  - Lưu 4 bảng sandbox (`is_mock = true`): `room_upgrade_proposals`, `room_upgrade_proposal_revisions` (bất biến), `room_upgrade_proposal_audit_events` (append-only), `room_upgrade_proposal_idempotency` (nguyên tử trong transaction).
  - Transaction `SERIALIZABLE` + `FOR UPDATE` + `FOR SHARE` dòng nguồn + CAS `WHERE version AND status` + bounded retry (`40001`/`40P01`/`23505` idempotency PK); kiểm quyền trước replay; tự kiểm stale quote/expiry khi duyệt.
  - `APPROVED` chỉ duyệt nội dung đề xuất báo giá (`operationalEffects: "NONE"`, `requiresHumanApproval: true`); không chuyển phòng, giữ phòng, sửa booking vận hành, giảm tồn kho, thu/hoàn tiền hay gửi thông báo thật.
- Staff Portal CP4 (`vintrip/fe/apps/web/src/app/staff/*` & `vintrip/fe/packages/api-client/src/room-upgrades.ts`):
  - 6 route tách biệt hoàn toàn chrome khách hàng (`robots: noindex, nofollow`): `/staff`, `/staff/bookings`, `/staff/bookings/[bookingCode]`, `/staff/room-upgrades`, `/staff/proposals`, `/staff/proposals/[proposalId]`.
  - Điểm vào `"Cổng nhân viên khách sạn"` trên menu tài khoản chỉ hiển thị khi server `GET /staff-context` trả `hasAccess: true`.
  - Bộ đánh giá C2 độc lập tại `eval/room-upgrades/` (24 ca synthetic, tách biệt hoàn toàn với C1 `eval/benchmark.csv`).
- Hợp đồng chi tiết và hướng dẫn chạy local: [room-upgrades-contract.md](docs/room-upgrades-contract.md).
- Bằng chứng CP4 và nghiệm thu tổng thể CP1–CP4: [evidence CP4](docs/evidence/room-upgrades-cp4.md), [final acceptance](docs/evidence/room-upgrades-final-acceptance.md).
- Endpoint mẫu `/api/commerce/bookings/draft-change` và consumer cũ giữ nguyên để tương thích; không dùng phụ thu mẫu của nó cho room-upgrades.

## 8. C1 · Lập lịch một ngày ở Công viên Mẫu (`vintrip/ai` ↔ `vintrip/fe`)

Frontend (khung lập lịch trên trang chủ `#lich-vui-choi` và trang `/c1`) chỉ phụ thuộc vào hợp đồng này. Backend được đổi cách xử lý bên trong, nhưng giữ nguyên đường dẫn và hình dạng dữ liệu.

**Yêu cầu:** `POST {NEXT_PUBLIC_API_URL}/ai/c1/ask`, `Content-Type: application/json`

```json
{ "text": "Công viên Mẫu, 2 người lớn, bé 5 tuổi cao 108 cm. Đi 09:00–14:00, ngân sách 1.500.000 đồng." }
```

- `text`: chuỗi 1–4000 ký tự sau khi bỏ khoảng trắng hai đầu. Sai thì trả `422`.

**Trả về `200`:**

```json
{
  "output": "VinTrip — ...\nTrạng thái: VALID · snapshot CVM-2026-11-28-v1 · dữ liệu mô phỏng\n...",
  "status": "VALID",
  "snapshot_id": "CVM-2026-11-28-v1",
  "trace": [
    { "kind": "tool", "name": "get_park_catalog", "latency_s": 0.0 },
    { "kind": "model", "name": "call_model", "latency_s": 5.234 }
  ]
}
```

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `output` | string, có xuống dòng `\n` | Câu trả lời đã kiểm, hiển thị nguyên văn (`white-space: pre-wrap`). Frontend không tự tính giờ hay tiền |
| `status` | một trong `VALID`, `NEEDS_INPUT`, `MISSING_DATA`, `INFEASIBLE`, `SEARCH_TIMEOUT`, `TỪ CHỐI`, `CHƯA HỢP LỆ`, `THÔNG TIN` | Nhãn trạng thái. Giá trị lạ thì frontend hiện nhãn trung tính |
| `snapshot_id` | string | Phiên bản dữ liệu mô phỏng |
| `trace` | mảng `{kind: "tool" \| "model", name, latency_s}` | Các bước công cụ và model, theo thứ tự chạy |

**Lỗi:** `422` khi đầu vào sai; `503` khi dịch vụ chưa cài bộ lập lịch C1; `500` khi lời gọi model hỏng (ví dụ khoá API không hợp lệ). Mọi mã khác 200 thì frontend hiện thông báo lỗi kèm nút "Thử lại", không hiện kết quả.

**Thời gian:** một lần gọi model thật mất khoảng 5–10 giây. Frontend phải có trạng thái chờ và không cho gửi trùng.

**CORS:** backend cho phép origin của web (`http://localhost:3100` khi chạy local).
