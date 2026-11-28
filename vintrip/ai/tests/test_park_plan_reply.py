"""Vini's C1 chat wording: no status codes, tool names or internal notes; numbers unchanged."""

import re

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api import c1
from app.main import app
from app.services.park_plan_reply import build_chat_reply

INTERNAL_WORDS = (
    "get_",
    "estimate_walk",
    "validate_park",
    "build_park",
    "mô phỏng",
    "snapshot",
    "Catalog",
    "intensity",
    "P0",
    "NEEDS_INPUT",
    "VALID",
    "Trạng thái",
)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "fake")

    def down(url, payload):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(c1, "validate_park_plan_on_core", down)
    return TestClient(app)


@pytest.mark.parametrize(
    "question",
    [
        "Công viên Mẫu, 2 người lớn, bé 7 tuổi cao 1m22, đi 9h–14h, ngân sách 1tr4, cần ăn trưa.",
        "Công viên Mẫu có những suất show nào buổi sáng?",
        "Công viên Mẫu, 2 người lớn, 10:00–13:00, ngân sách 900k. Bắt buộc chơi Vườn âm thanh.",
        "Công viên Mẫu, 2 người lớn, bé 7 tuổi cao 1m22, đi 9h–14h, ngân sách 500k.",
        "Hôm nay Công viên Mẫu, 2 người lớn, 9h–14h, ngân sách 1 triệu, xem show 11:00",
        "Công viên Mẫu, 2 người lớn, bé 4 tuổi cao 95 phân, 9h–14h, ngân sách 2m, chơi tàu lượn",
        "Lập lịch Công viên Mẫu cho 2 bé.",
    ],
)
def test_reply_has_no_internal_wording(client, question):
    body = client.post("/c1/ask", json={"text": question}).json()
    leaked = [word for word in INTERNAL_WORDS if word in body["reply"]]
    assert not leaked, body["reply"]


def test_reply_keeps_every_time_and_price(client):
    question = (
        "Công viên Mẫu, 2 người lớn, bé 7 tuổi cao 1m22, đi 9h–14h, ngân sách 1tr4, cần ăn trưa."
    )
    body = client.post("/c1/ask", json={"text": question}).json()
    assert body["status"] == "VALID"
    pattern = r"\d{2}:\d{2}–\d{2}:\d{2}|\d{1,3}(?:\.\d{3})+đ"
    assert re.findall(pattern, body["reply"]) and set(re.findall(pattern, body["reply"])) <= set(
        re.findall(pattern, body["output"])
    )
    assert "Tổng cộng: 1.115.000đ (còn dư 285.000đ so với ngân sách 1.400.000đ)" in body["reply"]


def test_height_rule_reads_like_a_person_wrote_it():
    output = (
        "Trạng thái: CHƯA HỢP LỆ (validate_park_plan báo vi phạm) · snapshot X.\n"
        "Vi phạm: bé 4 tuổi cao 95cm < 120cm yêu cầu của Tàu lượn."
    )
    reply = build_chat_reply(output, "CHƯA HỢP LỆ")
    assert "bé 4 tuổi cao 95 cm, chưa đủ 120 cm theo quy định của Tàu lượn" in reply
