# VinTrip

## Thử C1 trên web

Từ thư mục gốc của repo, chạy bằng Docker Compose có hỗ trợ `additional_contexts`:

```sh
docker compose -f vintrip/be/deploy/compose.vintrip.yaml up -d --build web ai-service traefik
```

Máy đã có Postgres riêng chiếm cổng 5432 (lỗi `ports are not available ... 5432`) thì đổi cổng phía máy, không cần sửa file (PowerShell):

```powershell
$env:PG_PORT = '55432'; docker compose -f vintrip/be/deploy/compose.vintrip.yaml up -d --build web ai-service traefik
```

Mở [trang lập lịch Công viên Mẫu](http://localhost:3100/c1). Chọn **Một ngày cùng bé** rồi **Gửi câu hỏi**. Với lịch `VALID`, mở **Trace công cụ và model** để xem lượt gọi `build_park_plan` và `validate_park_plan`. Chọn **Trò thiếu giá** để thử trạng thái `MISSING_DATA`.

Trang gửi `POST /ai/c1/ask` tới gateway ở cổng 8080. Dữ liệu dùng cho bản thử là mô phỏng. Có thể chạy với model fake khi chưa cấu hình khoá.
