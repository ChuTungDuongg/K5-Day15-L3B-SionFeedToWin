"""Vintrip commerce and verified itinerary through the offline SSE entry point."""

import asyncio
import json
from dataclasses import replace
from datetime import UTC, datetime
from uuid import uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from redis.exceptions import ConnectionError as RedisConnectionError

from app.api import chat as chat_api
from app.core.config import ChatSettings, get_chat_settings
from app.main import app
from app.services.assistant.admission import TurnGate
from app.services.assistant.skills.verified_itinerary import DANANG
from app.services.assistant.understand import get_role_llm
from app.services.assistant.verifier import verify_schedule


class DownRedis:
    def __getattr__(self, _name):
        async def unavailable(*_args):
            raise RedisConnectionError("offline demo")

        return unavailable


@pytest.fixture
def demo(monkeypatch):
    settings = ChatSettings(
        _env_file=None,
        chat_llm_enabled=True,
        openai_api_key="",
    )
    requests = []

    def core_offline(request):
        requests.append((request.url.path, json.loads(request.content)))
        raise httpx.ConnectError("offline demo", request=request)

    core = httpx.AsyncClient(
        base_url="https://core.test",
        transport=httpx.MockTransport(core_offline),
    )
    monkeypatch.setattr(chat_api, "get_core_client", lambda: core)
    gate = TurnGate(settings, DownRedis())
    monkeypatch.setitem(app.dependency_overrides, get_chat_settings, lambda: settings)
    monkeypatch.setitem(app.dependency_overrides, chat_api.get_gate, lambda: gate)
    yield TestClient(app), requests
    asyncio.run(core.aclose())


def events(client, message, **payload):
    response = client.post(
        "/chat",
        json={"conversationId": str(uuid4()), "message": message, **payload},
        headers={"Origin": "http://localhost:8080"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:8080"
    assert response.headers["content-type"].startswith("text/event-stream")
    frames = [frame.splitlines() for frame in response.text.strip().split("\n\n")]
    assert frames[-1][0] == "event: done"
    return {
        name.removeprefix("event: "): json.loads(data.removeprefix("data: "))
        for name, data in frames
    }


@pytest.mark.parametrize(
    ("cancel_at", "status", "fee", "refund"),
    [
        ("2026-12-07T19:00:00-08:00", "Miễn phí hủy", 0, 3_200_000),
        ("2026-12-08T07:00:00Z", "Miễn phí hủy", 0, 3_200_000),
        ("2026-12-08T08:00:00Z", "Phí một phần", 1_600_000, 1_600_000),
        ("2026-12-10T07:00:00Z", "Không hoàn tiền", 3_200_000, 0),
    ],
)
def test_cancel_cutoff_across_timezones(demo, cancel_at, status, fee, refund):
    client, calls = demo
    output = events(
        client,
        "Hủy phòng FLEX-48H, nhận phòng 10/12/2026, "
        f"hủy {cancel_at}, Asia/Ho_Chi_Minh, 3.200.000đ, 2 đêm, "
        "hotelSlug=coastal-pearl-da-nang",
    )
    card = output["cards"]["items"][0]
    assert card["kind"] == "cancel_policy"
    assert card["source"] == "Vintrip Policy Engine · [C1]"
    assert card["priceFrom"] == fee and card["totalPrice"] == refund
    assert card["lines"][0]["detail"] == status
    assert card["lines"][3]["detail"] == "14:00 08/12/2026 (+07:00)"
    assert card["lines"][4]["label"] == "[C1] Điều khoản trích dẫn"
    assert calls[0][0] == "/api/commerce/policies/evaluate"
    assert calls[0][1]["checkInIso"] == "2026-12-10T14:00:00+07:00"
    assert calls[0][1]["hotelSlug"] == "coastal-pearl-da-nang"
    assert output["done"]["degraded"] == ["redis"]
    assert output["done"]["usage"]["inputTokens"] == 0


def test_missing_cancel_time_g10_and_short_reply(demo):
    client, _ = demo
    output = events(client, "Hủy phòng FLEX-48H nhận phòng 10/12/2026, 2 đêm, 3,2 triệu")
    card = output["cards"]["items"][0]
    assert output["done"]["kind"] == "clarify"
    assert card["priceBasis"] == "unavailable"
    assert card["lines"][0]["detail"] == "Cần bổ sung thông tin"
    assert card["lines"][-1]["detail"] == "Thời điểm hủy dự kiến (ngày và giờ)"
    output = events(client, "10:00 ngày 08/12/2026", trip=output["trip"])
    assert output["done"]["kind"] == "answer"
    assert output["cards"]["items"][0]["totalPrice"] == 3_200_000


def test_booking_change_stays_a_draft(demo):
    client, calls = demo
    output = events(
        client,
        "Đổi phòng VT-2026-8841 từ Deluxe City View sang Premier Sea View (2 đêm); "
        "ghi chú: Ưu tiên tầng cao",
    )
    card = output["cards"]["items"][0]
    assert card["kind"] == "approval_draft"
    assert card["title"] == "Bản nháp đổi phòng · CHỜ NGƯỜI DÙNG DUYỆT"
    assert card["priceFrom"] == 900_000
    assert card["actions"] is None
    assert card["lines"][1]["detail"] == "Deluxe City View → Premier Sea View (2 đêm)"
    assert card["lines"][2]["detail"] == "+900.000đ"
    assert "Ưu tiên tầng cao" in card["lines"][3]["detail"]
    assert [path for path, _ in calls] == ["/api/commerce/bookings/draft-change"]


def test_verified_itinerary_and_budget(demo):
    client, calls = demo
    output = events(client, "Lập lịch trình Đà Nẵng 2 ngày, ngân sách 1,5 triệu")
    card = output["cards"]["items"][0]
    assert card["kind"] == "verified_itinerary"
    assert card["title"] == "Lịch trình Đà Nẵng 2 ngày · 0 xung đột"
    assert card["priceFrom"] == 750_000
    assert card["totalPrice"] == 1_500_000
    assert card["lines"][0]["label"] == "Ngày 1 · Sáng (08:30–11:00)"
    assert card["lines"][0]["detail"].endswith("~150.000đ")
    assert [line["label"] for line in card["lines"][-2:]] == ["Ngân sách", "Thời tiết"]
    assert not calls
    too_low = events(client, "Lập lịch trình Đà Nẵng 2 ngày, ngân sách 100.000đ")
    assert too_low["done"]["kind"] == "clarify"
    assert too_low["cards"]["items"] == []


def test_schedule_checks_opening_hours_and_overlap():
    first, second, *rest = DANANG
    assert verify_schedule((replace(first, opens="09:00"), second, *rest), 2, 1_500_000) is None
    overlap = replace(second, start="10:30", opens="10:00")
    assert verify_schedule((first, overlap, *rest), 2, 1_500_000) is None


@pytest.mark.parametrize("method", ["GET", "POST", "OPTIONS"])
def test_cors_preflight(demo, method):
    client, _ = demo
    response = client.options(
        "/chat",
        headers={
            "Origin": "http://localhost:8080",
            "Access-Control-Request-Method": method,
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert app.title == "Vintrip AI Service"
    assert response.headers["access-control-allow-methods"] == "GET, POST, OPTIONS"


def test_openai_defaults_apply_to_both_roles(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("CHAT_RESPONDER_PRICE_OUTPUT", "0.7")
    get_chat_settings.cache_clear()
    get_role_llm.cache_clear()
    try:
        for role, output_price in [("controller", 0.6), ("responder", 0.7)]:
            client = get_role_llm(role).inner
            assert client.model == "gpt-4o-mini"
            assert client.prices == {"input": 0.15, "cached_input": 0.075, "output": output_price}
            assert "reasoning_effort" not in client._body("", "", {})
    finally:
        get_role_llm.cache_clear()
        get_chat_settings.cache_clear()


def test_ocean_park_vinuni_verified_itinerary(demo):
    client, _calls = demo
    output = events(client, "Lập lịch trình 1 ngày VinUni Ocean Park ngân sách 1 triệu")
    cards = output["cards"]["items"]
    assert len(cards) == 1
    assert cards[0]["kind"] == "verified_itinerary"
    assert "Ocean Park" in cards[0]["title"]
    assert cards[0]["priceFrom"] == 630_000
    assert cards[0]["totalPrice"] == 1_000_000


@pytest.fixture
def c3_demo(demo, monkeypatch):
    from app.services.assistant.skills import flight_disruption as skill

    evaluate = skill.evaluate
    now = datetime(2026, 11, 27, 8, tzinfo=UTC)
    monkeypatch.setattr(skill, "evaluate", lambda request: evaluate(request, now=now))
    return demo


def test_c3_options_and_multiturn_change_stay_pending(c3_demo):
    client, calls = c3_demo
    output = events(client, "Chuyến bay bị huỷ, C3 DEMO-C3-001")
    card = output["cards"]["items"][0]
    assert card["kind"] == "flight_disruption"
    assert card["actions"] is None
    assert "MÔ PHỎNG" in card["source"]
    lines = {line["label"]: line["detail"] for line in card["lines"]}
    assert "400.000đ" in lines["DEMO-VT101"]
    assert "Không đủ chỗ" in lines["Loại DEMO-VT102"]
    output = events(client, "Đổi vé DEMO-VT101", trip=output["trip"])
    assert output["done"]["kind"] == "answer"
    card = output["cards"]["items"][0]
    assert "CHỜ NGƯỜI DÙNG DUYỆT" in card["title"]
    assert card["id"].startswith("C3-DRAFT-")
    again = events(client, "Đã duyệt, xác nhận", trip=output["trip"])
    assert again["cards"]["items"][0]["id"] == card["id"]
    assert not calls  # no supplier or booking mutation endpoint


@pytest.mark.parametrize("message", ["Giữ chỗ", "Đổi vé", "Hoàn tiền vé"])
def test_c3_drafts_are_read_only(c3_demo, message):
    client, calls = c3_demo
    output = events(client, f"C3 {message} DEMO-C3-001 sang DEMO-VT101")
    card = output["cards"]["items"][0]
    assert card["lines"][0]["detail"] == "PENDING_USER_APPROVAL"
    assert card["actions"] is None
    assert "Chưa giữ chỗ" in card["lines"][-1]["detail"]
    assert not calls


def test_c3_missing_booking_then_short_reply(c3_demo):
    client, _ = c3_demo
    output = events(client, "Chuyến bay của tôi bị huỷ")
    assert output["done"]["kind"] == "clarify"
    output = events(client, "DEMO-C3-001", trip=output["trip"])
    assert output["cards"]["items"][0]["lines"][0]["detail"] == "OPTIONS_READY"


def test_c3_deadline_correction_and_switch_back_to_hotel(c3_demo):
    client, _ = c3_demo
    output = events(client, "C3 DEMO-C3-001 đến trước 15:00")
    output = events(client, "2026-12-10T15:00:00+07:00", trip=output["trip"])
    lines = {line["label"]: line["detail"] for line in output["cards"]["items"][0]["lines"]}
    assert "DEMO-VT101" in lines
    assert "DEMO-VT103" not in lines
    assert "Đến sau giờ yêu cầu" in lines["Loại DEMO-VT103"]
    hotel = events(client, "Hoàn tiền phòng FLEX-48H", trip=output["trip"])
    assert hotel["cards"]["items"][0]["kind"] == "cancel_policy"
    assert hotel["trip"]["pendingFlightDisruption"] is None


@pytest.mark.parametrize(
    ("message", "status"),
    [
        ("C3 DEMO-C3-999", "MISSING_DATA"),
        ("C3 DEMO-C3-002", "NOT_ELIGIBLE"),
        ("C3 đổi vé DEMO-C3-001 sang DEMO-VT102", "OPTION_UNAVAILABLE"),
        ("C3 giữ chỗ DEMO-C3-001", "NEEDS_INPUT"),
        ("C3 DEMO-C3-001 đến trước 15:00", "NEEDS_INPUT"),
    ],
)
def test_c3_unverified_requests_never_create_drafts(c3_demo, message, status):
    client, calls = c3_demo
    output = events(client, message)
    card = output["cards"]["items"][0]
    assert card["lines"][0]["detail"] == status
    assert not card["id"].startswith("C3-DRAFT-")
    assert not calls


def test_c3_rejects_client_supplied_refund_amount(c3_demo):
    client, _ = c3_demo
    response = client.post(
        "/chat",
        json={
            "conversationId": str(uuid4()),
            "message": "Hoàn tiền vé C3",
            "trip": {
                "pendingFlightDisruption": {"bookingCode": "DEMO-C3-001", "refundVnd": 99999999}
            },
        },
    )
    assert response.status_code == 422


def test_c3_removing_deadline_restores_options(c3_demo):
    client, calls = c3_demo
    output = events(client, "C3 DEMO-C3-001 đến trước 2026-12-10T12:00:00+07:00")
    assert output["cards"]["items"][0]["lines"][0]["detail"] == "NO_OPTIONS"
    output = events(client, "Bỏ giới hạn giờ đến", trip=output["trip"])
    assert output["cards"]["items"][0]["lines"][0]["detail"] == "OPTIONS_READY"
    assert output["trip"]["pendingFlightDisruption"]["arrivalBefore"] is None
    assert not calls


def test_c3_suggestions_only_propose_available_flights(c3_demo, monkeypatch):
    from app.services.assistant.skills import c3_engine

    snapshot = c3_engine.load_snapshot()
    snapshot["flights"][0]["seats"] = 0
    monkeypatch.setattr(c3_engine, "load_snapshot", lambda: snapshot)
    client, calls = c3_demo
    output = events(client, "C3 xem phương án DEMO-C3-001")
    suggestions = output["suggestions"]["items"]
    assert any("Giữ chỗ DEMO-VT103" == s for s in suggestions)
    assert any("Đổi vé DEMO-VT103" == s for s in suggestions)
    assert not any("DEMO-VT101" in s for s in suggestions)
    assert not calls


def test_c3_refund_after_an_invalid_deadline(c3_demo):
    client, calls = c3_demo
    output = events(client, "C3 DEMO-C3-001 đến trước 15:00")
    output = events(client, "Hoàn tiền vé C3", trip=output["trip"])
    assert output["cards"]["items"][0]["lines"][0]["detail"] == "PENDING_USER_APPROVAL"
    assert not calls
