# Reflection: Nguyễn Thiên Bảo

> Mã học viên 2A202603861 · 26ai.baont5@vinuni.edu.vn · GitHub [Limdim1604](https://github.com/Limdim1604) · SionFeedToWin, L3B, Track C

1. **Vai trò và phần mình làm:**
   - **Kế hoạch:** lập kế hoạch cho nhóm từ CP1 đến demo, cập nhật TEAMS và canvas (`18ee60d`, `d2ed6c4`).
   - **Khảo sát:** soạn Google Form, đi khảo sát, ghi kết quả vào [results-c1.csv](../evidence/survey/results-c1.csv).
   - **Backend và luồng C1 (phần chính):**
     - Agent 6 công cụ, beam search xếp giờ và validator: [c1_flow.py](../codebase/c1_flow.py), [park_engine.py](../codebase/park_engine.py) (`f42e681`).
     - Module `park-plans` trên core-api, kiểm lại lịch trên snapshot (`9b105da`).
     - Đọc đơn vị tiền và chiều cao, xử lý suất diễn bị huỷ (`09c3a12`).
     - API `/c1/ask` nối từ chat Vini (`d92ffc8`, `aca9db9`).
   - **Đánh giá và video:** chạy eval C1 và C2 (`c08daf9`), làm video demo 3 phút.

2. **AI hỗ trợ mình thế nào:**
   - **Công cụ:** Claude Code.
   - **Việc nhờ AI:** viết code backend C1, checker eval, script quay web, lồng tiếng TTS và dựng video bằng HyperFrames.
   - **Chỗ phải sửa lại:**
     - AI gọi API sai tên trường (`question` thay vì `text`) và chọn sai giờ hiệu lực ở C2.
     - Lời thoại C3 nói có bản nháp đổi vé, trong khi giao diện chỉ liệt kê phương án.
     - Báo cáo viết điểm chấm nháp như kết quả cuối, nên mình ghi rõ là chưa duyệt.

3. **Một câu thử trượt và điều mình học được:**
   - **Câu trượt:** [HO-14](../eval/c1-validation-review.md). Show 11:00 đã huỷ nhưng C1 vẫn xếp vào lịch và trả VALID. Trace không gọi `get_park_incidents`, nên bộ riêng chỉ đạt 19/20.
   - **Nguyên nhân:** validator chỉ kiểm lịch, không kiểm dữ kiện của hôm nay. Bước đọc sự cố lại phụ thuộc vào việc model nhớ gọi công cụ.
   - **Cách sửa (`09c3a12`):** code luôn đọc sự cố, loại suất bị huỷ và hỏi lại phụ huynh, kèm test hồi quy.
   - **Bài học:** điều kiện cứng phải do code kiểm. Điểm tổng cao không chứng minh được hệ thống không còn lỗi nghiêm trọng.
