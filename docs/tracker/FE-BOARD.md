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
| FE-07 | Vé máy bay: tìm kiếm, kết quả, chi tiết | **Antigravity** | FE-01, FE-02 | LÀM LẠI |
| FE-08 | Cảm hứng: bảng tin, reels, lịch trình mẫu, hồ sơ người dùng | **Codex** | FE-04 | LÀM LẠI |
| FE-09 | Trợ lý Vini, giỏ hàng, thanh toán, đặt chỗ, tài khoản, đăng nhập | **Antigravity** | FE-01, FE-02 | TODO |
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
- **FE-08 · Codex 28/11/2026 — CHỜ NGHIỆM THU.** Bảng tin masonry 3 cột màn rộng/2 cột mobile, giữ handler/API lưu/thích/bình luận/chia sẻ; tim lưu 44px, chip cuộn ngang pastel, nút tạo bài nổi gradient có icon nâu và nằm trên thanh đáy. Reels 9:16, chú thích trên overlay-heavy. Timeline mỗi ngày một thẻ và nút 'Dùng lịch trình này' giữ URL cũ; hồ sơ avatar 96px/viền 4px, thống kê ngang/lưới bài. Thêm khung tải và guide/CTA cho feed/hồ sơ/tìm bài/Reels rỗng. Thông báo chưa đọc nền tint/chấm coral; sửa token màu thông báo không tồn tại, vùng bấm 44px. File: `features/social/**` (feed/post-card/social-feed-view/CSS, live-posts, public-profile/profile-post-wall, search-results-grid, trip-plan-view, social-empty-state, các CSS còn màu cứng), `features/notifications/web-notifications.css`, 2 màu trạng thái trong `app/globals.css`. `pnpm typecheck`: chỉ lỗi route Google cũ; `pnpm test`: 576/576 test web và các package đạt, chỉ suite route Google không nạp được. Parse 24 stylesheet đạt, không còn hex/rgb hoặc token màu không tồn tại trong social/notifications/onboarding; `git diff --check` đạt. Chỉ sửa mã theo lựa chọn người dùng; PM kiểm 1440px/390px và dữ liệu thật khi có backend.

---

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
| 28/11 | FE-07 | LÀM LẠI | Chưa commit (4 file trong `features/flights`). Đạt: 0 mã màu viết cứng, không còn class nào bị `app/search` dùng, 1440 và 390 không tràn (CDP), test đạt. Cần sửa: (1) **bỏ ảnh linh vật khỏi `flight-banner.tsx`** (người dùng yêu cầu; ở 390px ảnh còn đè lên dòng giới thiệu); (2) nút "Tìm chuyến bay" khi bị khoá đang là chữ trắng trên `--color-coral` mờ 50%, khó đọc. Dùng kiểu khoá giống trang chủ: nền `--color-surface-muted`, chữ `--color-text-muted`, không dùng opacity; (3) ô ngày `.calendarGrid button` cao 36px, nâng lên 44px; (4) commit `[FE-07]`. |
