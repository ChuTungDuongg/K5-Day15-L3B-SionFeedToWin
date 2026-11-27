# Đặc tả làm lại giao diện `vintrip/fe` — tông cam pastel

Tài liệu này là nguồn chuẩn cho các ticket FE-04 → FE-09 trong `docs/tracker/FE-BOARD.md`. Mục 1 do FE-01 làm (đã xong). Mục 2 trở đi do FE-02 viết.

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
- Thang chữ: `--text-xs` 12px · `--text-sm` 14px · `--text-base` 16px (cỡ chữ nội dung tối thiểu) · `--text-lg` 18px · `--text-xl` 22px · `--text-2xl` 28px · `--text-3xl` co giãn 32–52px (tiêu đề đầu trang). Chiều cao dòng 1.5 cho nội dung.

### 1.3 Còn lệch tông sau FE-01 (giao cho ticket trang)

- Trang chủ: lớp phủ hồng đậm ở đầu trang (`ota-hero.module.css`), mặt nước và nền hồng phần gợi ý (`LivingBackground.tsx`, `ota-home-motion.module.css`, `ota-home.module.css`) là mã màu viết cứng. Thuộc FE-05.
- Ảnh linh vật nhỏ ở góc trên phải vẫn là rái cá cũ. Thuộc FE-03.
- Trang chủ hiện "1 Issue" của Next.js ở chế độ dev; `/hotels` không có tham số thì báo "Chuyến đi này chưa có trong danh mục". Kiểm trong FE-05 và FE-06.
