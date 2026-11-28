# Tài liệu bàn giao: Nâng cấp thẩm mỹ `vintrip/fe`, đổi font (`Dancing Script` + `Be Vietnam Pro`) & đổi toàn bộ slogan

> **Mục đích:** Bàn giao toàn bộ các vấn đề thị giác, bố cục, tiểu tiết cần xử lý trên `vintrip/fe` (đối chiếu từ commit `f951139` trên nhánh `vintrip` với bản tham chiếu `tripflix-fe`), đồng thời áp dụng hai thay đổi bắt buộc: **đổi hệ font sang `Be Vietnam Pro` + `Dancing Script`** và **thay mới toàn bộ slogan / tagline**.
>
> **Nguyên tắc thực hiện:**
> - Giữ bản sắc riêng tông cam ấm của **VinTrip** (không quay lại màu xanh ngọc hay hiệu ứng mặt nước canvas của TripFlix), nhưng khôi phục **chiều sâu, tương phản, nhịp điệu bố cục và độ tinh xảo ở từng tiểu tiết** ngang tầm bản tham chiếu.
> - **Lưu ý phân quyền:** Theo `docs/tracker/FE-BOARD.md`, `vintrip/fe/packages/i18n/**` và `vintrip/fe/packages/tokens/**` hiện nằm trong vùng do PM quản lý. Người thực hiện cần PM xác nhận mở khóa trước khi sửa các file trong `packages/i18n` và `packages/tokens`.

---

## 1. Yêu cầu mới bắt buộc

### 1.1. Đổi hệ font sang `Be Vietnam Pro` + `Dancing Script`

Hiện tại `vintrip/fe` đã bỏ `Be Vietnam Pro` và `Playfair Display`, chỉ dùng 1 bộ `Inter` (`vintrip/fe/apps/web/public/brand/fonts/InterVariable.woff2`) cho cả tiêu đề lẫn nội dung (`vintrip/fe/apps/web/src/features/shell/fe-shell.css` dòng 4–8; `vintrip/fe/packages/tokens/src/tokens.css` dòng 47). Điều này khiến tiêu đề mất cá tính và thiếu tương phản kiểu chữ.

#### Cấu hình nạp font khuyến nghị
1. **Nạp bằng `next/font/google` trong `vintrip/fe/apps/web/src/app/layout.tsx`** (hoặc tự lưu `.woff2` nếu môi trường không ra internet khi build, lưu ý `public/brand/regular.ttf` và `public/brand/bold.ttf` của `Be Vietnam Pro` vốn đã tồn tại trong repo):
   - `Be_Vietnam_Pro`: `subsets: ['vietnamese', 'latin']`, `weight: ['400', '500', '600', '700', '800']`, `display: 'swap'`, `variable: '--font-sans'`.
   - `Dancing_Script`: `subsets: ['vietnamese', 'latin']`, `weight: ['600', '700']`, `display: 'swap'`, `variable: '--font-script'`.
   - Gắn cả hai biến CSS (`${beVietnamPro.variable} ${dancingScript.variable}`) vào thẻ `<html>` trong `layout.tsx`.
2. **Cập nhật token & CSS toàn trang:**
   - `vintrip/fe/packages/tokens/src/index.ts` và `vintrip/fe/packages/tokens/src/tokens.css` (hai file phải khớp nhau để `tokens.test.ts` pass):
     - `--font-sans`: `var(--font-be-vietnam-pro, "Be Vietnam Pro"), "Segoe UI", system-ui, sans-serif;`
     - Thêm `--font-script`: `var(--font-dancing-script, "Dancing Script"), cursive;`
   - `vintrip/fe/apps/web/src/app/globals.css`: bỏ `@font-face` trỏ tới `/brand/fonts/InterVariable.woff2` (nếu chuyển sang `next/font/google` hoặc trỏ về `Be Vietnam Pro`), dọn file font không còn dùng sau khi kiểm tra không còn tham chiếu.
   - `vintrip/fe/apps/web/src/features/shell/fe-shell.css`: giữ `font-family: var(--font-sans)` cho `body` và tiêu đề `h1, h2, h3`, điều chỉnh tracking tiêu đề lớn mượt hơn (`letter-spacing: -0.03em` đến `-0.045em` cho `h1`/`h2`).

#### Quy tắc sử dụng cặp font `Be Vietnam Pro` + `Dancing Script`
| Thành phần | Font | Cỡ & Độ đậm | Ghi chú |
|---|---|---|---|
| **Body, label, nút, form, bảng, điều hướng** | `Be Vietnam Pro` (`--font-sans`) | `14px–16px`, weight `400–600` | Dấu tiếng Việt rõ ràng, khoảng dòng `1.5–1.6`. |
| **Tiêu đề chính (`h1`, `h2`, `h3`)** | `Be Vietnam Pro` (`--font-sans`) | Weight `700–800` | `letter-spacing: -0.03em` (Hero `-0.045em`). |
| **Vế 2 slogan trên Hero** | `Dancing Script` (`--font-script`) | `1.12em–1.2em` so với vế 1, weight `700` | Bố cục 2 dòng như TripFlix: dòng 1 đậm thẳng (`Be Vietnam Pro`), dòng 2 bay bổng (`Dancing Script`), tạo điểm nhấn tạp chí du lịch. Không `italic` thêm vì `Dancing Script` đã có độ nghiêng tự nhiên. |
| **Tên điểm đến trên Tấm vé (`HomeStayPreview`)** | `Dancing Script` (`--font-script`) | `clamp(28px, 2.8vw, 38px)`, weight `700` | Thay cho font thường trong `.stayDestinationBadge` (`ota-home-previews.tsx` dòng 80), màu `--color-coral` hoặc `--color-coral-ink`. |
| **Chú thích ảnh Postcard (`tripiBanner` & `footerTag`)** | `Dancing Script` (`--font-script`) | `15px–18px`, weight `600` | Đặt dưới ảnh polaroid (`Hồ Ngọc Trai`, `Ocean City`) để ra đúng chất sổ tay hành trình. |
| **Câu chào khung Auth (`auth-split-frame`)** | `Be Vietnam Pro` + `Dancing Script` | Vế 1 sans đậm + vế 2 script | Đồng bộ với Hero trang chủ. |
| **CẤM dùng `Dancing Script` ở:** | — | — | Giá tiền, số liệu bảng, nút CTA chính, ô nhập liệu, mô tả dài (> 6 chữ), nhãn nhỏ < 14px. |

> **Lưu ý kiểm tra dấu tiếng Việt:** `Dancing Script` bản có `vietnamese` subset hỗ trợ đầy đủ dấu tiếng Việt, nhưng nét móc chữ hoa và chữ có dấu chồng (`ể`, `ộ`, `ưỡ`) khá cao — cần đặt `line-height: 1.25–1.35` và `padding-block: 0.08em` ở vế 2 Hero để không bị cắt đỉnh dấu khi kết hợp `background-clip: text` hoặc `overflow: hidden`.

---

### 1.2. Thay đổi toàn bộ Slogan & dọn chuỗi cũ sót lại từ TripFlix

Hiện toàn bộ hệ thống vẫn đang dùng nguyên slogan cũ của TripFlix (`"Thấy là thích, nhích là đi"`, `"Chạm cảm hứng..."`, `"Lướt video..."`) và còn sót chữ `"rái cá biển"`, `"TF"`. **Phải thay toàn bộ các vị trí dưới đây:**

#### Bảng kiểm kê đầy đủ file & key cần thay trong `vintrip/fe/packages/i18n/src/`

| File | Dòng | Key | Nội dung cũ hiện tại | Vai trò / Vị trí hiển thị |
|---|---|---|---|---|
| `vi.ts` | 50 | `app.slogan` | `'Thấy là thích, nhích là đi'` | **Slogan chính toàn app**: hiển thị trong `OtaHero` (`<h1>`), `OtaFooter`, `layout`/metadata. |
| `vi.ts` | 60–61 | `web.heroTitle`, `web.heroBody` | `'Lướt video, chọn chuyến, đặt luôn'` / `'Xem chuyến đi thật của người trẻ...'` | Copy Hero dự phòng / web onboarding. |
| `api.ts` | 26–27 | `otaTitle`, `otaIntro` | `'Chạm cảm hứng.\nChọn một nơi ở.\nBắt đầu hành trình.'` | Copy giới thiệu OTA. |
| `api.ts` | 181–182 | `authHeroFirst`, `authHeroSecond` | `'Thấy là thích,'` / `'nhích là đi'` | Khung ảnh bên trái màn `/login`, `/register` (`auth-split-frame`). |
| `api.ts` | 524 | `otaSearchIntro` | `'Một nơi ở đẹp, một chuyến đi đáng nhớ.'` | Câu dẫn trang tìm kiếm. |
| `seo.ts` | 3–6 | `defaultTitle`, `defaultDescription`, `ogImageAlt` | `'Vintrip · Thấy là thích, nhích là đi'` | Thẻ `<title>`, OpenGraph, Twitter card chia sẻ link. |
| `demo.ts` | 72 | `web.footer` | `'Vintrip · Thấy là thích, nhích là đi.'` | Footer bản demo. |
| `demo.ts` | 83 | `feed.initials` | `'TF'` | **Sót từ TripFlix!** Phải đổi thành `'VT'`. |
| `mobile.ts` | 47 | `mobile.auth.title` (xung quanh dòng 47) | `'Chạm cảm hứng,\ntrọn hành trình.'` | Màn chào trên mobile app. |
| `flights.ts` | 31–32 | `heroTitle`, `heroIntro` | `'Bay đâu cũng gần,\nchọn vé thật nhanh'` | Banner trang `/flights`. |
| `ota.ts` | 4–5, 14 | `heroIntro`, `heroEyebrow` | `'Từ một cuối tuần bên biển...'` / `'Khám phá · Nghỉ dưỡng · Tận hưởng'` | Copy Hero & eyebrow. |
| `ota.ts` | 42–45 | `destinationTitle`, `recommendationTitle` | `'Bạn muốn thức dậy ở đâu?'`, `'Gợi ý dành cho bạn'` | Tiêu đề section trang chủ. |
| `ota.ts` | 71–72 | `staysTitle`, `staysIntro` | `'Có phòng cho chuyến đi sắp tới'` | Tiêu đề tấm vé `HomeStayPreview`. |
| `ota.ts` | 76 | `tripi` | `'Vini · Chú rái cá biển'` | **Lỗi sót danh tính mascot!** Vini hiện là trinh sát Teemo, không còn là rái cá biển Tripi. |
| `ota.ts` | 78–80 | `tripiTitle`, `tripiIntro` | `'Gom cảm hứng cho chuyến đi tiếp theo'` | Banner cộng đồng `tripiBanner`. |
| `ota.ts` | 83–84 | `storiesTitle`, `storiesIntro` | `'Chuyện kể từ những chuyến đi'` | Tiêu đề section `HomeStoryPreview`. |
| `ota.ts` | 138–142 | `footerTitle`, `footerTag`, `footerCopy` | `'Hẹn bạn ở chuyến đi tới.'` / `'Vini gửi bạn'` | Card Postcard trong Footer. |
| `assistant.ts` | 24 | `subtitle` | `'Chú rái cá biển đồng hành cùng bạn'` | **Lỗi sót danh tính mascot!** Cần sửa (vd: `'Bạn đồng hành du lịch của bạn'`). |
| `assistant.ts` | 36–37 | `eyebrow`, `title` | `'ĐI ĐÂU CŨNG CÓ VINI'` / `'Chuyến đi tiếp theo,\nmình cùng lên nhé?'` | Header chào trong popup chat Vini. |

#### Bộ phương án slogan mới đề xuất (thiết kế riêng để phối `Be Vietnam Pro` + `Dancing Script`)

Để Hero và Auth Split-Frame tách được 2 vế font (`Vế 1: Be Vietnam Pro đậm` + `Vế 2: Dancing Script viết tay`), slogan chính nên cấu trúc **2 vế ngắn ngăn bằng dấu phẩy**:

- **Phương án 1 (Khuyên dùng — Ấm áp, gợi cảm xúc & hành động):**
  - `app.slogan`: **`Đủ gần để đi, đủ đẹp để nhớ`** (hoặc tách dòng: `Đủ gần để đi,` / `đủ đẹp để nhớ`)
  - `web.heroTitle`: **`Chạm điểm đến mới, giữ trọn từng khoảnh khắc`**
  - `otaTitle`: **`Mở trang mới.\nChọn một điểm dừng.\nViết tiếp hành trình.`**
  - `flights.heroTitle`: **`Cất cánh nhẹ tênh,\nchạm miền nắng mới`**
  - `ota.tripiTitle`: **`Lưu lại hành trình, sẻ chia từng góc nhỏ`**
  - `ota.storiesTitle`: **`Nhật ký trên những cung đường`**
  - `ota.footerTitle`: **`Hành trình mới đang chờ bạn mở khóa.`**

- **Phương án 2 (Trẻ trung, gắn cộng đồng & đặt chỗ):**
  - `app.slogan`: **`Chạm gu riêng, trọn chuyến đi`**
  - `authHeroFirst` / `authHeroSecond`: **`Chạm gu riêng,`** / **`trọn chuyến đi`**

- **Phương án 3 (Gọn, thiên về nghỉ dưỡng & gia đình):**
  - `app.slogan`: **`Đi thật nhẹ nhàng, về đầy kỷ niệm`**

> **Lưu ý code khi tách 2 font cho slogan:** Trong `vintrip/fe/apps/web/src/features/discovery/ota-hero.tsx`, học lại cách tách chuỗi của `tripflix-fe` (`const [SLOGAN_FIRST, SLOGAN_SECOND] = vi.app.slogan.split(', ');`) để render `<span className={styles.titleFirst}>{SLOGAN_FIRST},</span> <span className={styles.titleSecond}>{SLOGAN_SECOND}</span>`. Nhờ vậy vế 1 dùng `Be Vietnam Pro` đậm và vế 2 tự động dùng `Dancing Script`. Nếu có ký tự xuống dòng hoặc slogan không có dấu `, `, cần fallback an toàn để không mất chữ.

---

## 2. Năm nguyên nhân cốt lõi khiến `vintrip/fe` chưa đẹp bằng `tripflix-fe`

1. **Bẫy đơn sắc cam–nâu (thiếu màu đối trọng):**
   - Trong `vintrip/fe/packages/tokens/src/tokens.css`, màu phụ `--color-teal` (`#A24A1E`), `--color-teal-soft` (`#FFE8D6` — trùng y hệt `--color-coral-tint`), `--color-teal-ink` (`#7A2E0E` — trùng y hệt `--color-coral-ink`), `--color-navy` (`#3D2418` — trùng `--color-text`) đều bị kéo về chung một dải cam–nâu đất.
   - Màu chính `--color-coral: #C2560F` hơi trầm và ngả nâu, khi đặt cạnh nền kem `#FFF8F2` và viền `#F3DCCB` tạo cảm giác hơi đục và nặng, thiếu một màu lạnh hoặc trung tính sắc nét để làm điểm cân bằng thị giác.
2. **Mất tương phản Typography:** Chỉ dùng một font sans (`Inter`), mất sự đối lập giữa nét dày hiện đại và nét mềm viết tay/editorial.
3. **Làm phẳng chiều sâu & chất liệu sổ tay du lịch:** Các chi tiết tạo "hồn" cho trang như `TornPaperDivider` (mép giấy xé), CSS `mask-image` đục lỗ răng cưa tấm vé, `WashiTape`, con dấu bưu điện `TravelPostmarkStamp`, đường bay nét đứt `.tripiRoute`, kính mờ `backdrop-filter` trên thẻ khách sạn đều bị ẩn bằng `display: none` (`ota-home.module.css` dòng 32, 57) hoặc gỡ bỏ.
4. **Triệt tiêu micro-interactions:** Các thẻ bị khóa cứng (chỉ đổi `box-shadow` 180ms, cấm phóng ảnh hay nhấc nhẹ khi hover), không có chuyển động phản hồi con trỏ hay stagger vào khung hình, khiến trang bị "tĩnh".
5. **Ảnh Hero & Mascot lệch tông bảng màu:** Ảnh `mega-grand-world-venice.jpg` có bầu trời xám mù và nước xanh rêu tối đối lập với bảng màu cam nắng ấm; Teemo (`vini-welcome.png`) mặc đồ xanh rêu/nâu và bị đặt trơ trọi không có bóng tiếp đất hay bối cảnh kết nối.

---

## 3. Phân tích chi tiết Landing Page & danh sách vấn đề cần sửa

### 3.1. Design Tokens (`packages/tokens/src/tokens.css` & `index.ts`)
- **Vấn đề:** `--color-teal` và `--color-coral` cùng họ cam đất; `--color-teal-soft === --color-coral-tint`; `--color-teal-ink === --color-coral-ink`; `--color-navy === --color-text`.
- **Hướng xử lý đề xuất:**
  - Giữ tông chủ đạo cam ấm nhưng làm trong trẻo hơn: giữ `--color-coral` (`#C2560F` hoặc nâng nhẹ độ tươi nhưng vẫn đạt >= 4.5:1 với chữ trắng, ví dụ `#C94E0A` / `#B84B09`), nền trang giữ `#FFF8F2` nhưng tăng tỷ lệ mảng trắng `#FFFFFF` ở card/container.
  - **Khôi phục 1 màu phụ đối trọng thật sự** cho `--color-teal` / `--color-teal-ink` / `--color-teal-soft` (ví dụ tông xanh cổ vịt trầm ấm `#1F6E6C` / `#134E4A` hoặc xanh lam xám `#2B5B7A`, vẫn cực hợp khi đi với cam pastel & kem ấm) dùng cho nhãn vùng, icon thông tin, tab phụ, đường nét bản đồ — tránh toàn trang chỉ có 1 màu nâu-cam.
  - Bổ sung shadow nhiều tầng mềm hơn (`--shadow-soft`, `--shadow-raised` thêm lớp viền sáng `inset 0 1px 0 rgb(255 255 255 / 80%)` hoặc shadow kép ambient + direct).

### 3.2. Header & Thanh điều hướng (`fe-shell.css`, `ota-navigation.tsx`, `ota-shell.module.css`)
- **Vấn đề hiện tại:**
  - Header sticky cao `72px` nền trắng mờ nằm **tách rời bên trên** Hero (`fe-shell.css` dòng 10–27), cắt ngang tầm nhìn ngay từ đầu trang.
  - `globals.css` (dòng 82–671) vẫn còn giữ toàn bộ rule header cũ (viên thuốc + chữ trắng trên Hero), rồi `fe-shell.css` dùng `body .ota-header ...` để đè lại — gây phình CSS và dễ xung đột specificity.
  - Thanh nav chỉ còn 3 mục (bỏ `Trang chủ`), `.navIndicator` chỉ là vạch gạch dưới `3px` nên ở trang chủ không có mục nào sáng, nhìn khá trống.
  - Nút `Đăng nhập` (`.header-login`) chuyển thành màu nhạt `--color-coral-tint` (`fe-shell.css` dòng 59), kém nổi bật với người dùng mới.
- **Hướng xử lý:**
  - Cân nhắc 1 trong 2 hướng: (a) đưa header trên trang chủ thành dạng nổi/trong suốt trên Hero nắng ấm giống `tripflix-fe` rồi chuyển sang trắng mờ khi cuộn (`data-header-scrolled`), **hoặc** (b) giữ sticky `72px` nhưng bỏ đường viền dưới cứng khi chưa cuộn (`scrollY === 0`), thêm pill nền nhẹ cho `.navIndicator` (nền `--color-coral-tint`) để đồng bộ độ mượt với `OtaNavigation`.
  - Dọn bỏ CSS header thừa đã bị ghi đè trong `globals.css` để không còn kiến trúc đè 2 lớp.
  - Nâng độ tương phản / sức nặng cho `.header-login` (dùng nút chính `--color-coral` chữ trắng hoặc viền cam rõ nét).

### 3.3. Hero Banner (`ota-hero.tsx`, `ota-hero.module.css`) — **Ưu tiên cao nhất**
- **Vấn đề hiện tại:**
  1. **Quá thấp & hẹp:** `min-height: 320px`, `width: min(1280px, calc(100% - 48px))` (`ota-hero.module.css` dòng 4–5). So với chiều cao `750–830px` của TripFlix, Hero hiện tại giống một banner phụ nhỏ hơn là điểm nhấn mở màn.
  2. **Hộp chữ nhật tối bọc `<h1>` rất thô:** `.copy h1` đặt `background: var(--color-overlay-heavy)` (`#3D2418CC`), `padding: 12px 18px` (`ota-hero.module.css` dòng 14–27), tạo một khối hộp nâu đục đè lên con tàu trong ảnh.
  3. **Ảnh nền lệch tông:** `mega-grand-world-venice.jpg` có trời xám âm u và dãy nhà quá nhiều màu lạnh rực, không hòa với tông cam ấm.
  4. **Linh vật lơ lửng:** `vini-welcome.png` (`160x160`) đặt ở `right: 24px; bottom: 52px` thiếu bóng tiếp đất (`drop-shadow` hoặc bệ đứng/khung cảnh), tách rời khỏi ảnh nền.
- **Hướng xử lý:**
  - Tăng chiều cao Hero desktop lên khoảng `480px–560px` (mobile khoảng `300px–340px`), có thể cân nhắc mở rộng `width` lớn hơn (tới `min(1440px, calc(100% - 32px))` hoặc full-bleed) để xứng tầm landing page.
  - Thay ảnh Hero bằng ảnh **nắng vàng / hoàng hôn ấm** (hoặc áp lớp color-grading nhẹ tông ấm + scrim gradient mượt từ trái dưới `linear-gradient(105deg, rgb(42 20 10 / 72%) 0%, rgb(42 20 10 / 35%) 48%, transparent 78%)` + gradient đáy nhẹ).
  - **Xóa bỏ hoàn toàn `background: var(--color-overlay-heavy)` trên `.copy h1`**; dùng text trắng có `text-shadow` mềm trên nền scrim, thêm dòng `eyebrow` phía trên và 1 câu mô tả ngắn (`vi.ota.heroIntro`) dưới `<h1>` để khối chữ có chiều sâu 3 cấp (`eyebrow` → `h1` 2 font `Be Vietnam Pro` + `Dancing Script` → `intro`).
  - Xử lý mascot trên Hero: thêm `filter: drop-shadow(...)` tiếp đất + viền ánh sáng ấm nhẹ, hoặc đặt Vini đứng trên mép trên của Search Card / góc phải có thẻ nhỏ chào mừng thay vì dán trơ trọi giữa nền ảnh.

### 3.4. Thanh tìm kiếm nổi (`live-search-screen.tsx`, `stay-search.module.css`)
- **Vấn đề hiện tại:**
  1. `margin-top: -32px` quá nông, hộp trắng `padding: 20px` hơi cồng kềnh so với Hero thấp.
  2. Mỗi ô nhập (`.field`) có viền riêng đứng rời rạc, **thiếu khay nền bọc chung** (`surface-muted`) như bản TripFlix.
  3. Icon trong `.field > svg` đứng trần, mất hộp vuông bo góc nền màu nhạt (`.field > svg` ở TripFlix có `padding: 10px; border-radius: 12px; background: var(--color-sea-mist)`).
  4. **Lệch hình học (Shape mismatch):** 5 ô input bo `--radius-sm` (`10px`) nhưng nút submit cuối hàng bo `--radius-pill` (`999px`) và chiều cao `44px` bị lệch tỷ lệ khi nằm cuối lưới `64px`.
  5. Nút submit khi `disabled` (chưa chọn điểm đến) dùng nền `#FFF1E6` chữ `#8A5A44` — trên nền form trắng nhìn khá chìm.
- **Hướng xử lý:**
  - Đưa Hero cao lên và kéo `.homepagePanel` đè sâu hơn vào đáy Hero (`margin-top: -56px` đến `-72px`), dùng `--shadow-raised` nhiều lớp rõ độ nổi.
  - Bọc `.searchRow` trong một khay nền `var(--color-surface)` (`padding: 6px`, `border-radius: 18px`, `border: 1px solid var(--color-border)`), bên trong là các ô `.field` nền `#FFFFFF` bo `12px` (không viền gắt, chỉ hiện viền khi `:hover` / `:focus-within`).
  - Trả lại hộp nền cho `.field > svg` (`padding: 8px; border-radius: 10px; background: var(--color-coral-tint)` hoặc màu phụ mới).
  - Đồng bộ bo góc nút submit theo ô trong khay (`border-radius: 12px`–`14px` với chiều cao bằng hàng `64px` trên desktop; full-width ở mobile) và tăng độ rõ cho hàng tab `Khách sạn` / `Vé máy bay` (gom thành segmented switch gọn gàng thay vì 2 pill tách rời).

### 3.5. Lặp bố cục giữa "Gần VinUni · Ocean Park" và "Gợi ý điểm đến" (`ota-home-sections.tsx`, `ota-home-recommendations.tsx`, `ota-home.module.css`)
- **Vấn đề hiện tại:**
  - Khối `OCEAN_PARK_SPOTS` (`ota-home-sections.tsx` dòng 9–78) dùng lưới **4 cột** ảnh `4:3` trên, chữ dưới.
  - Ngay bên dưới, khối `OtaHomeRecommendations` (`ota-home-recommendations.tsx` dòng 20–49) **cũng dùng lưới 4 cột ảnh `4:3` trên, chữ dưới** — bị lặp cấu trúc 100% ở hai section liên tiếp.
  - Ngoài ra trong mỗi card của `OtaHomeRecommendations`, có 3 `<Link>` xếp dọc (thông tin chính → `Từ ... VNĐ →` → tên trải nghiệm), thiếu đường phân cách tinh tế, chiều cao mô tả lệch nhau khiến các hàng giá bên dưới không thẳng hàng ngang.
- **Hướng xử lý:**
  - **Phá thế lặp bố cục:** Giữ 1 khối dạng lưới 4 cột ảnh-chữ (ví dụ khối Ocean Park với ảnh đồng bộ ánh sáng hơn), và **khôi phục Bento Grid 3 ô bất đối xứng** (1 ô lớn bên trái `grid-row: span 2`, góc trên trái bo lớn `48px–64px` + 2 ô nhỏ bên phải) với ảnh full-bleed + gradient scrim chân thẻ + badge nổi cho `OtaHomeRecommendations` (tương tự `tripflix-fe`, đổi màu badge/accent sang hệ màu VinTrip).
  - Nếu vẫn giữ thêm link trải nghiệm/giá, đảm bảo card dùng flex/grid căn đáy đồng đều (`margin-top: auto`).

### 3.6. Khối Vé Du Lịch & Gợi ý lưu trú (`ota-home-previews.tsx`, `ota-home.module.css`)
- **Vấn đề hiện tại:**
  1. `.stayHeader` đặt `padding-right: 120px` (`ota-home.module.css` dòng 21), khiến toàn bộ `.stayTicket` bị bóp thụt sang trái chừa 120px trống bên phải cho `vini-guide.png` (`110x110`).
  2. Toàn bộ `.stayRedStamp` (con dấu Verified), `.ticketTape` (`WashiTape`), CSS `mask-image` khoét lỗ xé vé ở rãnh giữa (`--seam-x: 55.555%`), viền nét đứt `.stayInnerFrame` đều bị tắt/gỡ — tấm vé biến thành hộp chữ nhật phẳng thông thường.
  3. Tên điểm đến `.stayDestinationBadge` bị đẩy vào viên pill nền xám (`background: var(--color-surface-muted)`), mất nét chữ viết tay bay bổng.
  4. Trong `.hotelCard` bên dưới: `.pin-tag` (nhãn sao) nằm chen giữa tỉnh và tiêu đề `<h3>` thay vì ghim gọn ở góc trên phải vùng thông tin; mất hiệu ứng zoom ảnh nhẹ khi hover.
- **Hướng xử lý:**
  - Bỏ `padding-right: 120px` trên `.stayHeader` để tấm vé rộng đủ 100% container; đặt mascot đứng ở rãnh giữa hoặc mép dưới phải có `drop-shadow` tiếp đất tự nhiên (trên mobile vẫn ẩn gọn hoặc thu nhỏ không đè chữ).
  - Khôi phục cấu trúc **Tấm vé sổ tay** rất hợp với chất ấm áp của VinTrip: `mask-image` vết khuyết bán nguyệt + lỗ xé dọc giữa phần chữ và ảnh, viền nét đứt `.stayInnerFrame`, bật lại `WashiTape` + `stayRedStamp` (chỉnh màu theo token VinTrip), và dùng **`Dancing Script`** cho `.stayDestinationText` (bỏ nền hộp xám ở `.stayDestinationBadge`).
  - Trong 3 thẻ `.hotelCard`: cho nhãn sao `.pin-tag` ghim ở góc trên phải của `.hotelInfo` (hoặc góc ảnh), căn `margin-top: auto` cho `.stayPriceRow` để 3 card luôn thẳng hàng giá dù tên khách sạn dài 1 hay 2 dòng.

### 3.7. Banner Cộng đồng (`tripiBanner`) & Câu chuyện (`HomeStoryPreview`)
- **Vấn đề hiện tại:**
  - Trong `tripiBanner` (`ota-home.module.css` dòng 46–57): nền bẹt `--color-coral-tint`, nút CTA `.tripiAction` lại dùng nền trắng (`background: var(--color-background)`) nên yếu lực nhấn; toàn bộ đường bay nét đứt `.tripiRoute`, ngôi sao `.tripiStamp`, con dấu `.tripiPostmark`, băng dính `.tripiTapeBeach`/`.tripiTapeTown` đều đang bị `display: none`.
  - Trong `HomeStoryPreview` (`ota-home.module.css` dòng 58–65): `.story` thiếu `display: flex; flex-direction: column; gap: 10px;` và `.storyStats` thiếu `margin-top: auto;`, dẫn đến **dòng tim + bình luận ở đáy 3 thẻ bài viết bị lệch cao thấp khác nhau** khi đoạn trích ngắn/dài khác nhau.
- **Hướng xử lý:**
  - Bật lại ở mức tinh tế (không rối): `.tripiRoute` nét đứt mảnh, `WashiTape` dán góc 2 tấm postcard, con dấu `TravelPostmarkStamp` (`OCEAN PARK • 2026`), chữ chú thích dưới ảnh postcard dùng `Dancing Script`.
  - Đổi nút `.tripiAction` thành nút chính nổi bật (nền `--color-coral`, chữ trắng, bóng `--shadow-soft`).
  - Sửa `.story` thành `display: flex; flex-direction: column; gap: 10px;` và `.storyStats { margin-top: auto; padding-top: 8px; }`, tô màu trái tim `--color-coral` và icon bình luận `--color-sun` để có điểm nhấn sắc độ.

### 3.8. Chân trang (`ota-footer.tsx`, `ota-shell.module.css`)
- **Vấn đề hiện tại:**
  - Trên desktop, `.footerGrid` dùng 4 cột (`1.3fr repeat(3, 1fr)`), còn `.footerPostcard` bị đặt `grid-column: 1 / -1` (`ota-shell.module.css` dòng 8, 20) nên bị kéo giãn thành một thanh ngang dài gần `1440px`, chữ dạt sang trái, ảnh và Teemo dạt tít sang phải — khoảng giữa trống hoác.
  - `.footerTape` bị `display: none`, ảnh `.footerPostcardPhoto` vuông thẳng thiếu khung polaroid trắng.
- **Hướng xử lý:**
  - Trả `.footerGrid` về **5 cột cân đối** trên desktop (`>= 1200px`) giống `tripflix-fe` (`1.15fr 0.75fr 0.9fr 0.85fr 1.35fr`) để `.footerPostcard` nằm gọn làm cột thứ 5 (chỉ span toàn hàng ở tablet/mobile).
  - Bật lại `.footerTape`, thêm viền trắng `3px` + xoay nhẹ `3deg` cho `.footerPostcardPhoto`, và dùng `Dancing Script` cho dòng tag/chú thích nhỏ.

---

## 4. Các tiểu tiết xuyên suốt trên toàn site cần xử lý

1. **Hoàn tất FE-11 cho `.primary-button:disabled` trong `globals.css`:**
   - Tại `vintrip/fe/apps/web/src/app/globals.css` dòng 922–925, `.primary-button:disabled` vẫn đang dùng `opacity: 0.6; cursor: wait;` (vừa làm mờ nút không đạt tương phản, vừa hiện con trỏ chờ sai ngữ cảnh).
   - Cần đồng bộ theo FE-11: `opacity: 1; background: var(--color-surface-muted); color: var(--color-text-muted); cursor: not-allowed;`.
2. **Sửa màu hiệu ứng loang `--ripple-color` trên `.primary-button`:**
   - `globals.css` dòng 914 đang đặt `--ripple-color: var(--color-ink)` (`#3D2418`), khiến khi hover vào nút cam `--color-coral` lại loang ra mảng màu nâu sẫm tối. Đổi `--ripple-color` sang `color-mix(in srgb, var(--color-coral-ink) 88%, black)` hoặc sắc cam đậm hơn `--color-coral` một nấc (như `#9E4108`) sẽ tự nhiên và sang hơn nhiều.
3. **Làm dịu tab đang chọn trong `segmented-tabs.module.css`:**
   - Tại `vintrip/fe/apps/web/src/features/shared/segmented-tabs.module.css` dòng 105–110, tab active đang dùng `background: var(--color-ink); color: var(--color-background);`. Với `#3D2418`, dải chip nhiều mục bị mảng nâu socola quá nặng. Nên đổi sang `background: var(--color-coral); color: var(--color-background);` hoặc `background: var(--color-coral-soft); color: var(--color-coral-ink);` (cân nhắc giữ `.tabsDark` nền tối riêng cho video reels).
4. **Tránh trùng lặp 2 nút Trợ lý Vini trên cùng màn hình (`assistant-widget.tsx`, `assistant.module.css`):**
   - Hiện `AssistantHeaderButton` trên header và `.fab` nổi góc phải dưới cùng hiển thị avatar Vini giống hệt nhau. Nên chọn **một điểm mở chính** (hoặc giữ `.fab` gọn có badge thông minh ở góc dưới phải và thu gọn/ẩn nút trùng trên header khi desktop, hoặc ngược lại), đồng thời tinh chỉnh bóng + viền `.fab` cho nhẹ nhàng hơn.
5. **Banner trang `/search` (`hotel-listing.module.css` dòng 5):**
   - Hiện dùng overlay tối toàn vùng `linear-gradient(90deg, var(--color-overlay-heavy), var(--color-overlay))` khiến banner bị tối xỉn. Có thể nâng cấp lại thành gradient sáng thoáng một bên (`backdrop-filter: blur(...)` + `mask-image`) hoặc gradient một chiều bên trái để ảnh bên phải sáng rõ.
6. **Cân nhắc trả lại micro-interactions có chừng mực (tắt trong `prefers-reduced-motion: reduce`):**
   - Nhấc thẻ nhẹ `-3px` kết hợp chuyển bóng `--shadow-raised` và **zoom ảnh mượt bên trong khung `overflow: hidden` (`transform: scale(1.04)` trong `350ms ease-out`)** cho các thẻ điểm đến, thẻ khách sạn, thẻ bài viết. Thao tác này không làm vỡ layout bên ngoài mà tăng cảm giác mượt mà rõ rệt.
7. **Làm sạch CSS bị đè giữa `globals.css` và `fe-shell.css`:**
   - Rà soát và gỡ bỏ các rule cũ trong `globals.css` đang bị `fe-shell.css` ghi đè hoàn toàn (như khối header viên thuốc cũ, `.primary-button` cũ), tránh tình trạng sửa ở `globals.css` nhưng `fe-shell.css` đè mất hoặc ngược lại.

---

## 5. Lộ trình thực hiện đề xuất & Checklist nghiệm thu

### Thứ tự ưu tiên
- **Đợt 1 (P0 — Thay đổi cục diện ngay lập tức):**
  1. Nạp và áp dụng cặp font **`Be Vietnam Pro` + `Dancing Script`** (`layout.tsx`, `tokens.css`, `tokens.ts`, `globals.css`, `fe-shell.css`).
  2. Thay toàn bộ **slogan** & sửa các chuỗi sót (`'Thấy là thích, nhích là đi'`, `'rái cá biển'`, `'TF'`) trong `vintrip/fe/packages/i18n/src/*`.
  3. Tinh chỉnh bảng màu `tokens` để phá thế đơn sắc cam–nâu (trả lại một màu phụ đối trọng sạch cho `--color-teal*`).
  4. Làm lại **Hero** (tăng chiều cao, đổi ảnh nắng ấm, bỏ hộp chữ nhật tối sau `<h1>`, áp dụng 2 font cho slogan, neo bóng/bối cảnh cho mascot) và nâng cấp **Search Capsule** (khay bọc ngoài, hộp icon, khớp bo góc nút tìm).
- **Đợt 2 (P1 — Nhịp điệu & Chất liệu Landing Page):**
  5. Chuyển `OtaHomeRecommendations` sang **Bento Grid 3 ô** để không trùng lặp lưới 4 cột với khối Ocean Park.
  6. Khôi phục hình dáng **Tấm vé sổ tay** (răng cưa `mask-image`, `WashiTape`, `stayRedStamp`, tên tỉnh `Dancing Script`, bỏ `padding-right: 120px`) và căn gọn `.pin-tag` trong `.hotelCard`.
  7. Hoàn thiện `tripiBanner` (bật lại `.tripiRoute`, con dấu, postcard, nút CTA đậm), căn đều đáy `.storyStats` trong `HomeStoryPreview`, và đưa `.footerPostcard` vào cột thứ 5 trên desktop.
- **Đợt 3 (P2 — Tiểu tiết toàn site & Polish):**
  8. Hoàn thành FE-11 (`.primary-button:disabled` trong `globals.css`), sửa `--ripple-color`, làm dịu tab active trong `segmented-tabs.module.css`, giải quyết trùng nút Assistant, thêm hover zoom ảnh nhẹ trong card và dọn CSS đè thừa.

### Checklist nghiệm thu bắt buộc
- [ ] `pnpm typecheck` và `pnpm test` trong `vintrip/fe` đạt (chỉ chấp nhận lỗi thiếu `app/auth/google/mobile/route.ts` đã biết trước nếu chưa bổ sung).
- [ ] Chụp màn hình thực tế trang chủ và các trang chính ở **1440px** và **390px**: không tràn ngang (`scrollWidth <= innerWidth`), không cắt dấu tiếng Việt ở font `Dancing Script` và `Be Vietnam Pro` trên Windows.
- [ ] Tìm kiếm toàn repo không còn chuỗi `"Thấy là thích"`, `"nhích là đi"`, `"rái cá biển"`, `initials: 'TF'`.
- [ ] Mọi cặp chữ/nền đạt tương phản WCAG tối thiểu **4.5:1** (chữ lớn >= **3:1**), mọi nút bấm >= **44px**, có `:focus-visible` rõ ràng và hỗ trợ `@media (prefers-reduced-motion: reduce)`.
- [ ] Không làm thay đổi hành vi API, đặt phòng, giỏ hàng, thanh toán VNPay hay luồng đăng nhập.
