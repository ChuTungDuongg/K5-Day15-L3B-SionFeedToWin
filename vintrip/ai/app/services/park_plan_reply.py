"""Turn the C1 planner's evidence text into what Vini says to a parent in the chat.

The planner (codebase/c1_flow) writes tool names, snapshot ids and mock-data notes on purpose: they
are the evidence the eval reads. A parent only needs the plan, the money and what to decide, so this
layer rewrites the wording. It never changes a time, a price or a verdict.
"""

import re

INVALID_STATUS = "CHƯA HỢP LỆ"
# Line c1_flow adds when the chosen show is cancelled today but the parent gave no date.
TODAY_NOTE = "Đi hôm nay thì bạn báo Vini"

STATUS_LABELS = {
    "VALID": "Lịch đã kiểm tra",
    "NEEDS_INPUT": "Cần thêm thông tin",
    "MISSING_DATA": "Chưa đủ dữ liệu",
    "INFEASIBLE": "Chưa xếp được",
    "SEARCH_TIMEOUT": "Chưa tìm xong",
    INVALID_STATUS: "Cần điều chỉnh",
    "TỪ CHỐI": "Ngoài phạm vi hỗ trợ",
    "THÔNG TIN": "Thông tin",
}

_STATUS_LINE = re.compile(
    r"^Trạng thái: (?:VALID|NEEDS_INPUT|MISSING_DATA|INFEASIBLE|SEARCH_TIMEOUT|TỪ CHỐI|"
    r"CHƯA HỢP LỆ(?: \([^)]*\))?)(?:\. | · )?(?P<rest>.*)$"
)
_DROPPED_LINES = {
    "Vini chưa xếp lịch để không đoán thông tin quyết định.",
    "Vini chưa xếp lịch cho tới khi bạn chọn.",
    "Vini chưa trả lịch mới cho tới khi bạn xác nhận đổi yêu cầu.",
}
# Whole-line rewrites, tried in order; the first match wins.
_LINE_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"^Lịch:$"), "Lịch trình đề xuất:"),
    (re.compile(r"^Bảng tiền \(.*\):$"), "Chi phí dự kiến:"),
    (re.compile(r"^Kiểm độc lập: 0 vi phạm;.*$"), ""),
    (
        re.compile(r"^Ưu tiên các trò có nhãn intensity = nhẹ.*$"),
        "Vini ưu tiên các trò nhẹ nhàng, hợp với bé.",
    ),
    (
        re.compile(r"^Kiểm lịch có các trò bạn yêu cầu: (.+)\.$"),
        r"Vini đã thử xếp lịch có \1 theo yêu cầu của bạn.",
    ),
    (
        re.compile(r"^Không tự nới điều kiện\. Phương án thay: bỏ (.+?) \(.*\):$"),
        r"Vini không nới điều kiện an toàn của trò chơi. Phương án thay thế: bỏ \1.",
    ),
    (re.compile(r"^Vi phạm: (.+)$"), r"Điểm chưa phù hợp: \1"),
    (
        re.compile(r"^Catalog thiếu giá cho hoạt động bắt buộc (.+)\.$"),
        r"Hiện Vini chưa có giá của \1 nên chưa thể xếp lịch có trò này. "
        r"Bạn có muốn Vini xếp lịch không gồm \1 không?",
    ),
    (re.compile(r"^Lịch show (.+?) tại (.+?) \(.*\):$"), r"Lịch diễn \1 tại \2:"),
    (
        re.compile(r"^- Suất (\S+) · có mặt trước (\d+) phút \(trước (\S+)\) · .*$"),
        r"- Suất \1: nên có mặt trước \3 (sớm \2 phút).",
    ),
    (
        re.compile(r"^Không có suất nào khác trong dữ liệu\..*$"),
        "Ngoài các suất trên không còn suất nào khác. Vào ngày đi, Vini sẽ kiểm tra thông báo huỷ "
        "suất của công viên.",
    ),
    (re.compile(r"^Gợi ý nới: (.+)$"), r"Bạn có thể cân nhắc: \1"),
    (
        re.compile(r"^(\s+)Tổng(.*?): (\S+) · còn (\S+) \(ngân sách (\S+)\)$"),
        r"\1Tổng cộng\2: \3 (còn dư \4 so với ngân sách \5)",
    ),
]
# Phrases rewritten anywhere in a line.
_PHRASE_RULES: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r", estimate_walk\)"), ")"),
    (re.compile(r" \(giá mô phỏng[^)]*\)"), ""),
    (re.compile(r" ?·? ?dữ liệu mô phỏng(?: Công viên Mẫu)?"), ""),
    (re.compile(r"get_park_incidents ghi (suất .+?) hôm nay"), r"Công viên thông báo \1 hôm nay"),
    (re.compile(r" theo get_park_incidents"), " theo thông báo của công viên"),
    (
        re.compile(r"(\S.*?) cao (\d+)cm < (\d+)cm yêu cầu của (.+?)(?=[;.]|$)"),
        r"\1 cao \2 cm, chưa đủ \3 cm theo quy định của \4",
    ),
    (re.compile(r"; chờ (\d+) \+ chơi (\d+) phút\)"), r" · chờ khoảng \1 phút, chơi \2 phút)"),
    (re.compile(r", (ngoài trời|trong nhà) ·"), r" · \1 ·"),
    (
        re.compile(r"đã là (\S+) > ngân sách (\S+), vượt (\S+)\."),
        r"đã là \1, vượt ngân sách \2 khoảng \3.",
    ),
]


def _ask_for_missing(missing: str) -> list[str]:
    """'tuổi và chiều cao của từng bé (bé 1) — lý do; ngân sách.' → câu hỏi lại kèm lý do riêng."""
    asks, reasons = [], []
    for part in missing.rstrip(".").split("; "):
        ask, _, reason = part.partition(" — ")
        asks.append(ask.strip())
        if reason:
            reasons.append(reason.strip()[0].upper() + reason.strip()[1:] + ".")
    return [f"Để xếp được lịch, bạn cho Vini biết thêm {', '.join(asks)} nhé.", *reasons]


def _status_sentence(rest: str, status: str, *, is_first: bool) -> list[str]:
    if rest.startswith("Vini cần thêm: "):
        return _ask_for_missing(rest.removeprefix("Vini cần thêm: "))
    if rest.startswith("snapshot"):
        if is_first and status == "VALID":
            return [
                "Vini đã lên lịch cho cả nhà và kiểm tra lại giờ giấc, điều kiện từng trò và ngân "
                "sách: mọi thứ đều khớp."
            ]
        return ["Phương án thay thế dưới đây đã được kiểm tra đầy đủ:"]
    if not rest:
        return []
    return [_polish(rest)]


def _polish(line: str) -> str:
    for pattern, replacement in _LINE_RULES:
        if pattern.match(line):
            line = pattern.sub(replacement, line)
            break
    for pattern, replacement in _PHRASE_RULES:
        line = pattern.sub(replacement, line)
    return line


def build_chat_reply(output: str, status: str) -> str:
    """Lời Vini nói trong khung chat: không mã trạng thái, tên công cụ hay ghi chú nội bộ."""
    lines = output.splitlines()
    if lines and lines[0].startswith("Vini —"):
        lines = lines[1:]
    reply: list[str] = []
    seen_status = False
    for line in lines:
        if line in _DROPPED_LINES:
            continue
        if line.startswith("Trạng thái sau kiểm của core-api: "):
            reasons = line.split(". ", 1)[1] if ". " in line else ""
            reply.append(f"Khi kiểm tra lại trên hệ thống, lịch này chưa đạt: {reasons}")
            continue
        match = _STATUS_LINE.match(line)
        if match:
            if line.startswith(f"Trạng thái: {INVALID_STATUS}"):
                reply.append("Lịch có yêu cầu chưa phù hợp, Vini nêu chi tiết bên dưới.")
            else:
                rest = match["rest"].strip()
                reply.extend(_status_sentence(rest, status, is_first=not seen_status))
            seen_status = True
            continue
        polished = _polish(line)
        if polished.strip():
            reply.append(polished)
    return "\n".join(reply).strip()


def build_input_hint(output: str) -> str:
    """Gợi ý cách trả lời khi Vini cần hỏi thêm."""
    if "đổi sang suất khác" in output:
        return "Ví dụ: đổi sang suất 12:30, hoặc: bỏ show"
    if TODAY_NOTE in output:
        return "Ví dụ: nhà mình đi hôm nay"
    hints = []
    if "chiều cao" in output or "tuổi" in output:
        hints.append("bé 1 6 tuổi cao 1m15, bé 2 9 tuổi cao 1m32")
    if "số người lớn" in output:
        hints.append("2 người lớn")
    if "khung giờ" in output:
        hints.append("đi 9h–15h")
    if "ngân sách" in output.split("Vini cần thêm:", 1)[-1]:
        hints.append("ngân sách 1,5 triệu")
    return ("Ví dụ: " + ", ".join(hints)) if hints else "Trả lời Vini…"
