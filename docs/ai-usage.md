# Khai báo dùng AI

README của nhóm có mục "Dùng AI vào việc gì" (2–3 dòng, bắt buộc). Ghi chi tiết vào bảng dưới đây.

> Luật của đề: dùng AI để làm bài thoải mái, nhưng **ai không giải thích được phần có tên mình thì phần đó nhận 0 điểm**. Khai thiếu không bị trừ; giấu mới bị.

| Việc | Công cụ AI | AI làm gì | Người kiểm/sửa gì | Ai phụ trách |
|---|---|---|---|---|
| Thiết lập repo | OpenAI Codex | Chép starter kit, cập nhật README, cấu hình Python và kiểm luồng model giả | Kiểm lệnh check và đường chạy. Chưa có biên bản một người khác chạy lại từ bản sạch | Chu Nguyễn Tùng Dương điều phối |
| Thiết kế và code | OpenAI Codex, Antigravity, Claude Code theo khai báo spec §10 | Hỗ trợ luồng C1, công cụ, dữ liệu mô phỏng và sơ đồ. Code và log đã lưu, không coi log là checkpoint đã được nộp | Đối chiếu hợp đồng công cụ và testcase có sẵn. Model hiện diễn đạt cuối luồng, còn chờ hoàn thiện vai trò ở quyết định chính | Nguyễn Lê Trọng Mạnh theo phân công |
| Mở rộng C3 trên nhánh vintrip | OpenAI Codex | Viết engine kiểm phương án chuyến bay bị huỷ, snapshot giả, bridge CLI, chat SSE, thẻ giao diện, kiểm thử và hướng dẫn demo; mọi giao dịch dừng ở bản nháp | Đã chạy kiểm thử tự động; nhóm cần kiểm tay dữ liệu, luồng và duyệt thay đổi trước commit. Chưa có xác nhận kiểm tay của nhóm | Chưa phân công |
| Đếm và tổng hợp khảo sát | OpenAI Codex trong lần rà này | Đếm lại các nhãn CSV, nhóm đi cùng trẻ nhỏ, tần suất và thời gian chuẩn bị. Không tạo phản hồi mới | Dữ liệu CSV giữ nguyên. Nhóm còn cần đối chiếu bản khảo sát gốc và quyền trích dẫn | Hà Lê Duy theo phân công |
| Benchmark | Công cụ soạn trước đây chưa ghi đầy đủ trong repo | Bộ hiện có 30 câu, 11 câu dẫn xuất từ nguồn người dùng theo nhãn và 19 câu tự viết | Rà nguồn, giữ nguyên input/expected/pass_criterion ở lần kiểm này. Chưa có biên bản kiểm tay độc lập của người thứ hai | Nguyễn Thiên Bảo theo phân công |
| Dữ liệu mô phỏng | Chưa lưu đầy đủ prompt hoặc công cụ sinh ban đầu | Công viên Mẫu và các dữ liệu bổ trợ ghi nhãn mô phỏng trong data card | Không dùng làm bằng chứng người dùng thật. Seed của mô phỏng phiên là 42, không suy thành seed của mọi dataset | Người phụ trách dữ liệu cần xác nhận phần đã làm |
| Chấm chất lượng | Có checker Python và bản chấm nháp, có lượt đối chiếu bổ sung bằng model trên 5 output | Kiểm ngoại tuyến hai metric từ output/snapshot/trace, sửa riêng khác biệt CRLF/LF trên Windows | Run-4 đã ghi 30/30 điểm câu từ bản chấm của nhóm. Ngày 28/11/2026, thành viên nhóm duyệt 5/5 điểm đối chiếu do AI đề xuất. Chưa có phiếu chấm độc lập của người thứ hai | Nguyễn Thiên Bảo và người duyệt của nhóm |
| Rà checkpoint và văn bản | OpenAI Codex | Đối chiếu hai HTML do nhóm cung cấp, sửa trạng thái cũ, ghi các mục CP3/CP4 đang chờ | Nhóm xác nhận chưa làm/nộp CP3, chưa có slide/video và yêu cầu dùng dữ liệu hiện có | Chu Nguyễn Tùng Dương điều phối |
| Slide, video, reflection | Chưa thực hiện hoặc chưa có sản phẩm trong repo | Chưa có slide PDF, link video hay bài reflection cá nhân | Chờ nhóm thực hiện và xác nhận. Không tự tạo trải nghiệm hoặc biên nhận nộp bài | Cả bốn thành viên |

**Không dùng AI để:** tạo người được phỏng vấn, trích dẫn, câu trả lời khảo sát; sửa kết quả các lượt đã chạy (`eval/run-*.csv`, `cost/simulate-*.csv`, `traces/`).

Codex bổ sung bước model chọn trò, chạy hai tình huống lập lịch thật và đối chiếu bản chấm run-4 trên nhánh Manh. Codex chuẩn bị phiếu chấm trống cho người thứ hai, gửi 5 ca đã bỏ điểm cũ cho model đối chiếu bổ sung (khớp 5/5) và phân tích dữ liệu công khai của TouringPlans.
