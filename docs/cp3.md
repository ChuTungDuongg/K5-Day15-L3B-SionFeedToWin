# CP3 · VinTrip · SionFeedToWin · L3B · Track C

## Ô 1 · Bằng chứng

[Bằng chứng C1 của nhóm](https://github.com/ChuTungDuongg/K5-Day15-L3B-SionFeedToWin/blob/vintrip/evidence/summary.md)

Nhóm mình muốn biết liệu có thể dựa vào thời gian chờ niêm yết để căn giờ xem show cho gia đình hay không. Với trò Kilimanjaro Safaris, nhóm đối chiếu được 260 mốc trong năm 2018 có cả thời gian niêm yết và thời gian khách thực chờ. Có 20 mốc khách chờ lâu hơn ít nhất 10 phút (7,7%). Khảo sát của nhóm có 4 dòng đi cùng trẻ nhỏ trong 10 dòng gắn nhãn người dùng thật, nên nhóm chỉ dùng khảo sát để bổ sung bối cảnh. [Cách đếm và 5 ví dụ](../evidence/data-mining.md)

## Ô 2 · Video

Đội trưởng dán link video 30 giây của đội, đặt quyền xem qua liên kết và mở thử bằng cửa sổ ẩn danh.

## Ô 3 · Kết quả lượt 1

> Nhóm mình thử 30 câu, gồm 14 câu thường, 11 câu khó và 5 câu từ chối. Ở lượt đầu (run-1@20261127-231617), bản chấm nháp hồi cứu ghi 25/30 câu đạt (83,3%); một câu hết thời gian chờ. Lượt đã ghi đủ điểm (run-4@20261127-234013) đạt 29/30 (96,7%). Câu C1-17 từ chối đúng nhưng thiếu bước kiểm lịch mà tiêu chí yêu cầu, nên nhóm giữ điểm 0. Hai lượt này chạy trước khi thêm bước model chọn trò. Phần còn chờ là một người thứ hai đối chiếu độc lập 5 câu.

[Điểm từng câu run-4](../eval/run-4.csv) · [Báo cáo và điểm lượt đầu](../eval/report.md) · [Phiếu đối chiếu bởi người](../eval/doi-chieu-5.md)

## Bản chạy dùng để demo

Mở `python codebase/web_demo.py` từ gốc repo. Hai tình huống đã chạy giữ nguyên gia đình, thời gian và ngân sách. Khi bé thích thiên nhiên, model chọn Vườn sinh thái (A1); khi bé thích game, model chọn Khu trò chơi điện tử (E2). Solver đưa trò đã chọn vào lịch và validator xác nhận cả hai lịch hợp lệ trên dữ liệu mô phỏng. [Hai trace model thật](../validation/c1-model-choice.json) · [Spec §0–7](../spec.md)

Phiên bản chọn trò đã chạy thử đủ 30 câu với gpt-6-luna (run-try@20261128-092922), 0 lỗi kỹ thuật. Checker xác nhận căn cứ 25/25 và lịch VALID 14/14. Đây là lượt thử của phiên bản mới, chưa chấm hai metric quy định người chấm. [CSV](../validation/cp3-run-try.csv) · [Trace](../validation/cp3-run-try.jsonl)

[Form 2 của BTC](https://docs.google.com/forms/d/e/1FAIpQLSdFqBLvf--GLbTUQ2vcFkkDGsgT-LGT7oftBG_x8Pk-gMVwg/viewform)
