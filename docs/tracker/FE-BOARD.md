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

**Linh vật:** nhân vật **nguyên bản** của VinTrip, tên vẫn là Vini. Một sinh vật nhỏ lanh lợi kiểu "trinh sát du lịch": mắt to, mũ thám hiểm tông cam pastel, ba lô bản đồ, ống nhòm. Không sao chép nhân vật có bản quyền: không dùng kiểu mũ, ống thổi hay nấm đặc trưng của Teemo.

## Chia việc

| Mã | Việc | Người làm | Phụ thuộc | Trạng thái |
|---|---|---|---|---|
| FE-01 | Hệ thiết kế cam pastel: token màu, chữ, bo góc, bóng, trạng thái | **Claude** | — | XONG |
| FE-02 | Bản đặc tả giao diện từng trang (bố cục, câu chữ theo CRO, trạng thái rỗng/lỗi/đang tải) | **Claude** | FE-01 | XONG |
| FE-03 | Linh vật nguyên bản: 6 tư thế 3D nền trong suốt theo brief của PM | **Codex** | FE-01 | KẸT |
| FE-04 | Khung chung: thanh đầu trang, chân trang, thanh điều hướng điện thoại | **Codex** | FE-01, FE-02 | TODO |
| FE-05 | Trang chủ và trang kết quả tìm khách sạn `/search`: đầu trang, ô tìm kiếm, khối gợi ý, nền, danh sách + bộ lọc | **Codex** | FE-04 | TODO |
| FE-06 | Trang chi tiết khách sạn `/hotels/[id]`: ảnh, chọn phòng, tiện nghi, đánh giá | **Antigravity** | FE-01, FE-02 | TODO |
| FE-07 | Vé máy bay: tìm kiếm, kết quả, chi tiết | **Antigravity** | FE-01, FE-02 | TODO |
| FE-08 | Cảm hứng: bảng tin, reels, lịch trình mẫu, hồ sơ người dùng | **Codex** | FE-04 | TODO |
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

**Ghi chú Codex 28/11/2026 — KẸT: kiểm tra chung còn lỗi tìm kiếm (FE-05).** Theo yêu cầu mới của người dùng, dùng Teemo thay nhân vật nguyên bản; đã tạo 6 PNG trong `public/brand/vini/`, 1024×1024, alpha thật, 171.064–185.984 byte, thêm ảnh buồn vào `not-found.tsx`, ảnh chào trên hero, bỏ 3 PNG Tripi không còn dùng; prompt ở `vini/README.md`. Kiểm PNG bằng Sharp đạt. `pnpm typecheck`: chỉ lỗi route Google đã biết; `pnpm test`: 574 đạt, lỗi route Google và 2 test mặc định Nha Trang/Hà Nội có sẵn thuộc FE-05. Người dùng chọn để PM kiểm ảnh 1440px/390px; chưa tự chuyển CHỜ NGHIỆM THU khi test chung chưa đạt.

## FE-04 → FE-09 · Các trang (Codex: FE-04, FE-05, FE-08 · Antigravity: FE-06, FE-07, FE-09)

Làm theo mục tương ứng trong `docs/design/fe-redesign.md`. Mỗi ticket kèm ảnh chụp trước và sau ở 1440px và 390px (lưu tạm, không commit ảnh), và danh sách file đã sửa.

- **FE-04 · Codex 28/11/2026 — KẸT: chờ đặc tả FE-02.** Chưa có mục khung chung (header/footer/mobile nav) trong `fe-redesign.md`; chưa sửa giao diện. Đã kiểm phụ thuộc và phạm vi file.
- **FE-05 · Codex 28/11/2026 — KẸT: chờ đặc tả FE-02.** Mục 1.3 mới liệt kê điểm lệch màu, chưa có đặc tả trang chủ về bố cục, câu chữ và các trạng thái. FE-04 cũng đang kẹt; chưa sửa trang chủ.
- **FE-08 · Codex 28/11/2026 — KẸT: chờ đặc tả FE-02.** Chưa có mục cảm hứng/bảng tin/reels/lịch trình/hồ sơ trong tài liệu; FE-04 đang kẹt. Chưa sửa vùng social/discovery hoặc các trang tương ứng.

---

## Nhật ký nghiệm thu (Claude ghi)

| Thời điểm | Ticket | Kết quả | Bằng chứng |
|---|---|---|---|
| 27/11 | FE-01 | XONG | Token cam pastel ở `index.ts` + `tokens.css` (khớp nhau, test token đạt). Thêm `--radius-*`, `--shadow-*`, `--text-*`. Mọi cặp chữ/nền đã đo ≥ 4.5:1, riêng `text-subtle` 3.8:1 chỉ dùng trang trí. Chụp trang chủ và /hotels: token đã áp. Phần còn lệch ghi ở `docs/design/fe-redesign.md` mục 1.3. |
| 28/11 | FE-02 | XONG | Đặc tả mục 2–8 trong `docs/design/fe-redesign.md`: quy ước chung, linh vật (6 tư thế, thêm `vini-sad.png`), khung chung, trang chủ + `/search`, chi tiết khách sạn, vé máy bay, cảm hứng, trợ lý/giỏ/thanh toán/đặt chỗ/tài khoản/đăng nhập. Mọi token được nhắc đều có trong `tokens.css`. Chuyển `/search` sang FE-05 (Codex) vì dùng chung `features/discovery` với trang chủ; FE-06 còn trang chi tiết. Thêm `packages/i18n`, `packages/ui-web` vào vùng cấm sửa. Mở khoá FE-03, FE-04, FE-05, FE-08. |
