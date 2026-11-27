"""Trang web demo chạy trên máy cho Vini (C1 + các ý phụ), chỉ dùng thư viện chuẩn.

Chạy: python codebase/web_demo.py   rồi mở http://localhost:8765
Mỗi câu hỏi đi qua đúng answer() trong agent.py; trang hiện câu trả lời và từng bước trace
(ghi chú luồng, công cụ đã gọi, model) để xem luồng chạy. Không thay `python run.py`.
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import sys

for _stream in (sys.stdout, sys.stderr):  # console Windows mặc định cp1252, không in được tiếng Việt
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import tracing  # noqa: E402
from agent import answer  # noqa: E402

PORT = int(os.environ.get("VINI_DEMO_PORT") or os.environ.get("PORT") or "8765")
EXAMPLES = [
    ("Lịch đẹp (VALID)", "Nhà mình 2 người lớn và 2 bé 5 tuổi (cao 108 cm), 9 tuổi (cao 132 cm). Đi Công viên "
     "Mẫu từ 09:00 đến 14:00, ngân sách 1.500.000 đồng, ưu tiên trò nhẹ, muốn xem show lúc 11:00 và cần ăn "
     "trưa liên tục 45 phút."),
    ("Thiếu chiều cao", "Lên lịch đi Công viên Mẫu cho nhà mình có 2 bé, đi 09:00–14:00, ngân sách 1.500.000 đồng."),
    ("Không khả thi", "Ở Công viên Mẫu xếp 10 trò, mỗi trò ít nhất 20 phút, trong 09:00–11:00, 2 người lớn."),
    ("Vượt ngân sách", "Nhà mình 2 người lớn và 2 bé (5 tuổi 108 cm, 9 tuổi 132 cm) đi Công viên Mẫu "
     "09:00–14:00, ngân sách 1.000.000 đồng, cần ăn trưa."),
    ("Tàu lượn 120cm", "Gia đình 2 người lớn, bé 5 tuổi cao 108 cm, đi Công viên Mẫu 09:00–14:00, ngân sách "
     "1.500.000 đồng. Thêm trò tàu lượn cho cả nhà."),
    ("Mưa, xếp lại", "Nhà mình 2 người lớn, hiện là 13:00, đang ở khu ăn uống, trời mưa đến 14:30. Đã chi "
     "800.000 đồng, ngân sách tổng 1.000.000 đồng, xếp lại phần còn lại đến 15:00. Phần đã hoàn thành: "
     "tham quan khu A 09:30–10:40."),
    ("Show bắt buộc bị huỷ", "Show 11:00 là bắt buộc với nhà mình mà nghe nói bị huỷ rồi, xếp lại giúp."),
    ("Lịch show", "Công viên Mẫu sáng mai có những suất show nào, nên đến sớm bao lâu?"),
    ("Công viên khác", "Lên lịch khu vui chơi Thung Lũng Mây ở Đà Lạt 09:00–15:00, 2 người lớn, ngân sách "
     "1.000.000 đồng."),
    ("Mua vé (từ chối)", "Xếp lịch xong thì mua luôn vé và thanh toán bằng thẻ giúp mình."),
    ("Ocean Park: vé thật", "Nhà mình 2 người lớn và 2 bé cao 108 cm, 132 cm đi Water Park thứ 7 này, giá vé "
     "bao nhiêu?"),
    ("Hà Nội: bar mở khuya", "Quán bar ở Cầu Giấy mở khuya"),
]

PAGE = """<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vini demo</title>
<style>
:root{--bg:#fff7f3;--card:#fff;--ink:#2b1d1a;--muted:#7a6660;--accent:#d9365a;--line:#f0dcd5;
--ok:#1f7a4d;--warn:#b45309;--bad:#b42318}
@media (prefers-color-scheme:dark){:root{--bg:#1b1412;--card:#251b18;--ink:#f6ebe7;--muted:#b9a39c;
--line:#3a2b27;--ok:#5fd39a;--warn:#f5b45b;--bad:#ff8a80}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);
font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1100px;margin:0 auto;padding:20px 16px 40px}
h1{margin:0 0 4px;font-size:22px}p.sub{margin:0 0 16px;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
.chips button{border:1px solid var(--line);background:var(--card);color:var(--ink);border-radius:999px;
padding:6px 12px;cursor:pointer;font:inherit;font-size:13px}.chips button:hover{border-color:var(--accent)}
textarea{width:100%;min-height:92px;border:1px solid var(--line);border-radius:10px;padding:10px;
background:var(--card);color:var(--ink);font:inherit;resize:vertical}
.row{display:flex;gap:10px;align-items:center;margin:10px 0 18px}
#send{background:var(--accent);color:#fff;border:0;border-radius:10px;padding:10px 18px;font:inherit;
font-weight:600;cursor:pointer}#send:disabled{opacity:.6}
.grid{display:grid;grid-template-columns:1.4fr 1fr;gap:16px}@media (max-width:820px){.grid{grid-template-columns:1fr}}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px}
.card h2{margin:0 0 8px;font-size:15px}
#out{white-space:pre-wrap;font-family:ui-monospace,Consolas,monospace;font-size:13px;overflow-wrap:anywhere}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:700;font-size:13px;margin-bottom:8px;
border:1px solid currentColor}
.VALID{color:var(--ok)}.NEEDS_INPUT,.SEARCH_TIMEOUT{color:var(--warn)}
.INFEASIBLE,.MISSING_DATA,.REFUSED,.INVALID{color:var(--bad)}
ol{margin:0;padding-left:20px}li{margin:4px 0;font-size:13px}.k{color:var(--muted);font-size:12px}
code{font-size:12px;overflow-wrap:anywhere}.meta{color:var(--muted);font-size:12px;margin-top:8px}
</style></head><body><main>
<h1>Vini · bản chạy thử C1</h1>
<p class="sub">Mỗi câu đi qua <code>answer()</code> trong <code>codebase/agent.py</code>. Dữ liệu Công viên Mẫu là mô phỏng.
Bên phải là trace: ghi chú luồng và các công cụ đã gọi theo thứ tự.</p>
<div class="chips" id="chips"></div>
<textarea id="q" placeholder="Gõ câu hỏi của phụ huynh…"></textarea>
<div class="row"><button id="send">Hỏi Vini</button><span class="k" id="state"></span></div>
<div class="grid">
<section class="card"><h2>Câu trả lời</h2><div id="badge"></div><div id="out">Chọn một ví dụ hoặc gõ câu hỏi.</div>
<div class="meta" id="meta"></div></section>
<section class="card"><h2>Luồng (trace)</h2><ol id="trace"></ol></section>
</div></main>
<script>
const EX = __EXAMPLES__;
const chips = document.getElementById('chips'), q = document.getElementById('q');
EX.forEach(([label, text]) => { const b = document.createElement('button'); b.textContent = label;
  b.onclick = () => { q.value = text; ask(); }; chips.appendChild(b); });
document.getElementById('send').onclick = ask;
q.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) ask(); });
function status(text) {
  const m = text.match(/Trạng thái: ([A-Z_]+|TỪ CHỐI|CHƯA HỢP LỆ)/);
  if (!m) return null;
  return {'TỪ CHỐI': 'REFUSED', 'CHƯA HỢP LỆ': 'INVALID'}[m[1]] || m[1];
}
async function ask() {
  const text = q.value.trim(); if (!text) return;
  const btn = document.getElementById('send'); btn.disabled = true;
  document.getElementById('state').textContent = 'Đang chạy…';
  try {
    const r = await fetch('/api/ask', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text})});
    const data = await r.json();
    document.getElementById('out').textContent = data.output || data.error;
    const s = status(data.output || '');
    document.getElementById('badge').innerHTML = s ? `<span class="badge ${s}">${s}</span>` : '';
    const t = document.getElementById('trace'); t.innerHTML = '';
    (data.events || []).forEach(ev => {
      const li = document.createElement('li');
      if (ev.kind === 'tool') li.innerHTML = `<b>công cụ</b> <code>${ev.name}</code> <span class="k">${ev.latency_s ?? ''}s</span>`;
      else if (ev.kind === 'note') li.innerHTML = `<span class="k">ghi chú</span> ${ev.text}`;
      else li.innerHTML = `<b>model</b> <code>${ev.model || ev.name || ''}</code>`;
      t.appendChild(li);
    });
    const m = data.summary || {};
    document.getElementById('meta').textContent =
      `model: ${(m.models || []).join(', ') || '—'} · gọi model ${m.model_calls ?? 0} · công cụ ${m.tool_calls ?? 0} · token ${m.tokens_in ?? 0}/${m.tokens_out ?? 0}`;
  } catch (e) { document.getElementById('out').textContent = 'Lỗi: ' + e; }
  btn.disabled = false; document.getElementById('state').textContent = '';
}
</script></body></html>"""


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, kind):
        data = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._send(200, PAGE.replace("__EXAMPLES__", json.dumps(EXAMPLES, ensure_ascii=False)),
                       "text/html; charset=utf-8")
        else:
            self._send(404, "not found", "text/plain; charset=utf-8")

    def do_POST(self):
        if self.path != "/api/ask":
            return self._send(404, "not found", "text/plain; charset=utf-8")
        length = int(self.headers.get("Content-Length", 0))
        try:
            text = json.loads(self.rfile.read(length) or b"{}").get("text", "")[:4000]
        except ValueError:
            return self._send(400, json.dumps({"error": "JSON không hợp lệ"}), "application/json")
        tracing.begin("web")
        try:
            output = answer(text)["output"]
            summary, events = tracing.end()
            payload = {"output": output, "summary": summary, "events": events}
        except Exception as error:  # trả lỗi cho trang thay vì làm sập server
            tracing.end()
            payload = {"error": f"{type(error).__name__}: {error}"}
        self._send(200, json.dumps(payload, ensure_ascii=False, default=str), "application/json; charset=utf-8")

    def log_message(self, fmt, *args):
        sys.stderr.write("[web_demo] " + fmt % args + "\n")


if __name__ == "__main__":
    print(f"Vini demo: http://localhost:{PORT}  (Ctrl+C để dừng)")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
