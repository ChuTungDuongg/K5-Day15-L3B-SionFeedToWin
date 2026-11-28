# Reflection cá nhân: Nguyễn Thiên Bảo

- Mã học viên: 2A202603861
- Email: 26ai.baont5@vinuni.edu.vn
- GitHub: [Limdim1604](https://github.com/Limdim1604)
- Nhóm: SionFeedToWin, lớp L3B
- Dự án: VinTrip, Track C: Du lịch
- Vai trò: thành viên. Em lên kế hoạch cho nhóm, làm khảo sát, code luồng C1 và làm video demo.

## 1. Vai trò và phần em làm

**Kế hoạch.** Em lên kế hoạch cho cả nhóm, từ CP1 đến demo: chốt bài toán, chia việc theo [TEAMS.md](../TEAMS.md), sắp thứ tự các mốc và theo dõi đầu việc trên [bảng theo dõi](../docs/tracker/BOARD.md). Ở CP1, em cập nhật danh sách 4 thành viên và Track C (`18ee60d`), rồi điền [canvas](../canvas.md) cho bài toán (`d2ed6c4`).

**Khảo sát.** Em soạn Google Form, gửi đi khảo sát người từng tự lên lịch đi khu vui chơi, rồi gom câu trả lời vào [results-c1.csv](../evidence/survey/results-c1.csv). Mỗi dòng đều có nhãn `nguoi_dung_that` hoặc `tu_viet`, để nhóm chỉ đếm người thật khi nêu nhu cầu ([đối chiếu trường dữ liệu](../evidence/survey/questions.md)).

**Code luồng C1.** Phần này gồm sáu bước:
- Lập lịch một ngày ở Công viên Mẫu với 6 công cụ: `get_park_catalog`, `get_park_incidents`, model chọn trò, `build_park_plan` (beam search), `estimate_walk` và `validate_park_plan`. Phần này nằm trong [c1_flow.py](../codebase/c1_flow.py) và [park_engine.py](../codebase/park_engine.py), cùng trang web `/c1` (`f42e681`, `cbb8d6f`).
- Tài khoản demo một chạm (`b8304b2`).
- Module `park-plans` trên core-api: lưu snapshot và kiểm lại lịch độc lập với model (`9b105da`).
- Đọc được đơn vị tiền và chiều cao viết kiểu nhắn tin, đồng thời xử lý suất diễn bị huỷ trong ngày (`09c3a12`).
- Nối khung chat Vini sang trợ lý lập lịch, kèm hỏi lại tự nhiên khi thiếu thông tin (`d92ffc8`, `eeef94f`).
- Viết hợp đồng API (`aca9db9`).

**Đánh giá và hồ sơ.** Em chạy các lượt đánh giá C1 trên model thật và viết [checker](../eval/check_c1_run.py). Em ghi kết quả vào [report.md](../eval/report.md), hoàn thiện [hồ sơ CP3](../docs/cp3.md) và chạy thêm lượt C2 (`c08daf9`).

**Video demo.** Em làm video demo 3 phút:
- Viết kịch bản, phần lớn cho C1, một phần nhỏ cho C2 và C3.
- Quay giao diện web bằng script Playwright.
- Lồng tiếng Việt bằng TTS và chèn phụ đề.
- Dựng bằng HyperFrames.

Điểm em cần cải thiện là ôm quá nhiều đầu việc nối tiếp nhau. Commit C1 dồn vào hai ngày cuối, nên có những lượt đánh giá phải chạy giữa lúc đang sửa. Run-3 là ví dụ: lượt này phải giữ lại nhưng không dùng để nộp. Lần sau em sẽ chốt code sớm hơn và để một khoảng riêng cho kiểm thử.

## 2. AI hỗ trợ em thế nào

Em dùng Claude Code trong cả bốn mảng:
- **Code C1:** dựng beam search xếp giờ, validator, checker đối chiếu trace, và luồng nối chat Vini với core-api.
- **Hồ sơ:** đọc lại số liệu trước khi đưa vào báo cáo.
- **Video:** viết script quay màn hình, tạo giọng đọc tiếng Việt và căn phụ đề theo mốc từng từ, rồi dựng cảnh bằng HyperFrames.
- **Kế hoạch:** chia việc thành các thẻ nhỏ có tiêu chí nghiệm thu, giao cho agent làm, sau đó em duyệt lại.

Những chỗ em phải sửa output của AI:
- AI gọi API C1 sai tên trường: gửi `question` thay vì `text` nên bị lỗi 422. AI cũng chọn giờ hiệu lực của C2 sai (14:00), nên phải đổi sang 18:00.
- Lời thoại C3 ban đầu nói hệ thống đã tạo bản nháp đổi vé. Khi quay thật, giao diện chỉ dừng ở bước liệt kê phương án, nên em sửa lời thoại cho khớp với những gì màn hình thật sự làm được.
- Ở hồ sơ, AI hay viết kết quả mạnh hơn bằng chứng. Em phải ghi rõ 30/30 và 19/20 vẫn là điểm chấm nháp chờ nhóm duyệt, và không gộp điểm hai bộ câu với nhau.

Em vẫn chịu trách nhiệm với mọi con số trong repo. Mỗi kết luận đều có file run, trace hoặc test để chạy lại. Bản reflection này có AI hỗ trợ soạn, và em đã đọc lại, xác nhận nội dung trước khi nộp.

## 3. Một câu thử trượt và bài học của em

Câu trượt là **HO-14** trong [báo cáo kiểm định C1](../eval/c1-validation-review.md).
- **Yêu cầu:** hai người lớn, 09:00–15:00, ngân sách 1.000.000 đồng, bắt buộc xem show 11:00, nhưng show đó đã bị huỷ.
- **Hệ thống làm gì:** vẫn xếp show 11:00–11:30 và trả VALID. Trace không có lời gọi `get_park_incidents`.
- **Kết quả:** câu này trượt ở cả hai phiên bản. Bộ riêng chỉ đạt 19/20, dù bộ chính đã đạt 30/30 trong lượt chấm nháp.

Vì code C1 là phần của em, đây là lỗi của em. Validator chỉ kiểm những gì nằm trong lịch: chiều cao, giờ, tiền. Nó không kiểm xem dữ kiện đầu vào còn đúng với hôm nay hay không. Model bỏ qua bước đọc sự cố, và không có gì ở tầng code buộc bước đó phải chạy.

Em sửa ở `09c3a12`:
- Khi người dùng nhắc tới show, hệ thống luôn đọc sự cố của ngày đó.
- Suất bị huỷ thì không được xếp vào lịch, và Vini phải báo cho phụ huynh để đổi suất.
- Em thêm test hồi quy cho trường hợp này vào [test_c1_park_plan.py](../tests/test_c1_park_plan.py).

Video demo chỉ nói lỗi này đã được vá sau khi phần sửa đã nằm trong code. Bộ 20 câu đã dùng để sửa giờ thành bộ hồi quy, nên lần tới em cần một bộ kiểm định mới mới được báo lại điểm.

Bài học của em có ba ý:
- Điểm tổng cao không chứng minh được rằng không còn lỗi nghiêm trọng.
- Điều kiện cứng nào ảnh hưởng tới người dùng thì phải do code kiểm, không phó mặc cho model nhớ gọi công cụ.
- Kế hoạch cần chừa thời gian cho một bộ câu mà người làm code chưa từng thấy.
