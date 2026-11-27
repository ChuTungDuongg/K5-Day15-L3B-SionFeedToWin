# VinTrip

Dự án của nhóm **SionFeedToWin**, lớp **L3B**, Track **C: Du lịch**, tham gia hackathon AI20K K5.

VinTrip hỗ trợ phụ huynh lên lịch một ngày tại khu vui chơi cho gia đình có trẻ nhỏ. Phạm vi dự kiến là chọn hoạt động và xếp lịch theo thời gian, ngân sách, sở thích cùng điều kiện tuổi và chiều cao của trẻ. Kết quả gồm lịch theo giờ, bảng chi phí và các điều kiện đã kiểm tra. Xem phạm vi, kế hoạch bằng chứng và phân công trong [canvas.md](canvas.md).

Nguồn khung: [`starter-repo/` của BTC](https://github.com/VinUni-AI20k/K5-L3-Day15-AI-Product-Hackathon/tree/6225f90bc65e7751139127abb42bd0ed7241f2de/starter-repo), commit `6225f90bc65e7751139127abb42bd0ed7241f2de`.

Nguồn tham khảo của thư mục `vintrip/`: khung frontend (Next.js), backend (NestJS) và dịch vụ AI dựa trên mã nguồn dự án TripFlix (đổi tên thành Vintrip). Phần nhóm tự làm: agent Vini trong `codebase/`, ý tưởng lập lịch khu vui chơi, giao diện tông cam hồng.

Hướng dẫn chính thức: [đề bài](https://github.com/VinUni-AI20k/K5-L3-Day15-AI-Product-Hackathon/blob/main/01-challenge-brief.md) · [guide](https://github.com/VinUni-AI20k/K5-L3-Day15-AI-Product-Hackathon/blob/main/02-guide.md) · [rubric](https://github.com/VinUni-AI20k/K5-L3-Day15-AI-Product-Hackathon/blob/main/03-rubric.md) · [các track](https://github.com/VinUni-AI20k/K5-L3-Day15-AI-Product-Hackathon/tree/main/tracks).

**Trạng thái rà soát ngày 28/11:** các file chính của CP1 và CP2 đã có, gồm 4 thành viên, canvas, sơ đồ thiết kế, 30 câu thử và 4 metric. `python run.py check` không báo vấn đề cấu trúc. Nhóm xác nhận chưa làm/nộp CP3. Repo đã có thêm code C1, dữ liệu Công viên Mẫu, bốn lượt eval và một lượt mô phỏng 50 phiên, nhưng các mục này chưa đủ để xác nhận CP3 hoặc CP4 hoàn tất. Xem [bảng kiểm từng checkpoint và phần đang chờ](docs/tracker/BOARD.md#rà-soát-hồ-sơ-checkpoint-ngày-28112026).

**Bằng chứng hiện có:** CSV lưu 20 dòng, trong đó 10 dòng được nhóm gắn nhãn người dùng thật và 10 dòng tự viết. Chỉ đếm 10 dòng đầu: 7/10 kể có sự cố, 6/10 chuẩn bị từ 30 phút, 4/10 đi cùng trẻ nhỏ. Nguồn nhóm chọn là khảo sát qua biểu mẫu. Khảo sát chưa đạt ngưỡng 20 người ngoài đội đúng đối tượng. Chỉ cần ít nhất một nguồn đạt ngưỡng, không bắt buộc đồng thời phỏng vấn và khảo sát. Xem [tổng hợp và giới hạn nguồn](evidence/summary.md).

**Đang chờ cho CP3:** đủ bằng chứng đúng đối tượng và nguồn gốc, duyệt điểm một lượt eval, người thứ hai đối chiếu 5 output, video AI thật 30 giây và xác nhận AI tham gia quyết định trung tâm. Hiện `agent.answer()` gọi model sau khi code đã lập và kiểm câu trả lời, vì vậy có token model thật chưa tự chứng minh điều kiện cuối. Không ghi 29/30 là điểm chính thức khi cột `pass` còn trống.

**Đang chờ cho CP4 và cuối ngày:** chọn cặp lượt so sánh và cải tiến, xác minh giá model và giả định quy mô, slide `demo-slides.pdf`, video dự phòng, bốn bài reflection và xác nhận đã nộp Form. Token mô phỏng đã đo, còn giá USD trong báo cáo hiện là giá mẫu.

Tài liệu nghiên cứu về điều kiện hủy phòng trong repo thuộc hướng trước. Nhóm cần thu bằng chứng đúng đối tượng của VinTrip trước khi kết luận về nhu cầu hoặc mức tiết kiệm thời gian.

**Thành viên, lớp, track:** xem [TEAMS.md](TEAMS.md). **Điền TEAMS.md đúng format**: khi chấm và đánh giá, BTC quét file này để ghép điểm cho từng người.

*Lát cắt = phần nhỏ nhất làm xong được trong hackathon: một người dùng · một việc · một quyết định AI · một kết quả.*

---

## Nhóm làm gì, khung làm gì

| Nhóm quyết định và viết | Khung làm sẵn (không cần sửa) |
|---|---|
| Người dùng, pain, bằng chứng, impact (`evidence/`, `spec.md` §1–§2) | — |
| Hình dạng giải pháp, công cụ, prompt, luồng (`spec.md` §4, `codebase/agent.py`, `tools.py`, `ai.py`) | Ghi mọi lần gọi model / công cụ vào trace, cộng token (`codebase/tracing.py`) |
| Bộ câu thử, metric, chuẩn "đạt" (`eval/benchmark.csv`, `eval/metric_spec.yaml`, `spec.md` §7) | Kiểm đủ cột, đủ câu `kho` / `tu_choi`, đủ ≥1/3 câu từ người dùng / data thật (`run.py check`) |
| Chấm cột `pass` theo metric spec | Chạy cả bộ một lệnh, có run ID, model, token từng câu (`run.py eval`) · tính % đạt (`run.py score`) |
| Persona, số người dùng thật, giá model (`cost/personas.yaml`) | Sinh ~50 phiên, chạy thật qua bản chạy thử, tính chi phí / phiên, / task thành công, / tháng 3 kịch bản (`run.py simulate`) |

Luồng C1 hiện tại: code đọc yêu cầu → lấy dữ liệu Công viên Mẫu → bộ tìm lịch bằng beam search → validator tính lại → model diễn đạt câu trả lời → kiểm phản hồi model so với căn cứ. Sáu công cụ đã có trong `codebase/tools.py`, dùng `data/cong_vien_mau.json`. Thiết kế mục tiêu và giới hạn của phần AI ở [spec.md §4](spec.md).

## Chạy trong 3 phút

Bộ khung cần **Python 3.10 trở lên** (Python 3.9 có sẵn trên macOS vẫn chạy được, chỉ in một dòng nhắc). **Không cần `pip install`.**

Để dùng môi trường riêng trên Windows, mở PowerShell tại thư mục repo và chạy:

```powershell
python -m venv .venv
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe run.py
```

`requirements.txt` hiện chỉ có chú thích vì bộ khung dùng thư viện chuẩn. Nếu nhóm thêm SDK hoặc thư viện, khai báo gói vào file này rồi chạy lại lệnh cài. `.venv/` và `.env` được giữ trên máy và đã có trong `.gitignore`.

Các lệnh bên dưới có thể thay `python` bằng `.\.venv\Scripts\python.exe` để dùng đúng môi trường này. `python run.py check` hiện nhận đủ 4 thành viên, 30 câu thử và 4 metric, không còn cảnh báo cấu trúc.

**Bước 1 — Mở cửa sổ lệnh ngay trong thư mục repo**

| Windows (PowerShell) | macOS |
|---|---|
| Mở thư mục repo bằng File Explorer → bấm vào thanh địa chỉ → gõ `powershell` → Enter | Mở **Terminal** (Cmd + Space, gõ "Terminal") → gõ `cd ` (có dấu cách) → kéo thả thư mục repo vào → Enter |

Gõ `dir` (Windows) hoặc `ls` (macOS / Linux): thấy `run.py` và `README.md` là đang đứng đúng chỗ.

**Bước 2 — Kiểm Python và chạy thử**

| Việc | Windows (PowerShell) | macOS / Linux |
|---|---|---|
| Kiểm Python | `python --version` (không được thì `py --version`) | `python3 --version` |
| Chạy bản chạy thử (chế độ giả, chưa gọi model) | `python run.py` | `python3 run.py` |
| Kiểm bộ câu thử | `python run.py check` | `python3 run.py check` |
| Tạo file `.env` để nối model | `copy .env.example .env` | `cp .env.example .env` |

- Windows: gõ `python` mà mở Microsoft Store hoặc báo không có lệnh → dùng `py`. Chưa có Python: cài từ python.org, **tick "Add python.exe to PATH"**, mở lại PowerShell.
- macOS: báo `command not found: python` là bình thường → dùng `python3`.
- Không có khóa hoặc đặt `MODEL_PROVIDER=fake` thì model mang tên `offline-deterministic`, token bằng 0. Đây là chế độ kiểm cục bộ, không dùng làm bằng chứng gọi AI thật.

Ví dụ đầu vào C1: “Nhà mình 2 người lớn và 2 bé 5 tuổi cao 108 cm, 9 tuổi cao 132 cm, đi Công viên Mẫu 09:00–14:00, ngân sách 1.500.000 đồng, show 11:00, ăn trưa 45 phút.”

Để gọi API thật, `.env` cần `MODEL_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL` và tùy chọn `OPENAI_BASE_URL`. Các tên này khớp code hiện tại, đã được ghi trong `.env.example`. Giữ khóa trên máy. Với giao diện Docker và trang C1, xem [vintrip/README.md](vintrip/README.md).

Trong README này lệnh viết là `python …`; máy nhóm cần `python3` hay `py` thì gõ thay.

## Lệnh

| Lệnh | Làm gì |
|---|---|
| `python run.py` | Chạy bản chạy thử (gõ đầu vào, nhận kết quả, kèm số lần gọi model / token) |
| `python run.py check` | Kiểm `eval/benchmark.csv` (6 cột, số câu, `kho` / `tu_choi`, mã `source`, ô trống, dòng mẫu) `eval/metric_spec.yaml` (≥3 metric điền đủ) và `TEAMS.md` (đúng format để BTC quét). Chỉ cảnh báo, không sửa file |
| `python run.py eval --try` | **Thử nối model:** chạy 3 câu đầu (`--try 5` = 5 câu) → `eval/run-try.csv`. Thấy "Nối model được" là xong. Không tính là một lượt |
| `python run.py eval` | Chạy cả bộ qua `codebase/agent.py` → `eval/run-1.csv` (lần sau `run-2.csv`…) + `traces/run-1.jsonl`. Mỗi dòng có run ID, model, số lần gọi model / công cụ, token. Model còn giả → chỉ ghi `run-mock.csv`; mọi câu lỗi → `run-error.csv`; Ctrl+C → `run-stopped.csv` — đều **không** được đánh số |
| `python run.py eval --fake` | Thử riêng bộ chạy, không gọi agent → `eval/run-fake.csv` |
| `python run.py score eval/run-1.csv` | Sau khi điền cột `pass` (1 / 0): in % đạt tổng và theo `type`. Còn ô trống → "CHƯA CHẤM XONG", không in % |
| `python run.py simulate --try` | Thử mô phỏng chi phí 10 phiên (làm trước CP3) → `cost/simulate-try.csv` |
| `python run.py simulate` | Mô phỏng chi phí khi dùng thật theo `cost/personas.yaml` (≥50 phiên) → `cost/simulate-N.csv` + `cost/simulate-N-summary.md` |
| `python run.py simulate --rate-from eval/run-2.csv` | Như trên, lấy tỉ lệ đạt từ đúng lượt chỉ định. Không ghi thì khung lấy lượt `run-N` mới nhất đã chấm, cùng model, và ghi rõ đã lấy lượt nào trong bản tóm tắt |

Gói miễn phí báo hết lượt: thêm `--wait 4` sau `eval` hoặc `simulate` (nghỉ 4 giây giữa hai lượt gọi). Sửa CSV bằng Excel: *File → Save As → CSV UTF-8*; Google Sheets: *Tệp → Tải xuống → CSV*.

**Lượt có lỗi kỹ thuật** (cột `error` có chữ): không sửa tay file đó, chạy lại thành lượt mới và ghi vào bảng các lượt ở `eval/README.md`. Không xoá file lượt nào.

Nhóm dùng stack khác (Node, Streamlit, notebook…): sửa hàm `run_app()` trong `run.py` để `python run.py` vẫn chạy được bản chạy thử, và giữ `answer()` trong `codebase/agent.py` để `eval`, `simulate` chạy được.

## Bản chạy thử — viết ở đâu

| File | Viết gì | Bước guide |
|---|---|---|
| `codebase/agent.py` | `answer(text)` điều phối C1 và các luồng bổ trợ, gọi model và đối chiếu phản hồi với căn cứ | 3.2 |
| `codebase/tools.py` | Công cụ của bài toán, mỗi công cụ một hàm có `@tool` | 2.2, 3.2 |
| `codebase/ai.py` | `call_model(system, user)` gọi Chat Completions và lấy token từ usage. Không có khóa thì chạy offline | 3.3 |

- **Trước CP2:** để chế độ giả, công cụ trả dữ liệu giả — `python run.py` đi hết luồng là đủ.
- **Trước CP3:** nối model thật theo [docs/connect-model.md](docs/connect-model.md), `eval --try` thấy token > 0 rồi mới `eval`.
- Bộ chạy gửi **nguyên ô `input`** của câu thử vào `answer(text)`. Dữ liệu nền (bài học, thông báo, lịch…) để trong `data/`, đọc qua công cụ.

## Phần nào thật, phần nào giả

| Thành phần | Thật / Giả | Ghi chú |
|---|---|---|
| Lời gọi model | Có log gọi thật, có chế độ offline | Run-4 ghi model `gpt-6-luna`, tổng token vào 17.738, ra 14.634. Vai trò quyết định trung tâm cần xử lý trước khi xác nhận đủ điều kiện |
| Lập lịch và kiểm ràng buộc | Đã có code | `c1_flow.py`, `park_engine.py`, `tools.py`. Dùng beam search, không phải CP-SAT |
| Công viên, giá và sự cố trong benchmark | Mô phỏng | Snapshot `CVM-2026-11-28-v1` trong `data/cong_vien_mau.json` |
| Khảo sát | 10 dòng gắn nhãn thật, 10 dòng tự viết | Không cộng dòng tự viết vào bằng chứng. Cần đối chiếu nguồn gốc |
| Chất lượng | Chấm nháp | Run-2 nháp 26/30, run-4 nháp 29/30. Chưa điền cột pass của các lượt gốc |
| Chi phí | Có token đo, giá còn là giả định | 50 phiên ở simulate-1. Chưa có đơn giá thật của model đã chạy |

## Dùng AI vào việc gì

Theo khai báo trong spec, nhóm dùng OpenAI Codex, Antigravity và Claude Code để thiết lập khung, soạn thiết kế, sơ đồ và bộ tiêu chí. Codex hỗ trợ rà kết quả merge, cập nhật hồ sơ và kiểm đường chạy với model giả. Nhóm cần đối chiếu nguồn khảo sát, duyệt nội dung và giải thích phần việc của mình. Chi tiết ở [docs/ai-usage.md](docs/ai-usage.md), quy ước ở [AGENTS.md](AGENTS.md).

## File mẫu — điền ở bước nào

| File | Điền ở bước guide | Mốc |
|---|---|---|
| `TEAMS.md` | 1.0 | CP1 · **đúng format**, BTC quét khi chấm |
| `canvas.md` | 1.4 | CP1, cập nhật CP2 |
| `evidence/hypothesis.md` | 1.1 | trước khi tìm bằng chứng |
| `evidence/data-mining.md` · `evidence/interviews/TEMPLATE.md` → `P1.md`… · `evidence/survey/TEMPLATE.md` | 1.2 | bắt đầu sau Zoom, xong CP3 |
| `evidence/summary.md` | 1.2 | CP3 |
| `spec.md` | §0–§2: 1.1–1.3 · §3–§5: 2.1–2.3 · §7: 2.4 · §8: 4.2 · §10: suốt | §7 chốt CP2 · §0–§7 CP3 · đủ CP4 |
| `data/DATA_CARD.md` | 2.4 | bản đầu CP2 |
| `eval/benchmark.csv` · `eval/metric_spec.yaml` | 2.4 | ≥10 câu + metric chốt CP2 · 20–30 câu CP3 |
| `codebase/` | 3.2, 3.3 | khung CP2 · AI thật CP3 |
| `eval/report.md` · `eval/README.md` | 4.1 (README mục 1–4 từ 2.4) | CP4 |
| `cost/personas.yaml` · `cost/cost-estimate.md` | 4.2 | thử 10 phiên CP3 · đủ CP4 |
| `validation/log.md` *(bonus)* | 4.3 | CP4 |
| `slides/outline.md` → `demo-slides.pdf` | 5.1 | CP4 |
| `reflection/TEMPLATE.md` → `reflection/<ten>.md` | 5.3 | 23:59 Thứ Bảy 28/11 |
| `AGENTS.md` · `docs/ai-usage.md` | khi dùng coding agent / AI | suốt |

## Bảy hạng mục bắt buộc — nằm ở file nào

| # | Hạng mục | File |
|---|---|---|
| 1 | Bằng chứng pain | `evidence/` (tổng hợp ở `evidence/summary.md`) |
| 2 | Impact có số | `spec.md` §2 |
| 3 | Thiết kế giải pháp | `spec.md` §4 |
| 4 | Bản chạy thử làm trọn lát cắt | `codebase/` · lệnh ở mục "Lệnh" |
| 5 | Định nghĩa "tốt" + bộ câu thử | `data/DATA_CARD.md` · `eval/` |
| 6 | Mô phỏng chi phí khi dùng thật | `cost/` |
| 7 | Slide + demo + video dự phòng | slide trong repo (PDF, PPTX, HTML…) hoặc link slide ở form CP4 · link video: ____ |
| + | *Bonus:* người dùng thử | `validation/log.md` |
