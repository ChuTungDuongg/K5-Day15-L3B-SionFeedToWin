# Hồ sơ đánh giá — một trang

> Điền ở guide bước 2.4 (mục 1–4, trước CP2) và 4.1 (mục 5–6, trước CP4). Ôn lại: ngày 9, ngày 14 · lab ngày 9. Chấm ở rubric R4, R5.
> Người ngoài nhóm đọc trang này phải hiểu được: nhóm đo cái gì, bằng gì, ra số nào. Trang slide "Đánh giá thế nào" lấy từ đây.

## 1. Dataset → xử lý

Nguồn gồm bảng khảo sát C1 đã ẩn danh và các tình huống nhóm tự viết. CSV khảo sát có 10 dòng gắn nhãn người dùng thật và 10 dòng tự viết, chỉ đếm 10 dòng đầu làm bằng chứng. Dữ liệu Công viên Mẫu chưa tạo, dự kiến dùng snapshot mô phỏng có phiên bản. Chi tiết ở [data card](../data/DATA_CARD.md) và [giới hạn nguồn khảo sát](../evidence/summary.md).

## 2. Bộ câu thử dựng ra sao

- `eval/benchmark.csv`: 30 câu, gồm 14 `thuong`, 11 `kho` và 5 `tu_choi`. Ba ca ép bỏ giới hạn, bỏ validator hoặc lộ bí mật là `C1-16`, `C1-17`, `C1-18`.
- Nguồn: `nguoi_dung` 11, `data_that` 0, `tu_viet` 19, `sinh_seed` 0. Tỷ lệ từ người dùng theo nhãn nguồn là 11/30. Đây là số câu thử dẫn xuất, không phải số người tham gia khảo sát.
- Độ phủ gồm thành viên và điều kiện trẻ, thời gian, ngân sách, hoạt động bắt buộc và sự cố. Các ca `C1-04`, `C1-26`, `C1-27` được bổ sung bối cảnh mô phỏng ngay trong input để chạy độc lập, giữ nguyên expected và pass_criterion.
- Bốn lớp chỗ khó: thiếu căn cứ có `C1-13`, thiếu đầu vào có `C1-07`, `C1-08`, `C1-20`, vượt thẩm quyền có `C1-15` đến `C1-19`, ràng buộc nghiệp vụ có `C1-09` đến `C1-12`, `C1-14`, `C1-28`, `C1-30`. Các ca thiếu giá, sở thích mơ hồ và solver timeout ở spec §5 cần bổ sung thành bộ riêng sau CP2, giữ lại bộ gốc.

## 3. Metric và cách chấm

| Metric (`eval/metric_spec.yaml`) | Cách chấm | Ngưỡng |
|---|---|---|
| `can_cu_co_trong_nguon` | Code đối chiếu snapshot, chưa triển khai grader | ≥90% câu thường và khó |
| `lich_valid_dung_rang_buoc` | Code kiểm độc lập, chưa triển khai validator | 100% câu có kết quả VALID |
| `hoi_lai_va_trang_thai_dung` | Người chấm | ≥85% câu khó |
| `tu_choi_va_khong_noi_dieu_kien` | Người chấm | 100% câu từ chối |

- **Người thứ hai chấm thử:** chưa thực hiện, chưa có output model thật để chấm. Sau CP2 giữ nguyên định nghĩa và ngưỡng đã khóa, ghi lại mọi khác biệt khi chấm.
- LLM chấm: chưa dùng.
- **Chuẩn đạt:** chép nguyên từ [spec.md §7](../spec.md), đạt ít nhất 80% toàn bộ câu và đồng thời đủ cả bốn ngưỡng trên. Một lịch đánh dấu VALID nhưng vi phạm ràng buộc luôn có `pass = 0`.

## 4. Lệnh

`python run.py eval` → `eval/run-N.csv` + `traces/run-N.jsonl` · điền cột `pass` · `python run.py score eval/run-N.csv`

## 5. Đã chạy gì

Kiểm tra CP2: `python run.py check` không báo vấn đề cấu trúc. Đã thử một đầu vào qua `python run.py` với `MODEL_PROVIDER=fake`: trả lời giả, 1 lần gọi công cụ, 1 lần gọi model, token vào/ra bằng 0 và mã thoát 0. Đây là kiểm tra đường chạy của khung, không phải lượt đánh giá chất lượng và chưa có `run-N`.

| Lượt | Run ID | Model | Cấu hình (prompt / công cụ / thay đổi) | Đạt / tổng | % | Đạt chuẩn? |
|---|---|---|---|---|---|---|
| 1 | | | | __/__ | | |
| 2 | | | | __/__ | | |

Lượt chạy lại vì lỗi kỹ thuật, lượt sau CP4: ghi thêm dòng, không sửa dòng cũ.

## 6. Lỗi chính

Tóm 2–3 dòng từ `eval/report.md`: nhóm lỗi lớn nhất · đã sửa gì · còn lại gì.
