# Đặc tả làm lại giao diện `vintrip/fe` — tông cam pastel

Tài liệu này là nguồn chuẩn cho các ticket FE-04 → FE-09 trong `docs/tracker/FE-BOARD.md`. Mục 1 do FE-01 làm. Mục 2 trở đi do FE-02 viết (đã xong 28/11).

## 1. Hệ thiết kế (FE-01)

Token nằm ở `vintrip/fe/packages/tokens/src/index.ts` và `tokens.css`. Hai file phải khớp nhau, có test kiểm. **Không viết cứng mã màu trong CSS của trang.** Luôn dùng `var(--color-…)`.

### 1.1 Màu

| Token | Màu | Dùng cho | Chữ đi kèm (tương phản) |
|---|---|---|---|
| `--color-coral` | `#C2560F` cam đậm | Nút chính có chữ trắng, huy hiệu quan trọng | trắng (4.53:1) |
| `--color-coral-soft` | `#FFB98A` cam pastel | Nút phụ, chip đang chọn, điểm nhấn mềm | `--color-coral-ink` (5.65:1) |
| `--color-coral-ink` | `#7A2E0E` nâu | Chữ trên nền pastel, tiêu đề nhấn | trên trắng 9.4:1 |
| `--color-coral-tint` | `#FFE8D6` đào | Nền thẻ nổi bật, ô chọn | `--color-coral-ink` (8.0:1) |
| `--color-teal` | `#A24A1E` đất nung | Màu phụ: đường đi, nút phụ chữ trắng | trắng (5.94:1) |
| `--color-teal-soft` | `#FFE8D6` | Nền nhạt của màu phụ | `--color-teal-ink` (8.0:1) |
| `--color-text` / `--color-navy` / `--color-ink` | `#3D2418` | Chữ chính | trên `#FFF8F2` 13.6:1 |
| `--color-text-muted` | `#8A5A44` | Chữ phụ, mô tả | trên trắng 5.8:1 |
| `--color-text-subtle` | `#A07B68` | Chỉ trang trí, trạng thái vô hiệu. Không dùng cho chữ cần đọc | 3.8:1 |
| `--color-background` | `#FFFFFF` | Nền thẻ, ô nhập | |
| `--color-surface` / `--color-warm-mist` | `#FFF8F2` kem | Nền trang | |
| `--color-surface-muted` / `--color-sea-mist` | `#FFF1E6` / `#FFF4EA` | Nền khối phụ, vùng nhóm | |
| `--color-border` | `#F3DCCB` | Viền | |
| `--color-success` | `#2F7A5F` | Đạt, thành công (chữ hoặc nền chữ trắng) | 5.16:1 |
| `--color-warning` / `--color-sun` | `#FFC978` | Ưu đãi, cảnh báo nhẹ (chữ nâu đậm) | |
| `--color-danger` | `#C2413A` | Lỗi | trắng (5.11:1) |
| `--color-compose-start` → `--color-compose-end` | `#FFB98A` → `#F28A54` | Dải nhấn cho nút tạo bài, chỉ có icon hoặc chữ nâu | |

**Quy tắc:**
- Không đặt chữ trắng trên `--color-coral-soft`, `--color-coral-tint` hay dải compose. Chữ trắng chỉ dùng trên `--color-coral`, `--color-teal`, `--color-success`, `--color-danger`.
- Màu không phải cách duy nhất để báo trạng thái: luôn kèm icon hoặc chữ.

### 1.2 Bo góc, bóng, chữ

- Bo góc: `--radius-sm` 10px (ô nhập, chip) · `--radius-md` 16px (thẻ) · `--radius-lg` 24px (khối lớn, đầu trang) · `--radius-pill` (nút tròn dài).
- Bóng: `--shadow-soft` (thẻ thường) · `--shadow-raised` (thẻ đang di chuột, popup). Bóng tông nâu nhạt, không dùng bóng đen.
- **Phông chữ (28/11, cập nhật trưa theo yêu cầu người dùng):** chữ chính `--font-sans` = **Be Vietnam Pro** (OFL, thiết kế cho tiếng Việt), dự phòng `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif`. Chữ viết tay `--font-script` = **Dancing Script** (OFL, có tiếng Việt), **chỉ** dùng cho chữ "VinTrip" và slogan ở hero, không dùng cho đoạn văn, nút hay ô nhập. `app/layout.tsx` nạp cả hai bằng `next/font/google` (subsets `latin`, `vietnamese`; tự host lúc build) và gắn biến `--font-be-vietnam-pro`, `--font-dancing-script` lên `<html>`. Bỏ Inter và Great Vibes. Tiêu đề dùng `--font-sans`, đậm 700.
- Thang chữ: `--text-xs` 12px · `--text-sm` 14px · `--text-base` 16px (cỡ chữ nội dung tối thiểu) · `--text-lg` 18px · `--text-xl` 22px · `--text-2xl` 28px · `--text-3xl` co giãn 32–52px (tiêu đề đầu trang). Chiều cao dòng 1.5 cho nội dung.

### 1.3 Còn lệch tông sau FE-01 (giao cho ticket trang)

- Trang chủ: lớp phủ hồng đậm ở đầu trang (`ota-hero.module.css`), mặt nước và nền hồng phần gợi ý (`LivingBackground.tsx`, `ota-home-motion.module.css`, `ota-home.module.css`) là mã màu viết cứng. Thuộc FE-05.
- Ảnh linh vật nhỏ ở góc trên phải vẫn là rái cá cũ. Thuộc FE-03.
- Trang chủ hiện "1 Issue" của Next.js ở chế độ dev; `/hotels` không có tham số thì báo "Chuyến đi này chưa có trong danh mục". Kiểm trong FE-05 và FE-06.

---

## Quy ước chung cho mục 2 trở đi (FE-02)

- **Câu chữ:** giữ chữ hiện có (phần lớn nằm ở `packages/i18n`, không ai sửa). Chỉ đổi chữ ở chỗ mục của trang ghi rõ, và chỉ khi chữ đó viết thẳng trong file thuộc vùng của mình. Cần đổi chữ trong `packages/i18n` thì ghi `KẸT`, PM sửa.
- **Mỗi trang có đủ 3 trạng thái:** đang tải (khung giữ chỗ màu `--color-surface-muted`, không để vòng quay giữa trang trống), rỗng (một câu nói rõ chuyện gì đang xảy ra + một nút đi tiếp), lỗi (dùng `ApiErrorNotice` có sẵn ở `features/shared`, chỉ đổi màu qua token).
- **Nút:** nút chính nền `--color-coral` chữ trắng, bo `--radius-pill`, cao ≥ 44px. Nút phụ nền `--color-coral-tint` chữ `--color-coral-ink`. Nút chữ (liên kết) màu `--color-coral-ink`, gạch chân khi di chuột. **Mỗi màn hình chỉ một nút chính.**
- **Thẻ:** nền `--color-background`, viền 1px `--color-border`, bo `--radius-md`, bóng `--shadow-soft`; di chuột đổi sang `--shadow-raised` trong 180ms, không phóng to.
- **Giá tiền:** `--color-coral-ink`, đậm, cỡ `--text-lg` trở lên. Giá gốc gạch ngang dùng `--color-text-muted`. Huy hiệu giảm giá nền `--color-sun` chữ `--color-text`.
- **Chuyển động:** 150–250ms, `ease-out`. Trong `@media (prefers-reduced-motion: reduce)` tắt hết chuyển động trang trí.
- **Mã màu viết cứng còn sót** trong file thuộc vùng của mình: đổi sang token gần nhất trong mục 1.1. Fallback kiểu `var(--color-text, #1e293b)` thì bỏ phần fallback.
- **Không đổi tên class** đang được file ngoài vùng của mình dùng. Đổi màu, khoảng cách thì được.

## 2. FE-03 · Linh vật Vini (Codex)

**Nhân vật:** một chú thú nhỏ nguyên bản kiểu "trinh sát du lịch". Dáng tròn, thấp, đầu to so với thân (tỉ lệ khoảng 1:1,2), mắt to tròn màu nâu có điểm sáng. Lông màu kem `#FFF1E6`, má hồng đào. Đội mũ thám hiểm vành rộng màu cam pastel `#FFB98A`, dây mũ nâu `#7A2E0E`. Đeo ba lô nhỏ có cuộn bản đồ thò ra và ống nhòm đeo cổ. Phong cách 3D mềm như đồ chơi nhựa nhám, ánh sáng ấm chiếu từ trên bên trái, không viền đen.

**Không được có:** mũ hay đặc điểm của nhân vật có sẵn (Teemo hay bất kỳ nhân vật nào khác), ống thổi, nấm, vũ khí, chữ hay logo trên ảnh.

> **Cập nhật 28/11:** người dùng quyết định dùng Teemo cho bài làm trong trường (xem `public/brand/vini/README.md`). Brief nhân vật nguyên bản ở trên giữ lại để dùng khi đưa VinTrip ra ngoài phạm vi lớp học.

**6 tư thế:** PNG nền trong suốt, vuông 1024×1024, nhân vật chiếm khoảng 80% khung. Cả 6 ảnh cùng góc máy 3/4 và cùng ánh sáng.

| File (giữ tên cũ) | Tư thế | Dùng ở |
|---|---|---|
| `vini-welcome.png` | vẫy tay chào, cười | trang chủ, đăng nhập |
| `vini-curious.png` | nghiêng đầu, cầm ống nhòm nhìn | trạng thái rỗng, tìm kiếm |
| `vini-planning.png` | cầm bản đồ mở và bút chì | trợ lý, lịch trình |
| `vini-guide.png` | đứng thẳng, một tay chỉ sang phải | hướng dẫn, gợi ý |
| `vini-success.png` | nhảy lên, hai tay giơ cao | đặt chỗ thành công |
| `vini-sad.png` (**mới**) | ngồi, mũ hơi lệch, mắt buồn nhưng không khóc | trang lỗi, 404 |

- Tạo bằng công cụ tạo ảnh của Codex. Không đọc, không in `.env`.
- Thay ảnh vào `vintrip/fe/apps/web/public/brand/vini/`. Thêm `vini-sad.png` và dùng ảnh này trong `app/not-found.tsx`.
- Ảnh `tripi-*.png` cũ trong `public/brand/`: tìm xem còn chỗ nào dùng. Còn thì đổi sang ảnh `vini-*` tương ứng; không còn thì xoá.
- Mỗi ảnh ≤ 400KB (nén PNG).

**Nghiệm thu:**
- Đặt 6 ảnh cạnh nhau nhìn ra ngay là cùng một nhân vật.
- Nền trong suốt thật: không có ô caro vẽ sẵn, không còn viền trắng.
- Trang chủ và trang 404 hiện ảnh mới.

## 3. FE-04 · Khung chung (Codex)

**Mục tiêu người dùng:** ở trang nào cũng biết mình đang ở đâu, và về được khách sạn, vé máy bay, cảm hứng, giỏ hàng, tài khoản chỉ với một lần bấm.

**Thanh đầu trang (máy tính, ≥ 1024px):**
- Cao 72px. Nền `--color-background` độ mờ 85% với `backdrop-filter: blur(12px)`, viền dưới 1px `--color-border`. Khi cuộn xuống chỉ thêm `--shadow-soft`, không đổi màu.
- Bên trái là logo `vintrip-logo.svg`. Ở giữa: Khách sạn · Vé máy bay · Cảm hứng. Bên phải: giỏ hàng (icon kèm số) và tài khoản.
- Mục đang mở: chữ `--color-coral-ink` đậm, gạch dưới 3px `--color-coral` bo tròn. Mục thường: `--color-text`. Khi di chuột: nền `--color-coral-tint`, bo `--radius-pill`.
- `globals.css` dòng 625–636 đang đặt chữ `#fff`. Kiểm màu nền phía sau: nếu là `--color-coral` hoặc `--color-teal` thì giữ chữ trắng; nếu là nền nhạt thì đổi chữ sang `--color-coral-ink`.

**Điện thoại (< 1024px):**
- Thanh đầu trang cao 56px: logo bên trái, giỏ hàng bên phải. Giữ hành vi tự ẩn của `header-auto-hide`.
- Thanh điều hướng dưới (`mobile-tab-bar`):
  - Tối đa 5 mục. Mỗi mục có icon và chữ cỡ `--text-xs`, vùng bấm ≥ 44px.
  - Mục đang chọn: icon và chữ màu `--color-coral-ink`, phía sau icon có nền viên thuốc `--color-coral-tint`.
  - Thanh nền trắng, viền trên `--color-border`, chừa khoảng `env(safe-area-inset-bottom)`.

**Chân trang** (`ota-footer.tsx`):
- Nền `--color-surface-muted`, chữ `--color-text`. Liên kết màu `--color-text-muted`, khi di chuột đổi sang `--color-coral-ink`.
- Máy tính chia 3–4 cột; điện thoại xếp chồng.
- Giữ nguyên các liên kết pháp lý.

**Toàn trang:**
- **Phông chữ (theo mục 1.2):**
  - Trong `globals.css`, thay hai `@font-face` 'Be Vietnam Pro' bằng `@font-face` 'Inter' trỏ tới file Inter bản variable (OFL, tải từ trang chính thức rsms/inter), lưu ở `public/brand/fonts/`, có đủ tiếng Việt, `font-weight: 100 900`, `font-display: swap`.
  - Xoá dòng `@import` Google Fonts Playfair Display.
  - Các chỗ `font-family: 'Playfair Display'` trong vùng Codex (`ota-hero.module.css`, `coming-soon.module.css`) đổi sang `var(--font-sans)`, đậm 700, `letter-spacing: -0.02em`.
  - Xoá `regular.ttf`, `bold.ttf` nếu không còn chỗ nào dùng.
  - Kiểm: trên Windows, chữ có dấu (ví dụ "Đà Lạt, Huế, Phú Quốc") hiện bằng Inter, không rơi về phông khác.
- `body` dùng nền `--color-surface`.
- Vòng focus chung cho mọi phần tử bấm được: `outline: 3px solid var(--color-coral); outline-offset: 2px`. Đặt một lần trong `globals.css`.

**Trang 404** (`not-found.tsx`): ảnh `vini-sad.png` cao 200px, tiêu đề "Không tìm thấy trang này", một câu phụ, nút chính "Về trang chủ".

**Bỏ đi:** mọi dải màu đậm hay lớp phủ tối trên thanh đầu trang.

## 4. FE-05 · Trang chủ và kết quả tìm khách sạn (Codex)

> Trang kết quả `/search` dùng chung ô tìm kiếm và `live-search-screen.tsx` với trang chủ, nên thuộc FE-05, không thuộc FE-06.

**Mục tiêu người dùng:** trong 5 giây hiểu VinTrip giúp được gì, và bắt đầu tìm khách sạn hoặc vé ngay ở màn hình đầu tiên.

**Đầu trang (hero):**
- Nền là ảnh thật (giữ ảnh hiện có, ví dụ `hero-layered-v1/ha-long-*.webp`), bo `--radius-lg`.
- Lớp phủ **nhạt** từ dưới lên: `linear-gradient(to top, var(--color-overlay), transparent 60%)`. Bỏ lớp phủ hồng đậm trong `ota-hero.module.css`.
- Tiêu đề cỡ `--text-3xl`, chữ trắng, đặt trên phần có lớp phủ. Đo tương phản ở vùng ảnh sáng nhất. Chưa đạt 4.5:1 thì phần ngay dưới chữ dùng `--color-overlay-heavy`.
- Ảnh `vini-welcome.png` cao khoảng 160px ở góc phải dưới trên máy tính. Ẩn trên màn hình < 640px. Không được che ô tìm kiếm.

**Ô tìm kiếm:**
- Thẻ trắng nổi đè lên mép dưới hero, bo `--radius-lg`, bóng `--shadow-raised`.
- Tab Khách sạn / Vé máy bay. Tab đang chọn: nền `--color-coral-soft`, chữ `--color-coral-ink`.
- Mỗi ô nhập có nhãn hiện rõ phía trên. Không dùng placeholder thay cho nhãn.
- Nút "Tìm" là nút chính. Trên điện thoại nút rộng hết hàng.

**Khối gợi ý:**
- Thẻ điểm đến xếp lưới: máy tính 4 cột, tablet 2 cột, điện thoại cuộn ngang có điểm dừng (scroll-snap).
- Mỗi thẻ: ảnh tỉ lệ 4:3, tên điểm đến, giá "từ …".
- Nền các khối xen kẽ `--color-surface` và `--color-surface-muted`.

**Bỏ đi:**
- Mặt nước động nhiều lớp (`LivingBackground.tsx`, `ota-home-motion`). Nếu muốn giữ chuyển động thì chỉ một lớp sóng nhẹ màu `--color-coral-tint`, tắt hẳn khi `prefers-reduced-motion`.
- Mọi mã màu viết cứng trong `ota-home*.module.css`, `ota-hero.module.css`, `LivingBackground.tsx`: đổi sang token.

**Trang `/search` (danh sách khách sạn):**
- Máy tính: cột lọc bên trái rộng 280px, dính khi cuộn; danh sách bên phải. Điện thoại: nút "Bộ lọc" mở tấm trượt từ dưới lên (`booking-sheet`).
- Thẻ khách sạn nằm ngang:
  - Bên trái: ảnh 240px, bo `--radius-md`.
  - Ở giữa: tên, sao (`--color-sun`), khu vực, điểm đánh giá.
  - Bên phải: giá và nút phụ "Xem phòng".
  - Trên điện thoại: ảnh ở trên, chữ ở dưới.
- Không có kết quả: ảnh `vini-curious.png` cao 140px, dòng "Chưa có khách sạn khớp bộ lọc", nút phụ "Xoá bộ lọc".
- Vào `/hotels` hoặc `/search` không có tham số hiện đang báo "Chuyến đi này chưa có trong danh mục". Phải đổi thành trạng thái rỗng thân thiện kèm gợi ý điểm đến, không trình bày như lỗi.
- `app/search/page.tsx` đang dùng một class banner trong `flights.module.css` (vùng của Antigravity). Không sửa file đó. Cần đổi banner thì chép class sang `hotel-listing.module.css`.

**Nghiệm thu thêm:**
- Ảnh màn hình đầu trang chủ ở 1440px và 390px: thấy ô tìm kiếm mà không cần cuộn.
- Huy hiệu "1 Issue" của Next.js không còn. Mở xem đó là lỗi gì: nằm trong vùng của Codex thì sửa, nằm ngoài vùng thì ghi `KẸT`.

## 5. FE-06 · Trang chi tiết khách sạn (Antigravity)

**Phạm vi:** `/hotels/[id]`, gồm `hotel-screen.tsx`, `hotel-gallery.tsx`, `hotel-reviews.tsx`, `guest-picker.tsx`, `hotel.module.css`. File `hotel.module.css` đã hết mã màu viết cứng, nên việc chính là bố cục và dùng token cho đúng mục 1.

**Mục tiêu người dùng:** xem nhanh khách sạn có hợp không (ảnh, vị trí, đánh giá), rồi chọn được phòng và giá mà không bị lạc.

**Bố cục máy tính (≥ 1024px), từ trên xuống:**
1. **Nút quay lại:** liên kết chữ có icon mũi tên.
2. **Bộ ảnh:**
   - Lưới gồm 1 ảnh lớn bên trái và 4 ảnh nhỏ bên phải, bo `--radius-lg` ở bốn góc ngoài.
   - Nút phụ "Xem tất cả ảnh" ở góc phải dưới.
3. **Hàng tiêu đề:**
   - Bên trái: tên khách sạn cỡ `--text-2xl`, sao, địa chỉ màu `--color-text-muted`.
   - Bên phải: hộp giá "từ … /đêm" và nút chính "Chọn phòng" (bấm thì cuộn tới `#rooms`).
4. **Thanh mục** (`sectionNav`):
   - Dính ngay dưới thanh đầu trang khi cuộn.
   - Các mục: Tổng quan · Phòng · Tiện nghi · Chính sách · Đánh giá.
   - Mục đang xem có gạch dưới `--color-coral`.
5. **Tổng quan:** chia 2 cột.
   - Cột trái: giới thiệu và điểm nổi bật. Mỗi điểm nổi bật một dòng, icon tick `--color-success` kèm chữ.
   - Cột phải: thẻ "Gần đây" và giờ nhận/trả phòng.
6. **Phòng** (`#rooms`): mỗi phòng một thẻ.
   - Đầu thẻ: ảnh phòng, tên, diện tích, giường, số khách.
   - Dưới đó là danh sách giá (`rate`), mỗi giá một hàng gồm chính sách huỷ, bữa sáng, giá và nút.
   - Miễn phí huỷ: chữ `--color-success` kèm icon. Không hoàn tiền: chữ `--color-text-muted`.
   - Giá rẻ nhất của phòng có nhãn nhỏ "Giá tốt", nền `--color-sun`.
   - Nút đặt (`book-rate-button` trong `features/checkout`, cũng thuộc Antigravity) là nút chính.
7. **Tiện nghi:** lưới 3 cột theo nhóm, icon màu `--color-coral-ink`.
8. **Chính sách:** danh sách đặt trong khối nền `--color-surface-muted`, bo `--radius-md`.
9. **Đánh giá:**
   - Điểm tổng ghi to trong ô vuông nền `--color-coral` chữ trắng, chữ xếp loại đặt bên cạnh.
   - Bên dưới là các thẻ đánh giá chia 2 cột.

**Điện thoại (< 768px):**
- Bộ ảnh thành băng cuộn ngang có điểm dừng (scroll-snap) và số thứ tự kiểu "1/12".
- Hộp giá và nút "Chọn phòng" thành **thanh dính đáy màn hình**: cao 64px, nền trắng, viền trên.
- Mọi lưới về 1 cột. Thanh mục cuộn ngang được.

**Trạng thái:**
- Đang tải: `skeleton` cho bộ ảnh, 3 dòng chữ và 2 thẻ phòng.
- Không tìm thấy (`copy.notFound`): ảnh `vini-curious.png`, tiêu đề, nút chính "Tìm khách sạn khác" (về `/search`).
- Hết phòng: thẻ phòng đổi sang màu `--color-text-muted`. Nút đổi thành chữ "Hết phòng", không bấm được, có `aria-disabled`.

**Bộ chọn khách** (`guest-picker`):
- Nút +/− tròn 44px, viền `--color-border`, con số ở giữa.
- Nút bị chặn (đã chạm tối thiểu hoặc tối đa) dùng màu `--color-text-subtle`.

**Giữ nguyên:** toàn bộ luồng chọn phòng, tham số URL, lời gọi API.

**Bỏ đi:** mọi bóng đen, viền xám lạnh.

## 6. FE-07 · Vé máy bay (Antigravity)

**Phạm vi:** `/flights`, `/flights/[id]` và toàn bộ `features/flights/**`.

**`flights.module.css` có 49 mã hex và 25 `rgba()` viết cứng, phần lớn là tông xanh ngọc cũ (`#dce9e6`, `#cfe5e0`, `#e3ebe9`…). Phải đổi hết sang token.** Gợi ý quy đổi:

| Màu cũ | Token mới |
|---|---|
| nền xanh nhạt | `--color-surface-muted` hoặc `--color-coral-tint` |
| viền xanh xám | `--color-border` |
| chữ xanh đậm | `--color-text` hoặc `--color-coral-ink` |
| bóng `rgba()` | `--shadow-soft` hoặc `--shadow-raised` |

> `app/search/page.tsx` (vùng Codex) có dùng một class banner trong `flights.module.css`. Không đổi tên class nào mà file ngoài vùng đang dùng. Đổi màu thì được.

**Mục tiêu người dùng:** tìm chuyến bay, so nhanh giờ bay và giá, chọn chuyến đi (và chuyến về).

**Trang tìm kiếm `/flights`:**
- Banner (`flight-banner`): ảnh `flight-sky.jpg` bo `--radius-lg`, lớp phủ nhạt giống hero trang chủ. Form tìm (`flight-search-form`) là thẻ trắng nổi đè lên mép dưới banner.
- Form:
  - Chọn một chiều / khứ hồi bằng nút phân đoạn. Lựa chọn đang bật: nền `--color-coral-soft`, chữ `--color-coral-ink`.
  - Ô điểm đi và ô điểm đến, ở giữa có nút đổi chiều tròn 44px.
  - Tiếp theo là ngày, hành khách, rồi nút chính "Tìm chuyến bay".
- Các bảng chọn (`airport-picker`, `date-picker`, `passenger-picker`):
  - Nền trắng, `--shadow-raised`, bo `--radius-md`. Mục đang chọn nền `--color-coral-tint`.
  - Ngày đã chọn: hình tròn nền `--color-coral`, chữ trắng.
  - Các ngày nằm giữa ngày đi và ngày về: nền `--color-coral-tint`.

**Kết quả** (`flight-results`):
- **Băng ngày** (`flight-date-strip`):
  - Cuộn ngang, mỗi ô ghi ngày và giá thấp nhất của ngày đó.
  - Ngày đang chọn: nền `--color-coral-soft`, chữ `--color-coral-ink` đậm.
  - Ngày rẻ nhất cả băng: thêm chấm `--color-success` và chữ "rẻ nhất".
- **Thẻ chuyến bay**, nằm ngang, từ trái sang phải:
  - Logo hoặc tên hãng.
  - Giờ cất cánh cỡ `--text-xl`, đậm.
  - Đường kẻ có icon máy bay, thời gian bay ở giữa; dưới đường kẻ ghi bằng chữ "Bay thẳng" hoặc số điểm dừng.
  - Giờ hạ cánh.
  - Giá màu `--color-coral-ink`.
  - Nút chính "Chọn".
- **Khứ hồi** (`roundSummary`): thẻ tóm tắt chuyến đi đã chọn nằm phía trên, có liên kết "Đổi chuyến".
- **Không có chuyến:** ảnh `vini-curious.png`, dòng "Không có chuyến bay ngày này", gợi ý chọn ngày khác trên băng ngày.

**Trang chi tiết `/flights/[id]`** (`flight-detail`):
- Hành trình hiển thị theo dòng thời gian dọc: mỗi sân bay một chấm `--color-coral`, đường nối màu `--color-border`.
- Hành lý và điều kiện vé: danh sách có icon.
- Cuối trang: tổng tiền và nút chính để tiếp tục. Trên điện thoại, phần này thành thanh dính đáy.

**Điện thoại:** form xếp dọc. Thẻ chuyến bay chia 2 hàng: giờ bay ở hàng trên; hãng, giá và nút ở hàng dưới.

## 7. FE-08 · Cảm hứng (Codex)

**Phạm vi:** `/inspiration`, `/trip-plans/[postId]`, `/trips`, `/u/*`, `features/social/**`, `features/notifications/**`, `features/onboarding/**`.

**Mục tiêu người dùng:** lướt xem ý tưởng chuyến đi của người khác, lưu lại hoặc dùng lại lịch trình.

- **Bảng tin:**
  - Lưới xếp gạch (masonry): máy tính 3 cột, điện thoại 2 cột.
  - Mỗi thẻ bài gồm ảnh bo `--radius-md`, tiêu đề tối đa 2 dòng, ảnh đại diện và tên tác giả (màu `--color-text-muted`), nút lưu hình trái tim 44px.
  - Bài đã lưu: trái tim tô đặc màu `--color-coral`.
- **Thanh lọc chủ đề:** các chip cuộn ngang. Chip đang chọn: nền `--color-coral-soft`, chữ `--color-coral-ink`. Chip thường: viền `--color-border`.
- **Nút tạo bài:**
  - Nút tròn nổi ở góc phải dưới, nền dải màu `--color-compose-start` → `--color-compose-end`.
  - **Icon màu `--color-coral-ink`, không dùng màu trắng.** Bóng `--color-compose-icon-shadow`.
  - Trên điện thoại đặt cao hơn thanh điều hướng dưới.
- **Reels:** khung tỉ lệ 9:16. Chữ trắng chỉ đặt trên lớp phủ `--color-overlay-heavy`.
- **Lịch trình mẫu** (`/trip-plans/[postId]`):
  - Dòng thời gian chia theo ngày, mỗi ngày một thẻ.
  - Mỗi điểm đến một dòng: giờ (đậm), tên, ghi chú màu `--color-text-muted`.
  - Nút chính "Dùng lịch trình này".
- **Hồ sơ** (`/u/*`):
  - Ảnh bìa màu nhạt `--color-coral-tint`. Ảnh đại diện tròn 96px, viền trắng 4px.
  - Số liệu (bài viết, người theo dõi) xếp hàng ngang. Lưới bài viết ở bên dưới.
- **Thông báo:** dạng danh sách. Mục chưa đọc có nền `--color-coral-tint` và chấm `--color-coral`.
- **Không có nội dung:** ảnh `vini-guide.png`, dòng "Chưa có bài nào", nút chính hợp với ngữ cảnh.

## 8. FE-09 · Trợ lý, giỏ hàng, thanh toán, đặt chỗ, tài khoản, đăng nhập (Antigravity)

Làm theo thứ tự 8.1 → 8.6. Có thể chia thành nhiều commit `[FE-09]`.

### 8.1 Trợ lý Vini (`features/assistant/**`)

- `assistant.module.css` có 10 mã hex viết cứng (khoảng dòng 914–981): các cặp nền/chữ xanh, vàng, đỏ cho nhãn trạng thái. Đổi theo ý nghĩa:

  | Nhãn | Nền | Chữ |
  |---|---|---|
  | thông tin | `--color-surface-muted` | `--color-text` |
  | đạt | `--color-coral-tint` | `--color-success`, kèm icon tick |
  | cảnh báo | `--color-sun-soft` | `--color-text` |
  | lỗi | `--color-coral-tint` | `--color-danger`, kèm icon |

- **Nút mở trợ lý:** tròn 56px, nền `--color-coral`, bên trong là ảnh `vini-planning.png` cắt tròn hoặc icon trắng. Trên điện thoại đặt cao hơn thanh điều hướng dưới.
- **Khung chat:**
  - Máy tính: bảng nổi 400×600px ở góc phải dưới, bo `--radius-lg`, `--shadow-raised`. Điện thoại: toàn màn hình.
  - Tin của người dùng: nền `--color-coral-soft`, chữ `--color-coral-ink`, căn phải.
  - Tin của Vini: nền `--color-background`, viền `--color-border`, căn trái, kèm ảnh đại diện Vini nhỏ.
  - Ô nhập dính đáy khung, nút gửi 44px.
- **Thẻ gợi ý** (`assistant-cards`): dùng kiểu thẻ chung trong phần quy ước.

### 8.2 Giỏ hàng (`/cart`, `cart-screen`, `cart-bar`, `cart-warnings`)

- **Máy tính:** chia 2 cột.
  - Cột trái: danh sách mục. Mỗi mục một thẻ gồm ảnh, tên, ngày, số khách, giá, nút xoá chữ `--color-danger`.
  - Cột phải: thẻ tóm tắt dính khi cuộn: tạm tính, thuế phí, **tổng** cỡ `--text-xl` màu `--color-coral-ink`, nút chính "Thanh toán".
- **Điện thoại:** tổng tiền và nút thành thanh dính đáy (`cart-bar`).
- **Cảnh báo** (`cart-warnings`, ví dụ giá đổi, hết phòng): nền `--color-sun-soft`, có icon, chữ `--color-text`. Không báo chỉ bằng màu.
- **Giỏ trống:** ảnh `vini-curious.png`, dòng "Giỏ hàng đang trống", nút chính "Tìm khách sạn".

### 8.3 Thanh toán (`/checkout/[id]`, `checkout-screen`, `checkout-form`, `checkout-error`, `/payments/vnpay/return`)

- **Thanh bước** trên cùng: Thông tin → Thanh toán → Xong. Bước hiện tại: chấm `--color-coral` và chữ đậm. Bước đã qua: tick `--color-success`.
- **Form:**
  - 1 cột, nhãn nằm trên ô.
  - Lỗi hiện ngay dưới ô (chữ `--color-danger` kèm icon); ô bị lỗi có viền `--color-danger`.
  - Ô nhập cao ≥ 44px, bo `--radius-sm`, khi focus viền `--color-coral`.
- **Thẻ tóm tắt đơn:** nằm bên phải trên máy tính, gập lại ở trên cùng trên điện thoại.
- **Nút chính** ghi rõ số tiền, ví dụ "Thanh toán 1.370.000đ". Khi đang gửi: hiện `BusyLabel` và khoá nút. **Không đổi luồng VNPay.**
- **Trang kết quả VNPay:**
  - Thành công: ảnh `vini-success.png`, mã đơn, nút chính "Xem đặt chỗ".
  - Thất bại: ảnh `vini-sad.png`, lý do, nút chính "Thử lại".

### 8.4 Đặt chỗ (`/bookings`, `bookings-screen`, `cancel-order`)

- **Tab** kiểu nút phân đoạn: Sắp tới · Đã qua · Đã huỷ.
- **Thẻ đơn:** ảnh, tên, ngày, mã đơn và nhãn trạng thái (luôn có chữ, không chỉ màu):

  | Trạng thái | Màu nhãn |
  |---|---|
  | đã xác nhận | `--color-success` |
  | chờ thanh toán | nền `--color-sun`, chữ `--color-text` |
  | đã huỷ | `--color-text-muted` |

- **Huỷ đơn:** hộp xác nhận. Nút "Huỷ đặt chỗ" nền `--color-danger` chữ trắng; nút "Giữ lại" là nút phụ.
- **Chưa có đơn:** ảnh `vini-guide.png`, dòng "Bạn chưa có chuyến nào", nút chính "Tìm khách sạn".

### 8.5 Tài khoản (`/account`, `account-profile`, `account-security`, `avatar-editor`, `travel-preferences`, `date-of-birth-select`)

- **Bố cục:** máy tính có menu bên trái (Hồ sơ · Bảo mật · Sở thích du lịch), nội dung bên phải đặt trong thẻ. Điện thoại: menu thành tab cuộn ngang.
- **Ảnh đại diện:** tròn 96px, nút phụ "Đổi ảnh".
- **Sở thích du lịch:** chip chọn được nhiều. Chip đang chọn: nền `--color-coral-soft`, chữ `--color-coral-ink`, kèm icon tick.
- **Lưu thành công:** thông báo nhỏ (toast) nền `--color-success` chữ trắng, tự ẩn sau 3 giây, có `role="status"`.
- `/account/moderation`: chỉ đổi màu qua token, giữ bố cục.

### 8.6 Đăng nhập, đăng ký (`app/(auth)/**`, `auth-shell`, `auth-split-frame`, `login-form`, `register-form`, `forgot-password`, `reset-password`, `verify-email`)

- **Máy tính:** khung chia đôi (`auth-split-frame`).
  - Nửa trái: ảnh du lịch, lớp phủ nhạt, ảnh `vini-welcome.png` và một câu chào.
  - Nửa phải: form trong thẻ trắng, rộng tối đa 420px.
- **Điện thoại:** chỉ có form; ảnh thu thành dải 120px ở trên cùng.
- **Nút Google** (`google-button`): nền trắng, viền `--color-border`, logo `google-g.svg` giữ màu gốc. Phía dưới là đường kẻ chữ "hoặc".
- **Nút chính** "Đăng nhập" / "Tạo tài khoản" rộng hết thẻ. Liên kết "Quên mật khẩu?" màu `--color-coral-ink`.
- **Ô mật khẩu:** nút hiện/ẩn 44px, có `aria-label`.
- **Không đổi** logic đăng nhập, xác thực email hay đăng nhập Google.

**Nghiệm thu FE-09:** ảnh chụp ở 1440px và 390px cho từng nhóm 8.1–8.6. Trang nào không vào được vì cần đăng nhập hoặc cần backend thì chụp trạng thái đang tải, rỗng hoặc lỗi của trang đó, và ghi rõ lý do.
