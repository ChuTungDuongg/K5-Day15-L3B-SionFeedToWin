# Chênh lệch thời gian chờ tại Kilimanjaro Safaris

Nguồn dữ liệu: **TouringPlans.com**, quan sát tại Disney’s Animal Kingdom (Florida, Mỹ). Phân tích riêng rủi ro một gia đình dùng số phút niêm yết để căn giờ cho hoạt động kế tiếp. [Kho dữ liệu, định nghĩa cột và giấy phép](https://github.com/TouringPlans/DisneyAnimalKingdomWaitTimes/tree/933161b8bebb7cd50e0d54bcb3578484875487fa)

Trong năm 2018, **20/260 mốc ghép được (7,7%)** có thời gian chờ thực tế dài hơn bảng niêm yết ít nhất 10 phút. Ví dụ ngày 10/1 lúc 10:46, bảng ghi 55 phút và khách đo được 71 phút. Một lịch chỉ chừa 10 phút đệm sau trò này sẽ thiếu 6 phút nếu các chặng khác diễn ra đúng dự kiến.

## Cách đếm lại

Chạy `python evidence/count_waits.py` từ gốc repo. Script tải riêng AK07.csv tại commit cố định. Đơn vị đếm là mốc bắt đầu xếp hàng (giờ địa phương). Ghép SACTMIN và SPOSTMIN đúng cùng timestamp, mỗi cột phải có đúng một giá trị phân biệt, không âm. Loại mốc thiếu một bên, có số mâu thuẫn hoặc báo đóng cửa. Mẫu số là toàn bộ mốc ghép được trong năm. Tử số thỏa `SACTMIN - SPOSTMIN >= 10`.

Năm mốc đầu tiên thỏa điều kiện, theo thời gian:

| Mốc tại trò (giờ miền Đông Mỹ) | Niêm yết (phút) | Đã chờ (phút) | Lệch (phút) |
|---|---:|---:|---:|
| 2018-01-10 10:12:00 | 15 | 26 | +11 |
| 2018-01-10 10:46:00 | 55 | 71 | +16 |
| 2018-01-12 10:14:00 | 40 | 56 | +16 |
| 2018-01-30 15:55:00 | 15 | 27 | +12 |
| 2018-01-31 13:33:00 | 35 | 51 | +16 |

## Phạm vi suy luận

Nguồn ghi nhận một trò và các lượt có người đo được thời gian. Việc chỉ ghép đúng timestamp có thể tạo thiên lệch chọn mẫu. Dữ liệu không ghi thành phần gia đình, người Việt, thời gian chuẩn bị lịch hay việc khách thực sự lỡ show. Kết quả hỗ trợ riêng giả thuyết về sai số chờ; đối chiếu trải nghiệm tại Việt Nam trong [khảo sát C1](summary.md).

Điều khoản của nguồn đối với dữ liệu trích lại: “Any publications or redistributions credit TouringPlans.com clearly at the beginning of those publications or distributions”; “Any redistributions include these license terms”. [Giấy phép gốc](https://github.com/TouringPlans/DisneyAnimalKingdomWaitTimes/blob/933161b8bebb7cd50e0d54bcb3578484875487fa/LICENSE.md)
