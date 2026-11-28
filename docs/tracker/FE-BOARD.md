# Bảng việc làm lại giao diện `vintrip/fe` — PM: Claude (đặc tả, giao việc, nghiệm thu) · Làm: Codex + Antigravity

> **Mục tiêu:** làm lại toàn bộ giao diện `vintrip/fe` theo tông **cam pastel**, giữ nguyên phạm vi (trang chủ, khách sạn, vé máy bay, cảm hứng, trợ lý, đặt chỗ, tài khoản) và giữ nguyên chức năng, API. **Chỉ đổi giao diện.**
> **Dựa vào bản hiện tại:** giữ bố cục đang chạy tốt (ô tìm kiếm, thẻ gợi ý, thanh điều hướng điện thoại), bỏ những gì nặng và rối (lớp phủ đậm ở đầu trang, mặt nước động nhiều lớp).
> **Vai trò:** Claude chỉ làm PM, không viết code giao diện. **Codex** làm trong thư mục chính, nhánh `vintrip`. **Antigravity** làm trong worktree `C:\Users\PC\Documents\GitHub\K5-Day15-fe-antigravity`, nhánh `fe-antigravity`. PM gộp nhánh của Antigravity vào `vintrip` sau khi nghiệm thu.

## Hướng thiết kế

**Cảm giác:** ấm áp, nhẹ nhàng, thân thiện với gia đình. Nhiều khoảng trắng, góc bo tròn, bóng đổ mềm, ảnh thật làm điểm nhấn.

**Bảng màu cam pastel:** nguồn chuẩn là `docs/design/fe-redesign.md` mục 1 (token đã áp ở FE-01). Tóm tắt:

| Vai trò | Màu | Chữ đi kèm | Tương phản |
|---|---|---|---|
| Nền trang | `#FFF8F2` kem | `#3D2418` nâu đậm | 13.6:1 |
| Chữ phụ | `#8A5A44` | trên nền kem | 5.5:1 |
| Nút chính (chữ trắng) | `#C2560F` cam đậm (`--color-coral`) | trắng | 4.53:1 |
| Nút phụ, chip đang chọn | `#FFB98A` cam pastel (`--color-coral-soft`) | `#7A2E0E` nâu | 5.65:1 |
| Nút phụ / thẻ | `#FFE8D6` đào | `#7A2E0E` | 8.0:1 |
| Viền, nền nhạt | `#FFD3B0` | `#7A2E0E` | 6.8:1 |
| Màu phụ (chữ trắng) | `#A24A1E` đất nung (`--color-teal`) | trắng | 5.94:1 |
| Đạt / thành công | `#2F7A5F` (`--color-success`) | trắng | 5.16:1 |

- **Không dùng chữ trắng trên cam pastel** (chỉ đạt 3:1).
- Cần chữ trắng thì dùng nền `#C2560F` (4.5:1).

**Linh vật:** Teemo, giữ tên file `vini-*`. Người dùng quyết định ngày 28/11 (bài làm trong trường, không thương mại). Đặc tả gốc yêu cầu nhân vật nguyên bản; PM đã nêu rủi ro: repo nằm trên GitHub, ai có đường dẫn cũng xem được. Không dùng bộ ảnh này nếu đưa VinTrip ra ngoài phạm vi lớp học.

## Chia việc

| Mã | Việc | Người làm | Phụ thuộc | Trạng thái |
|---|---|---|---|---|
| FE-01 | Hệ thiết kế cam pastel: token màu, chữ, bo góc, bóng, trạng thái | **Claude** | — | XONG |
| FE-02 | Bản đặc tả giao diện từng trang (bố cục, câu chữ theo CRO, trạng thái rỗng/lỗi/đang tải) | **Claude** | FE-01 | XONG |
| FE-03 | Linh vật nguyên bản: 6 tư thế 3D nền trong suốt theo brief của PM | **Codex** | FE-01 | XONG |
| FE-04 | Khung chung: thanh đầu trang, chân trang, thanh điều hướng điện thoại | **Codex** | FE-01, FE-02 | XONG |
| FE-05 | Trang chủ và trang kết quả tìm khách sạn `/search`: đầu trang, ô tìm kiếm, khối gợi ý, nền, danh sách + bộ lọc | **Codex** | FE-04 | XONG |
| FE-06 | Trang chi tiết khách sạn `/hotels/[id]`: ảnh, chọn phòng, tiện nghi, đánh giá | **Antigravity** | FE-01, FE-02 | XONG |
| FE-07 | Vé máy bay: tìm kiếm, kết quả, chi tiết | **Antigravity** | FE-01, FE-02 | XONG |
| FE-08 | Cảm hứng: bảng tin, reels, lịch trình mẫu, hồ sơ người dùng | **Codex** | FE-04 | XONG |
| FE-09 | Trợ lý Vini, giỏ hàng, thanh toán, đặt chỗ, tài khoản, đăng nhập | **Antigravity** | FE-01, FE-02 | XONG |
| FE-11 | Thống nhất kiểu nút bị khoá: nền `--color-surface-muted`, chữ `--color-text-muted`, không dùng `opacity` | **Codex** (`globals.css` `.primary-button:disabled`) + **Antigravity** (`auth.module.css` `.submitBtn`, `flights.module.css` `.searchButton`) | FE-04 | XONG |
| FE-12 | Logo VinTrip mới theo yêu cầu trực tiếp: bỏ biểu tượng chữ V, đồng bộ SVG sáng/tối và favicon | **Codex** | FE-01, FE-04 | XONG |
| FE-13 | Hero trang chủ: chữ "VinTrip" lớn + slogan mới "Mỗi hành trình là một câu chuyện đáng nhớ." viết bằng Dancing Script; font chữ chính toàn trang đổi sang Be Vietnam Pro (token đã đổi, xem `fe-redesign.md` §1.2); ảnh hero đổi sang biển hồ Ocean Park `ocean-park/ocean-park-lagoon.jpg` | **Codex** | FE-05 | XONG |
| FE-13b | Đổi ảnh hero biển hồ mới; giữ màu ảnh, gradient nhẹ chỉ bên trái và bóng chữ | **Codex** | FE-13 | XONG |
| FE-14 | Khôi phục route `app/auth/google/mobile/route.ts` (đăng nhập Google cho app di động) để `pnpm typecheck` và build Docker chạy được; test có sẵn là đặc tả | **Antigravity** | — | TODO |
| FE-15 | Gộp C1 vào trang chủ: khung lập lịch Công viên Mẫu (`#lich-vui-choi`) nằm dưới mục "Gợi ý cho bạn", trên dải "VINTRIP TICKET", thêm tab "Lịch vui chơi"; `/c1` dùng chung component. Làm **giao diện trước** theo hợp đồng `vintrip/CONTRACTS.md` §8; backend do người khác làm | **Codex** | FE-13 | XONG |
| FE-15b | Kết quả C1: tô nổi khung giờ `HH:MM–HH:MM` ở đầu mỗi dòng lịch (chỉ đổi cách hiển thị, giữ nguyên văn bản) | **Codex** | FE-15 | TODO |
| FE-16 | Chatbot đổi tên "Vini" → "VinTrip", mô tả "Chồn nhỏ đồng hành cùng bạn" (i18n `assistant.ts` + prompt `vintrip/ai/app/prompts/assistant-responder.v5.md`); sửa chuỗi sót `initials: 'TF'`, "rái cá biển". Không đổi `codebase/agent.py` (C1 đã chấm) | **Codex** | FE-13 | XONG |
| FE-17 | Đánh bóng trang chủ theo `docs/design/fe-polish-handoff.md` đợt 2–3 (bento, tấm vé sổ tay, banner cộng đồng, chân trang, hover) + quyết định màu phụ xanh cổ vịt | **Codex** | FE-15 | SAU CP4 |
| FE-10 | Nghiệm thu từng ticket của Codex và Antigravity, rà tổng thể cuối cùng | **Claude** | mỗi ticket | liên tục |

## Phân vùng file (không ai sửa vùng của người khác)

| Vùng | Chủ | Thư mục (trong `vintrip/fe/apps/web/src` nếu không ghi khác) |
|---|---|---|
| Hệ thiết kế | **PM (Claude)** | `vintrip/fe/packages/tokens/**`, `docs/design/**`, `docs/tracker/FE-BOARD.md`. Cần token mới thì ghi `KẸT` để PM thêm |
| Khung chung, trang chủ, cảm hứng, linh vật | **Codex** | `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `app/loading.tsx`, `app/not-found.tsx`, `features/shell/**`, `features/discovery/**`, `features/social/**`, `features/mascot/**`, `features/notifications/**`, `features/onboarding/**`, `app/inspiration/**`, `app/trip-plans/**`, `app/trips/**`, `app/u/**`, `app/search/**`, `app/onboarding/**`, `app/coming-soon/**`, `vintrip/fe/apps/web/public/brand/**` |
| Khách sạn, vé máy bay, trợ lý, đặt chỗ, tài khoản | **Antigravity** | `features/hotels/**`, `features/flights/**`, `features/assistant/**`, `features/checkout/**`, `features/auth/**`, `app/hotels/**`, `app/flights/**`, `app/cart/**`, `app/checkout/**`, `app/bookings/**`, `app/payments/**`, `app/account/**`, `app/(auth)/**` |
| Dùng chung, cấm sửa | — | `vintrip/fe/packages/api-client/**`, `vintrip/fe/packages/app-core/**`, `vintrip/fe/packages/i18n/**`, `vintrip/fe/packages/ui-web/**`, `features/shared/**`, `features/seo/**`, `features/legal/**`. Cần sửa thì ghi `KẸT` để PM quyết |

- **Antigravity không sửa file bảng này.** Antigravity ghi trạng thái ticket vào `docs/tracker/FE-ANTIGRAVITY.md` trong worktree của mình. PM đọc file đó rồi cập nhật bảng này.
- Cần một thứ ở vùng của người khác (ví dụ một class trong `globals.css`): ghi `KẸT` kèm yêu cầu cụ thể, PM chuyển cho chủ vùng.

## Quy trình (giống bảng C1)

1. Codex nhận ticket `TODO` của mình theo thứ tự, đổi sang `ĐANG LÀM`, commit với tiền tố mã (`[FE-05] ...`), xong thì chuyển `CHỜ NGHIỆM THU`. **Không tự chuyển `XONG`.**
2. Claude nghiệm thu, rồi chuyển `XONG` hoặc `LÀM LẠI` kèm lý do, ghi vào "Nhật ký nghiệm thu".
3. Trước khi làm một trang, Codex đọc phần của trang đó trong `docs/design/fe-redesign.md` (sản phẩm của FE-02).

## Tiêu chí nghiệm thu chung (mọi ticket giao diện)

- `pnpm typecheck` và `pnpm test` trong `vintrip/fe` đạt. Lỗi duy nhất được chấp nhận là lỗi có từ trước: thiếu `app/auth/google/mobile/route.ts`.
- Chụp trang thật ở 1440px và 390px: không tràn ngang, không chữ đè chữ, linh vật không che nội dung.
- Mọi cặp chữ/nền đạt tương phản ≥ 4.5:1 (chữ lớn ≥ 3:1). Chỉ dùng màu trong bảng trên, qua token, không viết cứng mã màu mới.
- Có focus nhìn thấy được khi dùng bàn phím. Vùng bấm ≥ 44px. Có `prefers-reduced-motion`.
- Không đổi API, không đổi `packages/api-client`, không đổi hành vi (đặt chỗ, thanh toán, đăng nhập).
- Giữ dòng ghi nguồn TripFlix trong `README.md`.

---

## FE-01 · Hệ thiết kế cam pastel (Claude)

- Thay giá trị trong `packages/tokens/src/index.ts` và `tokens.css` theo bảng trên. Giữ tên token cũ để không phá code đang dùng. Test khớp hai file phải đạt.
- Thêm token cho bo góc (`--radius-sm/md/lg`), bóng mềm (`--shadow-soft/raised`) và thang chữ (`--text-xs` … `--text-3xl`).
- Ghi lại quy tắc dùng màu trong `docs/design/fe-redesign.md` mục 1.

## FE-02 · Đặc tả giao diện (Claude)

`docs/design/fe-redesign.md`, mỗi trang một mục: mục tiêu của người dùng, bố cục ở cỡ máy tính và cỡ điện thoại, câu chữ chính (tiêu đề, nút), trạng thái rỗng / đang tải / lỗi, những gì giữ lại từ bản cũ, những gì bỏ đi.

## FE-03 · Linh vật nguyên bản (Codex, theo brief của PM)

Brief nhân vật và 6 tư thế 3D nền trong suốt: chào, tò mò, lập kế hoạch, hướng dẫn, thành công, buồn (dùng cho trang lỗi). Thay vào `public/brand/vini/`, giữ tên file để không phải sửa code.

**Ghi chú Codex 28/11/2026 — CHỜ NGHIỆM THU.** Theo yêu cầu mới của người dùng, dùng Teemo thay nhân vật nguyên bản; đã tạo 6 PNG trong `public/brand/vini/`, 1024×1024, alpha thật, 171.064–185.984 byte, thêm ảnh buồn vào `not-found.tsx`, ảnh chào trên hero, bỏ 3 PNG Tripi không còn dùng; prompt ở `vini/README.md`. Kiểm PNG bằng Sharp đạt. `pnpm typecheck`: chỉ lỗi route Google đã biết; `pnpm test`: 574 đạt, lỗi route Google và 2 test mặc định Nha Trang/Hà Nội có sẵn thuộc FE-05. Sau FE-05: pnpm test có 576/576 test web đạt, chỉ suite route Google đã biết không nạp được; typecheck chỉ lỗi route này. Người dùng chọn để PM kiểm ảnh 1440px/390px.

**FE-03 · Phản hồi nghiệm thu 28/11 — KẸT: yêu cầu nhân vật chưa thống nhất.** Người dùng đã chỉ định Teemo trực tiếp; giữ tài nguyên và prompt trung thực theo chỉ định đó, không tự đổi sang nhân vật khác. PM yêu cầu nhân vật nguyên bản trong nhật ký nghiệm thu; chờ PM thống nhất lại đặc tả với người dùng. Đã kiểm đường ảnh: AssistantHeaderButton dùng expr-happy, map hiện tại trỏ vini-welcome.png. Thêm unoptimized ở ViniMascot để lấy PNG mới trực tiếp, tránh dùng bản tối ưu cũ còn lưu trong cache; PM kiểm lại ảnh góc phải. Không sửa vùng assistant/auth.

## FE-04 → FE-09 · Các trang (Codex: FE-04, FE-05, FE-08 · Antigravity: FE-06, FE-07, FE-09)

Làm theo mục tương ứng trong `docs/design/fe-redesign.md`. Mỗi ticket kèm ảnh chụp trước và sau ở 1440px và 390px (lưu tạm, không commit ảnh), và danh sách file đã sửa.

- **FE-04 · Codex 28/11/2026 — CHỜ NGHIỆM THU (sửa nghiệm thu).** Giữ Inter variable tự lưu trữ và khung 72/56px. Sửa `.empty-state p` thành `max-width: min(440px, 100%)`, cho phép ngắt từ; đặt CSS import đầu file và border-box; nối lại bảng nhật ký §10. Ảnh header đã map tới welcome, lấy PNG trực tiếp trong FE-03. `pnpm typecheck` chỉ lỗi route Google cũ; `pnpm test`: 576 test web và các package đạt, chỉ suite route Google không nạp được. PM kiểm lại ảnh 390px và hiển thị font Windows theo lựa chọn người dùng.
- **FE-05 · Codex 28/11/2026 — CHỜ NGHIỆM THU (sửa nghiệm thu).** Giữ hero/form trắng/gợi ý và kết quả khách sạn đã nộp. Bổ sung `min-width: 0`, border-box và track `minmax(0, 1fr)` cho ô tìm/ngày; giới hạn bề ngang hero và wrapper, bỏ container lồng bị trừ lề lần hai trên `/search`. Nút tìm disabled có opacity 1, nền surface-muted/chữ text-muted; nút thường coral/trắng. File sửa lại: `discovery/{stay-search,ota-home-motion,ota-hero,hotel-listing}.module.css`. `pnpm typecheck` chỉ route Google cũ; `pnpm test`: 576 test web và các package đạt, chỉ suite route Google không nạp được. Chưa chụp lại theo chỉ định người dùng; PM kiểm lại tràn ngang ở 1440/390px.
- **FE-08 · Codex 28/11/2026 — CHỜ NGHIỆM THU (sửa nghiệm thu).** Sửa nguyên nhân chỉ thấy ảnh nền: `home-screen.tsx` còn dùng class đã xoá của CSS trang chủ; chuyển sang `inspiration-page.module.css`, đặt ảnh fill trong lớp riêng ở sau nội dung, không bắt thao tác. Tách `FeedStatus`: khung giữ chỗ khi tải; `ApiErrorNotice` + nút Thử lại gọi refetch khi lỗi; `vini-guide.png` + Chưa có bài nào + nút chính khi rỗng. Giữ handler/API hiện có. Thanh `segmented-tabs` giới hạn width/max-width 100%, min-width 0 và cuộn nội bộ; bỏ rule 2×2/xung đột flex cũ, tô tab theo aria-selected. Sửa `feed-status.test.tsx` dùng `copy.api.network` (không có networkError). File: `discovery/{home-screen.tsx,home-screen.test.tsx,inspiration-page.module.css}`, `social/feed/{feed-status.tsx,feed-status.test.tsx,social-feed-view.tsx,social-feed.module.css,recommend-tabs-responsive.test.ts}`. Kiểm: 7/7 test tập trung đạt; `MODEL_PROVIDER=fake pnpm typecheck` chỉ lỗi thiếu route Google cũ; `MODEL_PROVIDER=fake pnpm test`: 581/581 test web và các package đạt, chỉ suite route Google không nạp được. CSS parse và `git diff --check` đạt. Theo lựa chọn chỉ sửa mã của người dùng, PM kiểm lại trang thực tế ở 1440/390px; không tự chuyển XONG.

- **FE-12 · Codex 28/11/2026 — CHỜ NGHIỆM THU.** Làm lại logo theo yêu cầu trực tiếp, bỏ biểu tượng chữ V: khung mở bất đối xứng, dải đường cong và điểm sáng; wordmark VinTrip outline Inter 740/opsz 32. Đồng bộ `public/brand/{vintrip-logo.svg,vintrip-logo-white.svg,vintrip-mark.svg}`, brand README và version favicon trong `app/layout.tsx`. Giữ viewBox/tên file để các màn dùng chung nhận tài nguyên mới; không thêm màu ngoài palette. SVG dùng token với fallback cùng giá trị để trình raster/favicon đọc đúng. Kiểm raster SVG gốc 142px/32px khớp màu token, đã xem icon 16px trong bản tổng hợp; không nhúng ảnh raster hoặc phụ thuộc font/text. `MODEL_PROVIDER=fake pnpm typecheck`: chỉ lỗi route Google cũ; `MODEL_PROVIDER=fake pnpm test`: 789 test web và các package đạt, chỉ suite route Google không nạp được. `git diff --check` đạt. PM kiểm ảnh trang 1440/390px theo lựa chọn người dùng; không tự chuyển XONG.

---

## FE-13 · Hero và phông chữ (Codex)

**Codex 28/11/2026 — CHỜ NGHIỆM THU.** Theo cập nhật trực tiếp sau commit f65d576: bỏ Great Vibes và Inter web, dùng next/font/google Be Vietnam Pro 400/500/600/700 + Dancing Script 600/700, preload subset Latin/tiếng Việt và gắn cả hai biến trên html. Hero có h1 VinTrip và slogan mới, chỉ hai dòng này dùng --font-script 700; cỡ desktop khoảng 89/40px ở 1440px, mobile 48/26px, line-height 1.15. Ảnh ocean-park-lagoon.jpg cover tại 50% 35%, phủ overlay-heavy; tương phản trắng tối thiểu 7,58:1 ngay trên ảnh trắng. Đồng bộ đúng các chuỗi slogan được cho phép trong i18n; không có test nào còn khớp slogan cũ. Tài nguyên/font: layout.tsx, globals.css (chỉ bỏ font-face Inter), discovery/ota-hero.{tsx,module.css}, i18n/src/{vi,seo,demo,api}.ts, brand/{README.md,fonts/README.md,ocean-park/SOURCES.md}; xoá great-vibes.woff2, GreatVibes-OFL.txt, fonts/InterVariable.woff2. Nguồn ảnh đã đối chiếu file gốc Wikimedia: Newone-white sand on Ngoc Trai lake, VOP.jpg, Newone, CC BY-SA 4.0.

Kiểm: MODEL_PROVIDER=fake pnpm test: 790/790 test web và các package đạt; chỉ suite route Google mobile có sẵn không nạp được (FE-14). MODEL_PROVIDER=fake pnpm typecheck: chỉ lỗi TS2307 thiếu app/auth/google/mobile/route.ts có sẵn (FE-14), các package đạt. CSS parse và git diff --check đạt. Trang chủ localhost:3100 trả HTTP 200, HTML/CSS đã gắn hai font và tải đủ 18 subset WOFF2; kiểm cmap toàn bộ slogan + ỗ/ộ/ữ/ớ ở mọi trọng lượng đều có glyph. Công cụ mở trình duyệt hết thời gian chờ, chưa xác nhận bằng mắt trên Windows hoặc ảnh 1440/390px; PM kiểm lại phần hiển thị thực tế.

## FE-13b · Ảnh hero giữ màu gốc (Codex)

**Codex 28/11/2026 — CHỜ NGHIỆM THU.** Hero trỏ tới ocean-park-beach.jpg, cover tại 50% 60%; bỏ div/class overlay phủ kín ảnh. Chỉ thêm gradient trong copy::before: đen 35% ở mép trái, 12% tại 40%, trong suốt từ 65% trở đi, và bóng mềm cho h1/slogan. Màu qua token --color-tab-bar/--color-background, không filter blur/brightness, không opacity ảnh. 35% bề ngang phía phải không có gradient; giữ bố cục/font hiện có.

File ảnh nhóm nêu chưa có trong repo lúc nhận việc; người dùng xác nhận được lấy ảnh mô tả/quảng cáo Vinhomes Ocean Park 1. Lưu bản cùng bức ảnh tham chiếu từ CDN OneHousing, JPEG 1189×783 (316.133 byte); không chỉnh màu hoặc làm mờ. SOURCES.md có nguyên dòng nguồn do nhóm yêu cầu và làm rõ bản tải thay thế từ bài Sapphire 1; chưa xác minh tác giả/giấy phép, chỉ dùng bài học trong trường. Giữ nguyên ocean-park-lagoon.jpg cùng dòng nguồn CC BY-SA của ảnh cũ.

File sửa: discovery/ota-hero.{tsx,module.css}, public/brand/ocean-park/{ocean-park-beach.jpg,SOURCES.md}, bảng FE và nhật ký spec §10. CSS parse/kiểm object-position, không filter/opacity, gradient trong suốt tại 65% và git diff --check đạt. MODEL_PROVIDER=fake pnpm test: 790/790 test web và các package đạt, chỉ suite Google mobile thiếu route có sẵn không nạp được (FE-14). MODEL_PROVIDER=fake pnpm typecheck: chỉ lỗi TS2307 của route này, các package đạt. Chưa xác nhận trực tiếp độ dễ đọc/tràn ngang ở 1440/390px: Computer Use đã dừng do không xác định chắc URL Chrome; đã dừng thao tác trình duyệt, PM kiểm ảnh thực tế.

## FE-11 · Nút chính bị khoá (phần Codex)

**Codex 28/11/2026 — CHỜ NGHIỆM THU.** Chỉ sửa app/globals.css: .primary-button:disabled dùng nền --color-surface-muted và chữ --color-text-muted, bỏ opacity 0.6, giữ cursor/handler/trạng thái disabled hiện có. Selector :disabled có độ ưu tiên cao hơn body .primary-button của fe-shell.css nên nền/chữ không bị kiểu nút thường ghi đè; hiệu ứng ripple đã loại trừ nút disabled. Không sửa vùng Antigravity. CSS parse, kiểm rule màu/không opacity và git diff --check đạt. Kiểm MODEL_PROVIDER=fake pnpm test: 790/790 test web và các package đạt, chỉ suite Google mobile không nạp được do route thiếu có sẵn (FE-14). MODEL_PROVIDER=fake pnpm typecheck: chỉ lỗi TS2307 của route này, các package đạt. Chưa kiểm hình ảnh qua trình duyệt (công cụ kết nối hết thời gian chờ ở FE-13); PM kiểm lại trang 1440/390px.

## FE-16 · Đổi tên chatbot thành VinTrip (Codex)

**Codex 28/11/2026 — CHỜ NGHIỆM THU.** Đổi tên/câu chữ hiển thị Vini/VINI thành VinTrip/VINTRIP trong i18n; assistant.name = VinTrip, subtitle = Chồn nhỏ đồng hành cùng bạn, lời chào và các nhãn chat/kỳ ở đồng bộ; sửa busy thành câu tự nhiên. Đồng bộ các nhãn liên quan trong i18n/src/{assistant,ota,mobile,api,ai-usage,user-activity,flights,summary}.ts; demo.ts feed.initials = VT. Không còn “rái cá” trong i18n, kể cả nhãn khung avatar viết hoa.

Prompt assistant-responder.v5.md: đổi tên/persona, cách xưng và ví dụ; đã đối chiếu để bảo đảm mọi luật còn lại giữ nguyên. Người dùng xác nhận mở rộng phần câu trả lời dự phòng backend: chỉ đổi tên/persona trong app/services/assistant/social.py và skills/{booking_draft,cancel_policy,c3_flow,verified_itinerary}.py, giữ nguyên xử lý/regex/nhánh điều kiện. Đối chiếu từng file với HEAD xác nhận ngoài phép thay tên/persona không có thay đổi khác; Python parse đạt. Không sửa codebase/, không đổi tên file ảnh hoặc biến/component. Không có assertion test hiện có so khớp cứng tên/mô tả cũ cần cập nhật.

Kiểm: MODEL_PROVIDER=fake pnpm test — 790/790 test web và các package đạt, chỉ suite route Google mobile thiếu có sẵn không nạp được (FE-14). Trong vintrip/ai, MODEL_PROVIDER=fake LLM_PROVIDER=fake .venv/Scripts/python.exe -m pytest -q: 1362 passed, 8 skipped. MODEL_PROVIDER=fake pnpm typecheck: chỉ TS2307 thiếu app/auth/google/mobile/route.ts có sẵn (FE-14), các package đạt. rg -n -i 'rái cá' packages/i18n/src: không có kết quả; git diff --check đạt.

## FE-15 · Khung lập lịch Công viên Mẫu trên trang chủ (Codex)

**Codex 28/11/2026 — CHỜ NGHIỆM THU.** Tách park-planner-api.ts chỉ dùng hợp đồng CONTRACTS §8: POST {NEXT_PUBLIC_API_URL}/ai/c1/ask với body { text }, chuyển AbortSignal, kiểm đúng HTTP 200 và đủ trường/kiểu trace. ParkPlanner dùng chung cho trang chủ và /c1, có trạng thái trống/chờ/lỗi/kết quả; khoá form khi chờ, ref chặn gửi trùng trước cả lần render tiếp, huỷ request khi rời trang, retry không tự hiện mẫu. Nhãn đủ 8 status của hợp đồng, giá trị lạ có kiểu trung tính (kể cả tên trùng thuộc tính prototype). Output hiển thị pre-wrap, trace mở bằng details.

Nút Xem kết quả mẫu chỉ có ở trạng thái trống/lỗi; người dùng phải bấm mới xem. park-planner-sample.ts chép nguyên văn output/câu hỏi C1-01 từ eval/run-4.csv và đủ 10 bước kind/name/latency_s theo thứ tự trong traces/run-4.jsonl; giữ tên Vini của bản ghi lịch sử. Có dải Kết quả mẫu từ lượt chạy run-4 (model gpt-6-luna), trang này không gọi model và ghi câu hỏi gốc để không nhầm với nội dung đang nhập. Đối chiếu nguồn bằng script Python đạt (output, câu hỏi, status, snapshot, trace và model).

Đặt #lich-vui-choi giữa OtaHomeRecommendations và HomeStayPreview; giữ nguyên file/khung VINTRIP TICKET/mép giấy. Thêm tab Lịch vui chơi cạnh Vé máy bay, href /#lich-vui-choi, cùng flightTab. Card dùng token và --font-sans, hai cột ở desktop/một cột dưới 768px, min-width 0 và wrap output/trace, nút/chip/summary ≥44px, focus rõ và reduced-motion. Chỉ thêm chuỗi i18n mới (park-planner.ts và khoá vi.parkPlanner).

File: app/c1/page.tsx; discovery/{park-planner-api.ts,park-planner.tsx,park-planner.module.css,park-planner-sample.ts,live-search-screen.tsx,ota-home-sections.tsx} và 3 file test; packages/i18n/src/{park-planner.ts,vi.ts}; bảng FE và nhật ký spec §10. Không sửa vintrip/ai, codebase, packages/api-client hoặc các bản ghi eval/trace; không chạy backend/model.

Kiểm: 25 test tập trung đạt (URL/body/schema, 200, 500 không tự lấy mẫu, khoá/chặn gửi trùng, bấm xem mẫu từ trống/lỗi, trạng thái lạ, huỷ request, thứ tự section); MODEL_PROVIDER=fake pnpm test: 815/815 test web và các package đạt, chỉ suite route Google cũ thiếu file không nạp được (FE-14). Sau sửa kiểu CSS module/test: 25/25 test tập trung chạy lại đạt; MODEL_PROVIDER=fake pnpm typecheck chỉ còn lỗi TS2307 thiếu app/auth/google/mobile/route.ts có sẵn (FE-14), các package đạt. CSS parse/không màu cứng/git diff --check đạt. Chưa chụp trang thật ở 1440/390px: kết nối Computer Use tới localhost:3100 hết thời gian chờ service_info; PM kiểm lại viewport và việc đọc output/trace trên màn hình thực tế.

## Nhật ký nghiệm thu (Claude ghi)

| Thời điểm | Ticket | Kết quả | Bằng chứng |
|---|---|---|---|
| 27/11 | FE-01 | XONG | Token cam pastel ở `index.ts` + `tokens.css` (khớp nhau, test token đạt). Thêm `--radius-*`, `--shadow-*`, `--text-*`. Mọi cặp chữ/nền đã đo ≥ 4.5:1, riêng `text-subtle` 3.8:1 chỉ dùng trang trí. Chụp trang chủ và /hotels: token đã áp. Phần còn lệch ghi ở `docs/design/fe-redesign.md` mục 1.3. |
| 28/11 | FE-02 | XONG | Đặc tả mục 2–8 trong `docs/design/fe-redesign.md`: quy ước chung, linh vật (6 tư thế, thêm `vini-sad.png`), khung chung, trang chủ + `/search`, chi tiết khách sạn, vé máy bay, cảm hứng, trợ lý/giỏ/thanh toán/đặt chỗ/tài khoản/đăng nhập. Mọi token được nhắc đều có trong `tokens.css`. Chuyển `/search` sang FE-05 (Codex) vì dùng chung `features/discovery` với trang chủ; FE-06 còn trang chi tiết. Thêm `packages/i18n`, `packages/ui-web` vào vùng cấm sửa. Mở khoá FE-03, FE-04, FE-05, FE-08. |
| 28/11 | FE-06 | Rà sớm (chưa nộp) | Antigravity còn ĐANG LÀM, 6 file chưa commit, toàn bộ trong vùng của mình. Không thêm mã màu viết cứng; chữ trắng chỉ trên nền `coral`, `coral-ink`, `overlay-heavy` (đạt). typecheck: chỉ lỗi cũ `app/auth/google/mobile/route.ts`. test web 574/576: 2 test trượt ở `features/discovery/search-params.test.ts` (vùng Codex, có từ trước, Antigravity đã báo). Cần sửa trước khi nộp: `.barActions button` trong `cart.module.css` cao 36px, phải ≥ 44px. |
| 28/11 | FE-06 | XONG | Commit `c69803e`, đã gộp vào `vintrip` (`f52306c`). Chỉ sửa trong vùng Antigravity, không thêm mã màu viết cứng, chữ trắng chỉ trên nền đậm. Đủ các mục chính của đặc tả mục 5: thanh mục dính, ô điểm đánh giá, nhãn "Giá tốt", "Hết phòng" có `aria-disabled`, Vini khi không tìm thấy, băng ảnh scroll-snap, thanh đặt phòng dính đáy, reduced-motion, focus-visible. typecheck chỉ lỗi Google cũ; test 574/576 (2 lỗi thuộc Codex, nay đã sửa). PM tự chụp 1440/390 (không có backend, nên là trạng thái lỗi): không vỡ bố cục. Lệch nhỏ chấp nhận: không có nút chữ "Xem tất cả ảnh" (bấm ảnh mở bộ xem). Dòng lỗi bị cắt ở 390px do `.empty-state p` (max-width 440px) trong `globals.css`, thuộc Codex, chuyển cho FE-04. Nút 36px ở `cart-bar` có từ trước, chuyển cho FE-09. |
| 28/11 | FE-03 | LÀM LẠI | 6 ảnh đúng kỹ thuật (1024², nền trong suốt, < 400KB, có `vini-sad.png`, đã bỏ `tripi-*`). **Không đạt đặc tả mục 2:** ảnh là Teemo (mũ xanh có kính và lông đỏ, nhân vật của Riot Games), prompt trong `brand/vini/README.md` ghi rõ tên Teemo và League of Legends. Đặc tả và bảng việc yêu cầu nhân vật nguyên bản. Repo nằm trên GitHub và bài được trình bày công khai, không chỉ chạy trên máy. Làm lại theo brief mục 2, xoá dòng Teemo trong README. Thêm: ảnh linh vật nhỏ ở góc phải đầu trang vẫn là ảnh cũ, đổi sang `vini-welcome.png`. |
| 28/11 | FE-04 | LÀM LẠI | Đạt: đầu trang 72px, token, chân trang, trang 404 có nút chính, Inter tự lưu trữ, bỏ Playfair/Be Vietnam Pro, test shell đạt. Cần sửa: (1) `.empty-state p` trong `globals.css` có `max-width: 440px` làm chữ tràn ở 390px (thấy ở `/hotels/[id]` khi lỗi) → thêm `max-width: min(440px, 100%)` hoặc tương đương; (2) ảnh đại diện góc phải đầu trang (xem FE-03). Ghi chú: bảng nhật ký `spec.md` §10 có dòng trống giữa các hàng làm vỡ bảng, xoá các dòng trống đó. |
| 28/11 | FE-05 | LÀM LẠI | Đạt: hero có lớp phủ, ô tìm kiếm nổi, nhãn hiện rõ, gợi ý 4 cột, bỏ nền nước, `/search` có trạng thái rỗng kèm Vini, sửa 2 test điểm đến mặc định cho khớp commit `9832c08` (hợp lệ). Cần sửa: (1) **tràn ngang ở 390px** trên trang chủ và `/search`: thẻ tìm kiếm và hero rộng quá màn hình, cột "Ngày trả phòng" bị cắt; (2) nút "Tìm phòng trống" chữ trắng trên nền cam nhạt (kiểu bị làm mờ), không đạt 4.5:1. Nếu đây là trạng thái chưa chọn điểm đến thì dùng nền `--color-surface-muted` chữ `--color-text-muted`; bình thường thì dùng `--color-coral`. |
| 28/11 | Đính chính | — | Lỗi "tràn ngang ở 390px" ghi cho FE-05 và FE-06, và lỗi "`.empty-state p` bị cắt" ghi cho FE-04, là **sai do cách chụp**: Chrome trên Windows không thu cửa sổ nhỏ hơn khoảng 500px. Đo lại bằng giả lập thiết bị qua CDP (`scrollWidth` = 390) cho thấy trang chủ, `/search`, `/hotels/[id]`, `/flights`, 404 đều không tràn. Từ nay PM chụp 390px bằng CDP. |
| 28/11 | FE-03 | XONG (theo quyết định của người dùng) | 6 ảnh Teemo `vini-*.png`: 1024², nền trong suốt, < 400KB, có `vini-sad.png`, đã bỏ `tripi-*`, thêm `unoptimized` để tránh ảnh cũ trong cache; ảnh góc phải đầu trang đã là ảnh mới. Người dùng chọn giữ Teemo cho bài làm trong trường. PM không coi đây là nhân vật nguyên bản; rủi ro đã ghi ở mục "Linh vật". |
| 28/11 | FE-04 | XONG | Commit `ea716a0`. typecheck chỉ lỗi Google cũ; test web 576/576. Không sửa ngoài vùng. Đầu trang 72px có gạch dưới mục đang mở, chân trang, 404 có Vini và nút chính, Inter tự lưu trữ. Đã xoá dòng trống trong bảng §10 của `spec.md`. 404 ở 390px (CDP) không tràn. |
| 28/11 | FE-05 | XONG | Commit `bf501b2`. Đo màu nút "Tìm phòng trống" khi chưa chọn điểm đến: chữ `#8A5A44` trên `#FFF1E6`, đạt khoảng 5.2:1. Trang chủ và `/search` ở 390px (CDP) không tràn; các thẻ vượt mép ở trang chủ là băng cuộn ngang, đúng đặc tả. |
| 28/11 | FE-08 | LÀM LẠI | Commit `3cb0f0f`, test đạt, không sửa ngoài vùng, 1440 và 390 không tràn, nút tạo bài có icon nâu trên dải compose (đúng). **Thiếu trạng thái:** khi backend không chạy, vùng bảng tin chỉ có ảnh nền, không hiện đang tải, lỗi (`ApiErrorNotice` + "Thử lại") hay rỗng (`vini-guide.png` + "Chưa có bài nào" + nút). Theo đặc tả, mỗi trang phải có đủ 3 trạng thái. Kiểm thêm: ở 390px, tab `segmented-tabs` của thanh trên vượt mép phải. |
| 28/11 | FE-07 | LÀM LẠI | Commit `9ea1bd2` (đúng bản PM đã rà). Đạt: 0 mã màu viết cứng, không còn class nào bị `app/search` dùng, 1440 và 390 không tràn (CDP), test đạt. Cần sửa: (1) **bỏ ảnh linh vật khỏi `flight-banner.tsx`** (người dùng yêu cầu; ở 390px ảnh còn đè lên dòng giới thiệu); (2) nút "Tìm chuyến bay" khi bị khoá đang là chữ trắng trên `--color-coral` mờ 50%, khó đọc. Dùng kiểu khoá giống trang chủ: nền `--color-surface-muted`, chữ `--color-text-muted`, không dùng opacity; (3) ô ngày `.calendarGrid button` cao 36px, nâng lên 44px. |
| 28/11 | FE-09 | XONG | Commit `8e76043` + `756c23c`, đưa vào `vintrip` bằng cherry-pick (`67d07fc`, `4c6683a`) để không kéo FE-07 chưa đạt. Chỉ sửa trong vùng Antigravity, 0 mã màu viết cứng. Giữ nút "Dùng tài khoản demo" của Lim (chỉ hiện khi `NEXT_PUBLIC_VINTRIP_DEMO_ENABLED=true`, như bản gốc). typecheck chỉ lỗi Google cũ, test web 576/576. CDP: `/login`, `/register`, `/cart` (chuyển về đăng nhập) ở 1440 và 390 không tràn. Khung chia đôi, Vini, ô nhập có icon, nút chính/phụ đúng đặc tả 8.6. **Chưa xem được** tài khoản, thanh toán, đặt chỗ, trợ lý khi có dữ liệu (cần backend và đăng nhập). Nút "Đăng nhập" khi bị khoá mờ 55% (chữ trắng trên cam nhạt): WCAG không bắt buộc với nút bị khoá, chuyển sang FE-11 cho đồng bộ. |
| 28/11 | FE-15 | XONG | Commit `182b4bc`. `park-planner-api.ts` theo đúng `CONTRACTS.md` §8; `ParkPlanner` dùng chung cho trang chủ và `/c1`. CDP 1440 và 390: `#lich-vui-choi` nằm đúng giữa "Gợi ý dành cho bạn" và dải VINTRIP TICKET, có tab "Lịch vui chơi" `/#lich-vui-choi`, nút thấp nhất 44px, không tràn ngang. Kết quả mẫu chép nguyên văn C1-01 của run-4 (đủ 1475 ký tự), có dải "Kết quả mẫu… không gọi model". 0 mã màu cứng. Test web 815 đạt (chỉ còn lỗi route Google, FE-14). |
| 28/11 | FE-13b | XONG | Commit `a30b94d`. Ảnh biển hồ do nhóm cung cấp (`ocean-park-beach.jpg`, ghi rõ chưa xác minh giấy phép trong `SOURCES.md`). Bỏ lớp phủ tối toàn hero, không blur/giảm sáng; chỉ gradient nhẹ ở vùng chữ bên trái + text-shadow, dùng token. CDP 1440 và 390: ảnh giữ màu gốc, chữ đọc được, không tràn ngang. Lưu ý: đoạn cuối slogan nằm trên cát trắng, chỉ đọc được nhờ bóng chữ; nếu cần chắc tương phản thì tăng gradient vùng chữ ở FE-17. |
| 28/11 | FE-16 | XONG | Commit `ee6e4bb`. Chatbot tên "VinTrip", mô tả "Chồn nhỏ đồng hành cùng bạn"; prompt `assistant-responder.v5.md` và các câu trả lời dự phòng trong `vintrip/ai` xưng VinTrip (chỉ đổi chữ, không đổi logic). Đổi cả các câu nhắc tới chatbot ở i18n khác ("Hỏi VinTrip", "Nhờ VinTrip lên lộ trình"). Không còn "rái cá", `initials: 'TF'`, chữ "Vini" trong i18n. Không đụng `codebase/`. Test web 790, i18n 2, AI 1362 đạt. |
| 28/11 | FE-13 | XONG | Commit `a4dfa60`. Font nạp bằng `next/font/google`: CDP đo `h1` "VinTrip" dùng Dancing Script 89px, body dùng Be Vietnam Pro; bỏ Great Vibes và Inter, không còn tham chiếu. Slogan mới hiện đủ dấu (ỗ, ộ, ữ, ớ) ở 1440 và 390, không còn chuỗi "Thấy là thích". Ảnh biển hồ Ocean Park, nguồn ghi đúng file Wikimedia (Newone, CC BY-SA 4.0). 0 mã màu cứng. Test web 790 đạt (chỉ còn lỗi route Google, FE-14). **Việc tiếp (đưa vào FE-17):** lớp phủ `--color-overlay-heavy` phủ kín cả ảnh nên ở 1440 ảnh bị tối và đục; đổi sang gradient từ trái-dưới như `fe-polish-handoff.md` §3.3. CC BY-SA cần hiện ghi công tác giả ở trang (ví dụ chân trang hoặc chú thích nhỏ góc ảnh). |
| 28/11 | FE-11 | XONG | Commit `1ada3e8`: `.primary-button:disabled` bỏ `opacity`, nền `--color-surface-muted`, chữ `--color-text-muted`, giữ `cursor: wait` và rule riêng của `.travel-form`. Cùng kiểu với phần Antigravity. |
| 28/11 | FE-12 | XONG | Commit `d5122bd`: logo mới (đường cong + điểm sáng + chữ VinTrip cam), bỏ biểu tượng chữ V; đồng bộ 3 SVG và favicon. CDP trang chủ cổng 3100: logo hiện đúng ở thanh trên 1440 và 390, trang không tràn ngang. |
| 28/11 | FE-08 | XONG | Commit `94ef6d0`, chỉ sửa trong vùng Codex (+1 dòng nhật ký `spec.md`), 0 mã màu viết cứng, 76/76 test discovery + social đạt. CDP trên máy chủ thư mục chính (cổng 3100): 1440 và 390 không tràn trang (scrollWidth = innerWidth); ảnh nền không còn che bảng tin; khi không có backend hiện thông báo "Không kết nối được máy chủ" + nút "Thử lại"; ở 390px băng tab cuộn bên trong. Trạng thái đang tải và rỗng chỉ kiểm qua test (cần backend để xem thật). Lưu ý cho lần sau: cổng 3200 đang chạy worktree Antigravity, không dùng để nghiệm thu code của Codex. |
| 28/11 | FE-07 | Vẫn LÀM LẠI | Antigravity chưa nộp bản sửa: `flight-banner.tsx` vẫn có ảnh linh vật, `.calendarGrid button` vẫn 36px. Mục nút khoá chuyển sang FE-11. |
| 28/11 02:55 | FE-07 | XONG | Commit `de70289`: bỏ linh vật khỏi `flight-banner.tsx`, `.calendarGrid button` 44px. Không thêm mã màu. typecheck chỉ lỗi Google cũ, test web 576/576. CDP `/flights` 1440 và 390: không tràn, không còn ảnh đè chữ. Đã gộp `fe-antigravity` vào `vintrip`. |
| 28/11 02:55 | FE-11 (phần Antigravity) | XONG | Commit `7fee28a`: `.submitBtn:disabled` và `.searchButton:disabled` dùng `--color-surface-muted` + `--color-text-muted`, bỏ opacity; CDP `/login` 390 thấy nút khoá nền nhạt chữ nâu. Còn phần Codex: `.primary-button:disabled` trong `globals.css`. |
