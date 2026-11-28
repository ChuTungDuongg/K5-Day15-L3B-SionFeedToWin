"""C1 in the chat: Vini hands park day-plan questions to the C1 agent through a popup card."""

import asyncio
from datetime import date
from typing import Any, cast
from uuid import uuid4

import pytest

from app.services.assistant.schemas import ChatRequest
from app.services.assistant.skills.park_plan import is_park_plan, park_plan_handoff
from app.services.assistant.turn import Turn as ChatTurn
from app.services.assistant.understand import deterministic_understanding

QUESTION = (
    "Công viên Mẫu, 2 người lớn, bé 6 tuổi cao 115 cm, đi 9h–13h, ngân sách 1,2 triệu, cần ăn trưa."
)


@pytest.mark.parametrize(
    "message",
    [
        QUESTION,
        "cong vien mau co nhung suat show nao buoi chieu?",
        "Xếp lịch đi khu vui chơi cả ngày cho nhà mình nhé",
    ],
)
def test_detects_park_plan_questions(message):
    assert is_park_plan(message)
    request = ChatRequest(conversation_id=uuid4(), message=message)
    understanding = deterministic_understanding(request)
    assert understanding is not None and understanding.intent == "park_plan"


@pytest.mark.parametrize(
    "message",
    [
        "Lịch trình Đà Nẵng 2 ngày ngân sách 3 triệu",
        "Khách sạn gần Ocean Park",
        "Chính sách huỷ phòng FLEX-48H",
        "Khu vui chơi nào ở Hà Nội đẹp?",
    ],
)
def test_other_travel_questions_stay_with_vini(message):
    assert not is_park_plan(message)
    understanding = deterministic_understanding(
        ChatRequest(conversation_id=uuid4(), message=message)
    )
    assert understanding is None or understanding.intent != "park_plan"


def test_handoff_card_carries_the_question_and_no_price():
    answer = park_plan_handoff(f"  {QUESTION}  ")
    assert answer.kind == "answer"
    [card] = answer.cards
    assert card.kind == "park_plan"
    assert card.price_from is None and card.price_basis == "unavailable" and card.actions is None
    assert card.lines is not None and card.lines[0].detail == QUESTION
    assert "chưa đặt vé" in (card.source or "")
    assert "mô phỏng" not in answer.text and "C1" not in answer.text


def test_turn_answers_with_handoff_card_without_calling_skills():
    request = ChatRequest(conversation_id=uuid4(), message=QUESTION)
    understanding = deterministic_understanding(request)
    assert understanding is not None

    async def go():
        turn = ChatTurn(
            request,
            understanding,
            core=cast(Any, None),  # the handoff never reaches core or weather
            weather=cast(Any, None),
            today=date(2026, 11, 28),
        )
        answer = await turn.answer()
        return answer, turn.next_trip(answer)

    answer, trip = asyncio.run(go())
    assert [card.kind for card in answer.cards] == ["park_plan"]
    assert trip.place == ""
