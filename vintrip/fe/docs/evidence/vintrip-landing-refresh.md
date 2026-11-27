# VinTrip — cập nhật landing page

Ngày: 2026-11-27. Phạm vi và việc commit/push đã được người dùng duyệt trong chat.

## Thay đổi

- Thay ảnh hero bằng ảnh sông và núi do người dùng cung cấp; chuyển bảng màu sang xanh rừng/ngọc.
- Logo Outfit có ảnh lồng chữ, kính trong, phản sáng và bóng nổi; slogan Great Vibes, chữ chức năng Nunito. Font có giấy phép OFL kèm theo.
- Cân đối bố cục responsive, bỏ nhóm nhãn điểm đến theo yêu cầu, loại bỏ nguyên nhân React key trùng.
- Không thay đổi booking, thanh toán, API hoặc nghiệp vụ C1/C3.

## Kiểm tra thực tế

Thực hiện trong container web của stack local, thư mục `/repo`:

- `pnpm --filter @vintrip/web lint`: 0 lỗi, 29 cảnh báo có sẵn.
- `pnpm --filter @vintrip/web test src/features/discovery/ota-hero.test.tsx`: 1 test pass.
- `pnpm --filter @vintrip/tokens --filter @vintrip/i18n lint`: pass.
- `pnpm --filter @vintrip/tokens --filter @vintrip/i18n typecheck`: pass.
- `pnpm --filter @vintrip/tokens --filter @vintrip/i18n test`: 3 test pass.
- `pnpm --filter @vintrip/web typecheck`: fail do `mobile-google-return.test.ts` import route `app/auth/google/mobile/route` chưa có. Lỗi cũng xuất hiện trên bản nền trước thay đổi giao diện.
- Lượt chạy toàn bộ web trước đó: 90 file pass, 3 file fail; các lỗi search-params, gallery-lightbox và route Google mobile đã đối chiếu với bản nền, không thuộc thay đổi này.
- SVG parse hợp lệ; mask kính khớp chính xác outline chữ. Trang, logo và mask trả HTTP 200 sau rebuild Docker.
- Kiểm tra trực quan tại 320, 390, 768, 1024, 1280 và 1440 px: chữ hiển thị, không có tràn ngang.
- `git diff --check`: không có lỗi whitespace.

## Xem lại

Mở `http://localhost:3100/` sau khi chạy stack local. Ảnh evidence đã gửi trong chat, lưu ngoài repository tại `C:/Users/Admin/.codex/visualizations/2026/11/27/01a21d69-17bb-7ad3-a524-9a48f031de54/vintrip-liquid-glass.jpg`.

Không có mã task TF trong yêu cầu này; không tự tạo mã task hoặc bằng chứng benchmark.
