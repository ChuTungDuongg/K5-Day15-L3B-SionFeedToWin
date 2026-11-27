# Bộ linh vật — FE-03

Ngày 28/11/2026, người dùng đổi yêu cầu từ nhân vật nguyên bản của FE-02 sang **Teemo**. Bộ này làm theo yêu cầu mới; không mô tả Teemo là nhân vật nguyên bản của Vintrip. Giữ tên file `vini-*` để các màn hình dùng chung không phải đổi hợp đồng tài nguyên.

Công cụ: `image_gen` tích hợp của Codex. Ảnh chào là tham chiếu nhận diện cho năm tư thế còn lại. PNG 1024×1024, alpha trong suốt thật; đã nén palette bằng Sharp, không giữ nền ô caro hoặc nền trắng. Các bản gốc do ImageGen tạo vẫn được giữ ngoài repo trong thư mục generated_images.

Prompt nhận diện: Teemo the cheerful small yordle scout from League of Legends, polished soft matte 3D toy style; fluffy cream-white face with broad cheek tufts, small dark nose, warm tan/brown fur, classic green scout cap with bronze goggles and red feather, brown travel backpack, orange-red scarf, green scout outfit and boots. Three-quarter front view, warm upper-left light, full body inside margins, approximately 80% canvas. Genuine alpha transparency; no text, logo, weapons, ground plane or background.

Prompt từng tư thế (giữ nhận diện, ánh sáng và góc máy của ảnh chào):

- `vini-welcome.png`: waving hello with one hand, smiling warmly.
- `vini-curious.png`: head tilted, eyes opened curiously, holding travel binoculars up and peering through them.
- `vini-planning.png`: holding an unfolded paper map and a small pencil, focused friendly expression.
- `vini-guide.png`: standing upright, one arm pointing toward the right edge, friendly reassuring smile.
- `vini-success.png`: jumping joyfully with both arms raised high, legs slightly bent mid-air, smiling.
- `vini-sad.png`: sitting down, cap slightly tilted, sad open eyes, soft small mouth, no tears.

Các ảnh Tripi PNG cũ không còn được tham chiếu đã được gỡ. PM kiểm tra ảnh trang ở 1440px và 390px theo lựa chọn của người dùng; Codex không khẳng định đã kiểm tra trực quan trang bằng trình duyệt.
