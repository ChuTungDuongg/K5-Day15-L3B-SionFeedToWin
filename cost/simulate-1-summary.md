# Tóm tắt mô phỏng simulate-1@20261127-232039

Do `python run.py simulate` sinh ra — không sửa tay. Chép bảng sang `cost/cost-estimate.md`.

| Persona | Số phiên mô phỏng | Lượt hỏi / phiên | Token vào / phiên | Token ra / phiên | Gọi model / phiên | Gọi công cụ / phiên |
|---|---:|---:|---:|---:|---:|---:|
| dung_it | 26 | 1 | 732 | 640 | 1.0 | 5.0 |
| dung_vua | 15 | 3 | 1760 | 1452 | 3.0 | 11.9 |
| dung_nhieu | 9 | 5 | 3767 | 3291 | 5.0 | 27.3 |

Tỉ lệ đạt dùng để tính: **chưa có** lượt eval nào chấm xong (`python run.py score eval/run-N.csv`) → chưa tính được chi phí / task thành công

| Model (giá) | Chi phí / phiên | Chi phí / task thành công | Chi phí / câu hỏi đạt | Chi phí / tháng — thấp (300 người) | Chi phí / tháng — cơ sở (700 người) | Chi phí / tháng — cao (1.000 người) | Chi phí / người / tháng (cơ sở) |
|---|---:|---:|---:|---:|---:|---:|---:|
| gemini-3.1-flash-lite (vào 0.25 · ra 1.5 $/1M) | $0.0024 | — | — | $10.10 | $23.56 | $33.65 | $0.0337 |
| gemini-4-hydrogen (vào 1.5 · ra 7.5 $/1M) | $0.0126 | — | — | $52.11 | $121.60 | $173.71 | $0.1737 |

- Chi phí / task thành công = chi phí / phiên ÷ tỉ lệ đạt. Chi phí / câu hỏi đạt = chi phí / phiên ÷ số lượt hỏi trung bình mỗi phiên (2.3) ÷ tỉ lệ đạt — tỉ lệ đạt đo theo từng câu thử.
- Token đo trên model: gpt-6-luna. Giá tính theo từng model trong bảng — model khác bộ tách token thì số token thật có thể lệch; ghi rõ "đo trên model X, tính giá model Y" trong cost/cost-estimate.md.
- Phiên lỗi (không tính vào trung bình): 0/50.
