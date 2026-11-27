# Bảng việc làm lại giao diện `vintrip/fe` — Claude giao và nghiệm thu · Claude + Codex cùng làm

> **Mục tiêu:** làm lại toàn bộ giao diện `vintrip/fe` theo tông **cam pastel**, giữ nguyên phạm vi (trang chủ, khách sạn, vé máy bay, cảm hứng, trợ lý, đặt chỗ, tài khoản) và giữ nguyên chức năng, API. **Chỉ đổi giao diện.**
> **Dựa vào bản hiện tại:** giữ bố cục đang chạy tốt (ô tìm kiếm, thẻ gợi ý, thanh điều hướng điện thoại), bỏ những gì nặng và rối (lớp phủ đậm ở đầu trang, mặt nước động nhiều lớp).
> **Thứ tự ưu tiên:** CP3 lúc 10:00 sáng 28/11 chấm C1, nên Codex làm xong `docs/tracker/BOARD.md` (C1-02 → C1-06) **trước**, rồi mới nhận ticket ở bảng này. Claude làm FE-01 → FE-03 song song ngay.

## Hướng thiết kế

**Cảm giác:** ấm áp, nhẹ nhàng, thân thiện với gia đình. Nhiều khoảng trắng, góc bo tròn, bóng đổ mềm, ảnh thật làm điểm nhấn.

**Bảng màu cam pastel** (độ tương phản đã đo, đều đạt AA):

| Vai trò | Màu | Chữ đi kèm | Tương phản |
|---|---|---|---|
| Nền trang | `#FFF8F2` kem | `#3D2418` nâu đậm | 13.6:1 |
| Chữ phụ | `#8A5A44` | trên nền kem | 5.5:1 |
| Nút chính | `#FFB98A` cam pastel | `#7A2E0E` nâu | 5.65:1 |
| Nút phụ / thẻ | `#FFE8D6` đào | `#7A2E0E` | 8.0:1 |
| Viền, nền nhạt | `#FFD3B0` | `#7A2E0E` | 6.8:1 |
| Liên kết, nhấn mạnh | `#C2410C` cam cháy | trên nền kem | 4.9:1 |
| Đạt / thành công | `#CDEEDF` mint pastel | `#2F5D50` | 6.0:1 |

- **Không dùng chữ trắng trên cam pastel** (chỉ đạt 3:1).
- Cần chữ trắng thì dùng nền `#C2560F` (4.5:1).

**Linh vật:** nhân vật **nguyên bản** của VinTrip, tên vẫn là Vini. Một sinh vật nhỏ lanh lợi kiểu "trinh sát du lịch": mắt to, mũ thám hiểm tông cam pastel, ba lô bản đồ, ống nhòm. Không sao chép nhân vật có bản quyền: không dùng kiểu mũ, ống thổi hay nấm đặc trưng của Teemo.

## Chia việc

| Mã | Việc | Người làm | Phụ thuộc | Trạng thái |
|---|---|---|---|---|
| FE-01 | Hệ thiết kế cam pastel: token màu, chữ, bo góc, bóng, trạng thái | **Claude** | — | XONG |
| FE-02 | Bản đặc tả giao diện từng trang (bố cục, câu chữ theo CRO, trạng thái rỗng/lỗi/đang tải) | **Claude** | FE-01 | TODO |
| FE-03 | Linh vật nguyên bản: brief + 6 tư thế 3D nền trong suốt | **Claude** | FE-01 | TODO |
| FE-04 | Khung chung: thanh đầu trang, chân trang, thanh điều hướng điện thoại | **Codex** | FE-01, FE-02 | TODO |
| FE-05 | Trang chủ: đầu trang, ô tìm kiếm, khối gợi ý, nền | **Codex** | FE-04 | TODO |
| FE-06 | Khách sạn: danh sách, bộ lọc, chi tiết, chọn phòng | **Codex** | FE-04 | TODO |
| FE-07 | Vé máy bay: tìm kiếm, kết quả, chi tiết | **Codex** | FE-04 | TODO |
| FE-08 | Cảm hứng: bảng tin, reels, lịch trình mẫu, hồ sơ người dùng | **Codex** | FE-04 | TODO |
| FE-09 | Trợ lý Vini, giỏ hàng, thanh toán, đặt chỗ, tài khoản, đăng nhập | **Codex** | FE-04 | TODO |
| FE-10 | Nghiệm thu từng ticket của Codex và rà tổng thể cuối cùng | **Claude** | mỗi ticket Codex | liên tục |

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

## FE-03 · Linh vật nguyên bản (Claude)

Brief nhân vật và 6 tư thế 3D nền trong suốt: chào, tò mò, lập kế hoạch, hướng dẫn, thành công, buồn (dùng cho trang lỗi). Thay vào `public/brand/vini/`, giữ tên file để không phải sửa code.

## FE-04 → FE-09 · Các trang (Codex)

Làm theo mục tương ứng trong `docs/design/fe-redesign.md`. Mỗi ticket kèm ảnh chụp trước và sau ở 1440px và 390px (lưu tạm, không commit ảnh), và danh sách file đã sửa.

---

## Nhật ký nghiệm thu (Claude ghi)

| Thời điểm | Ticket | Kết quả | Bằng chứng |
|---|---|---|---|
| 27/11 | FE-01 | XONG | Token cam pastel ở `index.ts` + `tokens.css` (khớp nhau, test token đạt). Thêm `--radius-*`, `--shadow-*`, `--text-*`. Mọi cặp chữ/nền đã đo ≥ 4.5:1, riêng `text-subtle` 3.8:1 chỉ dùng trang trí. Chụp trang chủ và /hotels: token đã áp. Phần còn lệch ghi ở `docs/design/fe-redesign.md` mục 1.3. |
