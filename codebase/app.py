"""Giao diện web của VinTrip: `python run.py` mở máy chủ cục bộ, trang gọi answer() trong agent.py.

Chỉ dùng thư viện chuẩn. Trang: codebase/web/index.html. API: POST /api/answer {"text": "..."}
trả {"output", "plan"?, "stats"}. Nếu answer() trả thêm khoá "plan" (status, timeline, costs, total,
budget, checks, questions) thì trang vẽ timeline / bảng tiền / kết quả kiểm; không có thì hiện output.
"""
import json
import os
import sys
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
PAGE = os.path.join(HERE, "web", "index.html")
MAX_BODY = 20_000  # một yêu cầu lập lịch chỉ vài trăm ký tự


def _where(e):
    """File (trong codebase/) gây lỗi khi nạp: SyntaxError có e.filename, lỗi khác lấy khung cuối của traceback."""
    import traceback
    path = getattr(e, "filename", None) or (traceback.extract_tb(e.__traceback__)[-1].filename if e.__traceback__ else "")
    if not path:
        return "codebase/"
    p = os.path.abspath(path)
    base = os.path.dirname(HERE)
    return os.path.relpath(p, base).replace(os.sep, "/") if p.startswith(base) else path


def run_answer(text):
    """Gọi answer() trong một lượt trace, trả (mã HTTP, dict JSON)."""
    import tracing
    from agent import answer
    tracing.begin("app")
    try:
        result = answer(text)
    except NotImplementedError as e:
        tracing.end()
        return 503, {"error": "Chưa nối model: %s" % e}
    except Exception as e:  # lỗi gọi model: báo lên trang, máy chủ vẫn chạy
        tracing.end()
        return 500, {"error": "%s: %s" % (type(e).__name__, e)}
    s, _ = tracing.end()
    if not isinstance(result, dict):
        result = {"output": str(result)}
    body = {"output": result.get("output", ""), "stats": {
        "models": s["models"], "model_calls": s["model_calls"], "tool_calls": s["tool_calls"],
        "tokens_in": s["tokens_in"], "tokens_out": s["tokens_out"]}}
    if isinstance(result.get("plan"), dict):
        body["plan"] = result["plan"]
    return 200, body


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, data, ctype="application/json; charset=utf-8"):
        raw = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        if self.path not in ("/", "/index.html"):
            return self._send(404, {"error": "không có trang này"})
        with open(PAGE, "rb") as f:
            self._send(200, f.read(), "text/html; charset=utf-8")

    def do_POST(self):
        if self.path != "/api/answer":
            return self._send(404, {"error": "không có API này"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = -1
        if not 0 < n <= MAX_BODY:
            return self._send(413 if n > MAX_BODY else 400, {"error": "yêu cầu rỗng hoặc quá dài"})
        try:
            text = str(json.loads(self.rfile.read(n).decode("utf-8")).get("text", "")).strip()
        except (ValueError, AttributeError, UnicodeDecodeError):
            return self._send(400, {"error": "dữ liệu gửi lên không phải JSON hợp lệ"})
        if not text:
            return self._send(400, {"error": "chưa có nội dung yêu cầu"})
        self._send(*run_answer(text))

    def log_message(self, fmt, *args):  # giữ terminal gọn: chỉ in lỗi
        if args and str(args[1]).startswith(("4", "5")):
            sys.stderr.write("%s\n" % (fmt % args))


def make_server(port=8000):
    """Chỉ nghe trên máy này (127.0.0.1). Cổng bận thì để hệ điều hành chọn cổng trống."""
    try:
        return ThreadingHTTPServer(("127.0.0.1", port), Handler)
    except OSError:
        return ThreadingHTTPServer(("127.0.0.1", 0), Handler)


def main() -> int:
    try:
        import tracing  # noqa: F401
        from agent import answer  # noqa: F401
    except Exception as e:  # lỗi cú pháp, thiếu thư viện… trong codebase/
        print("Không nạp được codebase/ — lỗi ở %s: %s: %s" % (_where(e), type(e).__name__, e))
        print("Sửa lỗi rồi chạy lại. Cách nối model: docs/connect-model.md")
        return 1
    server = make_server()
    url = "http://127.0.0.1:%d/" % server.server_address[1]
    print("VinTrip đang chạy tại %s — mở trình duyệt vào địa chỉ này. Dừng: Ctrl+C." % url)
    try:
        webbrowser.open(url)
    except Exception:
        pass
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print()
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
