# Vintrip preview assets

Bundled from the approved mobile/design handoff. Font and photo attribution is recorded in `apps/mobile/assets/brand/README.md`.

- Web fonts: Be Vietnam Pro (body, weights 400–700) and Dancing Script (hero title/slogan only, weights 600–700), loaded and self-hosted by `next/font/google` with Latin and Vietnamese subsets. Sources: [Be Vietnam Pro](https://github.com/bettergui/BeVietnamPro) and [Dancing Script](https://github.com/impallari/DancingScript), both under the SIL Open Font License 1.1. Legacy `regular.ttf` and `bold.ttf` remain for existing public-asset test references; they are not loaded by `globals.css`. Inter and Great Vibes are no longer loaded or bundled as web fonts. The logo's existing Inter outlines remain vector paths.
- Mascot PNGs in `vini/` were replaced for FE-03; prompts and the user's Teemo direction are recorded in [`vini/README.md`](vini/README.md).
- Destination and hotel photographs illustrate the UI; they are not verified catalog media.
- `home-hoi-an-lanterns.jpg` is [Khoi Tran’s photograph of Hội An](https://unsplash.com/photos/a-tree-with-a-bunch-of-colorful-paper-lanterns-hanging-from-its-branches-NPIJb6T4tO4), available under the Unsplash License.
- `flight-sky.jpg` is [willy wo’s photograph of an airliner in the clouds](https://unsplash.com/photos/white-and-blue-airplane-under-white-clouds-during-daytime-pXnMG0FfSwA), available under the Unsplash License.
- `hotel-resort-4k.webp` is [Asad Photo Maldives’s resort photograph](https://www.pexels.com/photo/luxurious-overwater-bungalow-with-infinity-pool-at-sunset-30037427/), available under the Pexels License.
- `home-stays-ninh-binh.jpg` is [Florian Delée’s photograph of Ninh Bình](https://unsplash.com/photos/lush-green-karst-mountains-with-a-small-village-below-MshJQhMq94w), available under the Unsplash License.

## Logo VinTrip — FE-12 (28/11/2026)

- Biểu tượng mới: khung cửa mở bất đối xứng, dải đường cong và điểm sáng; bỏ hoàn toàn biểu tượng chữ V trong huy hiệu cũ. Hình học SVG được vẽ trực tiếp cho VinTrip.
- Bộ web: `vintrip-logo.svg` (nền sáng), `vintrip-logo-white.svg` (nền tối), `vintrip-mark.svg` (favicon/thông báo/fallback). Giữ tên và viewBox cũ để các màn dùng chung nhận tài nguyên mới.
- Wordmark VinTrip dùng outline Inter variable, wght 740 / opsz 32, chỉnh khoảng chữ thủ công; không phụ thuộc thẻ text hoặc font fallback của SVG. Giấy phép nguồn: fonts/OFL.txt.
- Màu dùng var(--color-…). SVG tải như ảnh độc lập không kế thừa token trang: các giá trị dự phòng và token nhúng đều lấy từ packages/tokens/src/tokens.css, không tạo màu mới. Giá trị dự phòng giúp các bộ raster SVG và favicon đọc đúng màu; không áp cách này vào CSS trang.
- Kiểm raster trực tiếp SVG gốc: logo 142px và icon 32px khớp màu đã chốt; bản tổng hợp có icon 16px. Người dùng giao PM kiểm ảnh trang thật.
