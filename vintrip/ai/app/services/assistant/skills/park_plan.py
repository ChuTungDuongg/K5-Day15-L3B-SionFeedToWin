"""Hand a park day-plan question over to the C1 agent (POST /c1/ask) through a popup card.

The chat does not plan the day itself: the app shows this card and, when the user opens it,
sends the same question to the C1 flow (planner, validator and core-api check).
"""

import re
from datetime import UTC, datetime

from app.services.assistant.schemas import Answer, Card, CardLine
from app.services.summary.vi_text import normalize_text

MAX_QUESTION_CHARS = 4000


def is_park_plan(message: str) -> bool:
    """Questions about the mock park (Công viên Mẫu), or planning a day at an amusement park."""
    folded = normalize_text(message)
    if "cong vien mau" in folded:
        return True
    return bool(
        re.search(r"\bkhu vui choi\b", folded) and re.search(r"\b(lich|xep|len ke hoach)\b", folded)
    )


def park_plan_handoff(message: str) -> Answer:
    question = message.strip()[:MAX_QUESTION_CHARS]
    return Answer(
        kind="answer",
        text=(
            "Vini đã chuyển yêu cầu sang trợ lý lập lịch khu vui chơi để xếp lịch, tính chi phí và "
            "kiểm tra điều kiện từng trò cho cả nhà."
        ),
        cards=[
            Card(
                ref="r1",
                id="c1:park-plan",
                kind="park_plan",
                title="Lập lịch Công viên Mẫu",
                price_from=None,
                price_basis="unavailable",
                observed_at=datetime.now(UTC),
                source="Trợ lý lập lịch Vintrip · chưa đặt vé",
                lines=[CardLine(label="Câu hỏi", detail=question)],
            )
        ],
    )
