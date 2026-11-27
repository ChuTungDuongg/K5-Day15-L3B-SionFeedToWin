"""Sinh sơ đồ SVG cho spec.md §4 (TripFlix C1). Chạy: python docs/diagrams/build_diagrams.py

Chỉ dùng thư viện chuẩn. Sửa toạ độ/nhãn ở đây rồi chạy lại, không sửa tay file .svg.
"""
import os
from xml.sax.saxutils import escape

OUT = os.path.dirname(os.path.abspath(__file__))
FONT = "Segoe UI, Roboto, Helvetica, Arial, sans-serif"
MONO = "Consolas, Menlo, monospace"

INK = "#0f172a"
MUTED = "#475569"
LINE = "#334155"
BLUE = "#1e5bb8"
RED = "#c62828"
PAL = {
    "neutral": ("#f1f5f9", "#64748b"),
    "model": ("#eaf1fd", BLUE),
    "code": ("#e8f5e9", "#2e7d32"),
    "human": ("#fff6e0", "#b7791f"),
    "stop": ("#f8fafc", "#94a3b8"),
    "no": ("#ffffff", RED),
}


class Svg:
    def __init__(self, w, h, aria):
        self.w, self.h, self.aria = w, h, aria
        self.parts = []

    def add(self, s):
        self.parts.append(s)

    def text(self, x, y, s, size=13, weight="normal", anchor="middle", color=INK, mono=False, italic=False):
        fam = MONO if mono else FONT
        it = ' font-style="italic"' if italic else ""
        self.add(f'<text x="{x}" y="{y}" font-family="{fam}" font-size="{size}" font-weight="{weight}" '
                 f'text-anchor="{anchor}" fill="{color}"{it}>{escape(s)}</text>')

    def box(self, x, y, w, h, kind="neutral", rx=10, dash=False):
        fill, stroke = PAL[kind]
        d = ' stroke-dasharray="6 4"' if dash else ""
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{stroke}" stroke-width="1.6"{d}/>')

    def path(self, d, color=LINE, dash=False, arrow=True):
        da = ' stroke-dasharray="6 4"' if dash else ""
        mk = f' marker-end="url(#arr-{color[1:]})"' if arrow else ""
        self.add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.6"{da}{mk}/>')

    def label(self, x, y, s, color=MUTED, size=11.5):
        wpx = len(s) * size * 0.56 + 8
        self.add(f'<rect x="{x - wpx / 2:.1f}" y="{y - size}" width="{wpx:.1f}" height="{size + 5}" fill="#ffffff"/>')
        self.text(x, y, s, size=size, color=color, italic=True)

    def render(self, colors):
        markers = "".join(
            f'<marker id="arr-{c[1:]}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="{c}"/></marker>' for c in colors)
        return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" width="{self.w}" '
                f'role="img" aria-label="{escape(self.aria)}"><title>{escape(self.aria)}</title><defs>{markers}</defs>'
                f'<rect width="{self.w}" height="{self.h}" fill="#ffffff"/>' + "".join(self.parts) + "</svg>\n")


def legend(s, x, y, items):
    for kind, name in items:
        s.box(x, y - 11, 16, 14, kind, rx=3)
        s.text(x + 22, y, name, size=12, anchor="start", color=MUTED)
        x += 22 + len(name) * 6.6 + 26


def architecture():
    s = Svg(1200, 600, "Kiến trúc AI C1: agent LLM chuẩn hoá yêu cầu và chọn công cụ; solver lập lịch; "
                       "validator phía server tính lại độc lập trên cùng snapshot trước khi lịch được gọi là hợp lệ; "
                       "không có đường tới mua vé hay thanh toán")
    s.text(30, 34, "Kiến trúc AI — TripFlix C1: lập lịch một ngày tại khu vui chơi", size=18, weight="bold", anchor="start")

    s.box(30, 200, 170, 140, "human", rx=16)
    s.text(115, 236, "Phụ huynh", size=15, weight="bold")
    for i, t in enumerate(["thành viên, tuổi,", "chiều cao, khung giờ,", "ngân sách, sở thích"]):
        s.text(115, 262 + i * 19, t, size=11.5, color=MUTED)
    s.path("M200,270 H246")
    s.label(223, 262, "yêu cầu")

    s.box(250, 170, 150, 200, "neutral")
    s.text(325, 200, "Cổng vào", size=14, weight="bold")
    for i, t in enumerate(["Chặn prompt injection", "Chặn đòi lộ SYSTEM, key", "Mua vé, thanh toán", "→ từ chối"]):
        s.text(325, 234 + i * 26, t, size=12, color=MUTED)

    s.box(450, 150, 200, 240, "model")
    s.text(550, 180, "Agent LLM", size=15, weight="bold", color="#0d3c80")
    for i, t in enumerate(["Chuẩn hoá: bắt buộc / ưu tiên", "Hỏi lại khi thiếu (G10)", "Chọn công cụ",
                           "Lập lại hoặc đề nghị đổi yêu cầu", "Giải thích kết quả"]):
        s.text(550, 212 + i * 24, t, size=12)
    s.text(550, 350, "Không nới điều kiện bắt buộc,", size=11.5, color=RED, italic=True)
    s.text(550, 368, "không sửa giờ, giá của công cụ", size=11.5, color=RED, italic=True)
    s.path("M400,270 H446")
    s.label(423, 262, "an toàn")

    s.box(700, 110, 230, 110, "code")
    s.text(714, 134, "Đọc dữ liệu công viên", size=13, weight="bold", anchor="start", color="#1b5e20")
    for j, t in enumerate(["get_park_catalog", "get_show_schedule", "get_park_incidents", "estimate_walk"]):
        s.text(714, 154 + j * 16, t, size=11, anchor="start", mono=True)
    s.box(700, 240, 230, 70, "code")
    s.text(714, 264, "Lập lịch", size=13, weight="bold", anchor="start", color="#1b5e20")
    s.text(714, 284, "build_park_plan", size=11, anchor="start", mono=True)
    s.text(714, 300, "solver CP-SAT · phút, tiền nguyên", size=10.5, anchor="start", color=MUTED)
    s.path("M650,230 C675,230 675,165 696,165")
    s.label(670, 196, "gọi")
    s.path("M650,275 H696")
    s.path("M815,220 V236")

    s.box(700, 420, 230, 66, "neutral", rx=6)
    s.text(815, 446, "Công viên Mẫu (mô phỏng)", size=13, weight="bold")
    s.text(815, 467, "snapshotId · isMock · phiên bản", size=11, color=MUTED, mono=True)
    s.path("M760,420 V316")
    s.path("M700,453 C660,453 660,140 696,140")
    s.label(650, 430, "cùng snapshot")

    s.box(980, 150, 190, 240, "code")
    s.text(1075, 178, "validate_park_plan", size=13, weight="bold", color="#1b5e20", mono=True)
    s.text(1075, 196, "phía server, bắt buộc", size=11.5, color=MUTED)
    for i, t in enumerate(["giờ mở cửa, khung giờ", "đi bộ + thời gian đệm", "suất show, giờ đến sớm", "điều kiện từng thành viên",
                           "ngân sách, khoản đã chi", "ăn / nghỉ liên tục", "tránh điểm đóng, mưa"]):
        s.text(994, 222 + i * 20, "✓ " + t, size=11.5, anchor="start")
    s.path("M930,275 H976")
    s.label(953, 267, "lịch")
    s.path("M930,453 H1075 V394")
    s.label(1000, 446, "tính lại trên cùng dữ liệu")

    s.path("M1075,150 V96 H550 V146", color=BLUE, dash=True)
    s.label(812, 101, "vi phạm → lập lại hoặc hỏi phụ huynh", color=BLUE)
    s.path("M1130,150 V64 H115 V196")
    s.label(620, 69, "VALID: timeline + bảng tiền + kết quả kiểm  ·  hoặc NEEDS_INPUT / MISSING_DATA / INFEASIBLE / SEARCH_TIMEOUT")

    s.box(250, 420, 190, 66, "no", dash=True)
    s.text(345, 446, "Mua vé · thanh toán", size=12.5, weight="bold", color=RED)
    s.text(345, 466, "không có đường nối (ngoài P0)", size=11, color=RED, italic=True)

    legend(s, 30, 580, [("model", "Model"), ("code", "Code / kiểm tra"), ("human", "Người quyết"),
                        ("neutral", "Cổng vào / dữ liệu"), ("no", "Ngoài phạm vi")])
    return s.render([LINE, BLUE, RED])


def chip(s, x, y, text, kind, w=170, h=40, mono=True):
    s.box(x, y, w, h, kind, rx=20)
    s.text(x + w / 2, y + h / 2 + 4.5, text, size=12, weight="bold" if mono else "normal", mono=mono)


def states():
    s = Svg(1200, 420, "Trạng thái C1: yêu cầu đủ dữ kiện đi qua build_park_plan rồi validate_park_plan; chỉ khi validator "
                       "đạt mới là VALID; thiếu dữ kiện, thiếu dữ liệu, không khả thi hay hết giờ đều dừng kèm giải thích; "
                       "mưa hoặc huỷ show thì xếp lại phần còn lại")
    s.text(30, 34, "Trạng thái một yêu cầu C1 đi qua", size=18, weight="bold", anchor="start")
    s.text(30, 58, "Lịch chỉ được gọi là hợp lệ sau khi validator tính lại độc lập", size=12.5, anchor="start", color=MUTED)
    W, G, X0, y = 170, 60, 40, 150
    col = lambda i: X0 + i * (W + G)

    chip(s, col(0), y, "Yêu cầu", "neutral", mono=False)
    chip(s, col(1), y, "build_park_plan", "code")
    chip(s, col(2), y, "validate_park_plan", "code")
    chip(s, col(3), y, "VALID", "code")
    chip(s, col(4), y, "Xếp lại phần còn lại", "model", mono=False)
    for i, lb in enumerate(["đủ dữ kiện", None, "đạt", "mưa / huỷ show"]):
        s.path(f"M{col(i) + W},{y + 20} H{col(i + 1) - 4}")
        if lb:
            s.label(col(i) + W + G / 2, y - 6, lb)
    s.path(f"M{col(2) + 60},{y} C{col(2) + 40},{y - 50} {col(1) + 130},{y - 50} {col(1) + 110},{y - 3}", color=BLUE, dash=True)
    s.label((col(1) + col(2) + W) / 2, y - 44, "vi phạm → lập lại", color=BLUE)

    yb = y + 100
    chip(s, col(0), yb, "NEEDS_INPUT", "stop")
    s.text(col(0) + W / 2, yb + 60, "hỏi đúng mục thiếu", size=11.5, color=MUTED, italic=True)
    chip(s, col(1) - 30, yb, "MISSING_DATA", "stop", w=W + 10)
    s.text(col(1) - 30 + 90, yb + 60, "chưa xác nhận lịch", size=11.5, color=MUTED, italic=True)
    chip(s, col(2) - 10, yb, "INFEASIBLE · SEARCH_TIMEOUT", "stop", w=W + 50)
    s.text(col(2) + 100, yb + 60, "giải thích ràng buộc xung đột", size=11.5, color=MUTED, italic=True)
    s.path(f"M{col(0) + 85},{y + 40} V{yb - 4}")
    s.path(f"M{col(0) + W - 10},{y + 40} C{col(0) + W + 20},{y + 70} {col(1) + 30},{yb - 30} {col(1) + 40},{yb - 4}")
    s.label(col(1) - 5, y + 70, "thiếu dữ liệu")
    s.path(f"M{col(1) + 140},{y + 40} C{col(1) + 160},{y + 70} {col(2) + 60},{yb - 30} {col(2) + 80},{yb - 4}")

    s.path(f"M{col(4) + 85},{y + 40} V{yb + 20} H{col(3) + 100}", arrow=False, color=BLUE, dash=True)
    s.path(f"M{col(3) + 100},{yb + 20} C{col(3) + 60},{yb + 20} {col(3) + 20},{y + 90} {col(3) - 10},{y + 70} "
           f"S{col(2) - 30},{y + 60} {col(1) + 150},{y + 43}", color=BLUE, dash=True)
    s.label(col(4) - 20, yb + 14, "giữ phần đã xong, không cộng vé 2 lần", color=BLUE)
    s.text(col(4) + 85, yb + 60, "bỏ yêu cầu bắt buộc → hỏi phụ huynh", size=11.5, color=MUTED, italic=True)

    legend(s, 30, 400, [("neutral", "Bắt đầu"), ("code", "Code / hợp lệ"), ("model", "Agent xử lý sự cố"),
                        ("stop", "Dừng, hỏi lại hoặc giải thích")])
    return s.render([LINE, BLUE])


if __name__ == "__main__":
    old = os.path.join(OUT, "trang-thai-3-de.svg")
    if os.path.exists(old):
        os.remove(old)
    for name, fn in [("kien-truc-ai.svg", architecture), ("trang-thai-c1.svg", states)]:
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            f.write(fn())
        print("wrote", name)
