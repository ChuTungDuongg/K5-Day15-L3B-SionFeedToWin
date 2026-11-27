# Khai báo dùng AI

README của nhóm có mục "Dùng AI vào việc gì" (2–3 dòng, bắt buộc). Ghi chi tiết vào bảng dưới đây.

> Luật của đề: dùng AI để làm bài thoải mái, nhưng **ai không giải thích được phần có tên mình thì phần đó nhận 0 điểm**. Khai thiếu không bị trừ; giấu mới bị.

| Việc | Công cụ AI | AI làm gì | Người kiểm/sửa gì | Ai phụ trách |
|---|---|---|---|---|
| Thiết lập repo | OpenAI Codex | Chép starter kit của BTC, cập nhật README và thông tin nhóm đã biết, tạo môi trường Python, kiểm tra luồng với model giả | Nhóm cần kiểm lại phần thiết lập; chưa có xác nhận kiểm tay của nhóm | ____ |
| Code bản chạy thử | | | | |
| Mở rộng C3 trên nhánh vintrip | OpenAI Codex | Viết engine kiểm phương án chuyến bay bị huỷ, snapshot giả, bridge CLI, chat SSE, thẻ giao diện, kiểm thử và hướng dẫn demo; mọi giao dịch dừng ở bản nháp | Đã chạy kiểm thử tự động; nhóm cần kiểm tay dữ liệu, luồng và duyệt thay đổi trước commit. Chưa có xác nhận kiểm tay của nhóm | Chưa phân công |
| Prompt / thiết kế lời gọi mô hình | | | | |
| Đào data (viết script đếm, gợi ý nhãn) | | | Kiểm tay __ dòng, khớp __ | |
| Rà câu hỏi phỏng vấn / khảo sát | | Chỉ rà câu dẫn dắt | | |
| Viết câu thử (benchmark) | | | Mỗi câu thử có `source`; câu thử AI viết được ghi rõ | |
| Sinh data `synthetic` (nếu có) | | | Seed __ · kiểm tay __ dòng | |
| Chấm cột `pass` bằng LLM (nếu có) | | | Kiểm tra thủ công __ câu thử, khớp __/__ | |
| Slide, văn bản | | | | |

**Không dùng AI để:** tạo người được phỏng vấn, trích dẫn, câu trả lời khảo sát; sửa kết quả các lượt đã chạy (`eval/run-*.csv`, `cost/simulate-*.csv`, `traces/`).
