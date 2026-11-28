import json
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from app.api import c1
from app.clients.park_plans import CoreSnapshotMismatchError, ParkPlanValidationResponse
from app.main import app


def test_ask_c1(monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "fake")
    client = TestClient(app)
    response = client.post(
        "/c1/ask", json={"text": "Công viên Mẫu, 2 người lớn, 09:00–12:00, ngân sách 900.000 đồng."}
    )
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "VALID"
    assert body["snapshot_id"] in body["output"]
    assert "validate_park_plan" in [event["name"] for event in body["trace"]]
    assert all(set(event) == {"kind", "name", "latency_s"} for event in body["trace"])
    missing = client.post("/c1/ask", json={"text": "Lập lịch Công viên Mẫu cho 2 bé."}).json()
    assert missing["status"] == "NEEDS_INPUT"
    assert "validate_park_plan" not in [event["name"] for event in missing["trace"]]
    assert client.post("/c1/ask", json={"text": " "}).status_code == 422


def _family_question() -> dict:
    return {
        "text": "Công viên Mẫu, 2 người lớn, bé 7 tuổi cao 122 cm. Đi 09:00–14:00, ngân sách "
        "1.400.000 đồng, ưu tiên trò nhẹ và cần ăn trưa."
    }


def test_ask_c1_sends_plan_to_core_and_keeps_valid(monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "fake")
    sent = []

    def fake_core(url, payload):
        sent.append((url, payload))
        return ParkPlanValidationResponse(
            valid=True,
            violations=[],
            total_vnd=1,
            breakdown=[],
            snapshot_id=payload["snapshotId"],
            is_mock=True,
            validated_by="core-api",
        )

    monkeypatch.setattr(c1, "validate_park_plan_on_core", fake_core)
    body = TestClient(app).post("/c1/ask", json=_family_question()).json()
    assert body["status"] == "VALID"
    assert body["core_validation"]["status"] == "VALID"
    assert body["core_validation"]["validatedBy"] == "core-api"
    assert body["plan"] and len(sent) == 1
    url, payload = sent[0]
    assert url.startswith("http")
    assert payload["parkId"] == "cong-vien-mau"
    assert payload["request"]["members"][2] == {
        "kind": "child",
        "label": "bé 7 tuổi (122cm)",
        "age": 7,
        "heightCm": 122,
    }
    assert payload["request"]["lunch"]["minDurationMin"] == 45
    assert [item["id"] for item in payload["items"]] == [item["id"] for item in body["plan"]]


def test_ask_c1_downgrades_when_core_rejects(monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "fake")

    def rejecting_core(url, payload):
        return ParkPlanValidationResponse(
            valid=False,
            violations=["Tổng 2.000.000đ vượt ngân sách 1.400.000đ"],
            total_vnd=2_000_000,
            breakdown=[],
            snapshot_id=payload["snapshotId"],
            is_mock=True,
            validated_by="core-api",
        )

    monkeypatch.setattr(c1, "validate_park_plan_on_core", rejecting_core)
    body = TestClient(app).post("/c1/ask", json=_family_question()).json()
    assert body["status"] == "CHƯA HỢP LỆ"
    assert "vượt ngân sách 1.400.000đ" in body["output"]
    assert body["core_validation"]["status"] == "INVALID"


def test_ask_c1_core_unreachable_or_stale(monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "fake")

    def down(url, payload):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(c1, "validate_park_plan_on_core", down)
    body = TestClient(app).post("/c1/ask", json=_family_question()).json()
    assert body["status"] == "VALID"
    assert body["core_validation"]["status"] == "UNAVAILABLE"

    def stale(url, payload):
        raise CoreSnapshotMismatchError("CVM-new")

    monkeypatch.setattr(c1, "validate_park_plan_on_core", stale)
    body = TestClient(app).post("/c1/ask", json=_family_question()).json()
    assert body["status"] == "CHƯA HỢP LỆ"
    assert body["core_validation"] == {
        "status": "SNAPSHOT_MISMATCH",
        "snapshotId": body["snapshot_id"],
        "currentSnapshotId": "CVM-new",
    }


def test_core_snapshot_fixture_matches_planner_data():
    """core-api và bộ lập lịch phải đọc cùng một snapshot Công viên Mẫu."""
    repo = next(
        p for p in Path(__file__).resolve().parents if (p / "data" / "cong_vien_mau.json").is_file()
    )
    fixture = (
        repo / "vintrip/be/apps/core-api/src/modules/commerce/park-plans/infra/"
        "cong-vien-mau.snapshot.ts"
    ).read_text(encoding="utf-8")
    core_json = fixture[fixture.index("= {") + 2 : fixture.rindex("}") + 1]
    planner = json.loads((repo / "data" / "cong_vien_mau.json").read_text(encoding="utf-8"))
    assert json.loads(core_json) == planner


def test_ask_c1_asks_back_in_plain_words_then_uses_the_answer(monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "fake")
    monkeypatch.setattr(c1, "validate_park_plan_on_core", _unreachable_core)
    client = TestClient(app)
    first = "Công viên Mẫu, 2 người lớn và 2 bé, đi 9h–14h, ngân sách 1,6 triệu."
    asked = client.post("/c1/ask", json={"text": first}).json()
    assert asked["status"] == "NEEDS_INPUT"
    assert asked["status_label"] == "Cần thêm thông tin"
    assert "NEEDS_INPUT" not in asked["reply"] and "Trạng thái" not in asked["reply"]
    assert asked["reply"].startswith("Để xếp được lịch, bạn cho Vini biết thêm tuổi và chiều cao")
    assert asked["input_hint"].startswith("Ví dụ:")

    answered = client.post(
        "/c1/ask",
        json={"text": "bé lớn 8 tuổi cao 128 cm, bé nhỏ 5 tuổi cao 108 cm", "previous": [first]},
    ).json()
    assert answered["status"] == "VALID"
    assert answered["reply"].startswith("Vini đã lên lịch cho cả nhà và kiểm tra lại")
    assert answered["input_hint"] == ""


def test_later_turn_overrides_earlier_values(monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "fake")
    monkeypatch.setattr(c1, "validate_park_plan_on_core", _unreachable_core)
    turns = c1.Question(
        text="tăng ngân sách lên 2 triệu",
        previous=["Công viên Mẫu, 2 người lớn, đi 9h–12h, ngân sách 800.000 đồng."],
    )
    assert c1.merge_turns(turns).startswith("tăng ngân sách lên 2 triệu Công viên Mẫu")
    body = TestClient(app).post("/c1/ask", json=turns.model_dump()).json()
    assert "ngân sách 2.000.000đ" in body["output"]


def test_previous_turns_are_bounded():
    client = TestClient(app)
    response = client.post("/c1/ask", json={"text": "Công viên Mẫu", "previous": ["x"] * 11})
    assert response.status_code == 422


def _unreachable_core(url, payload):
    raise httpx.ConnectError("down")


def test_cancelled_show_today_is_asked_back_then_replaced(monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "fake")
    monkeypatch.setattr(c1, "validate_park_plan_on_core", _unreachable_core)
    client = TestClient(app)
    first = (
        "Công viên Mẫu, 2 người lớn, bé 8 tuổi cao 128 cm, đi 9h–14h, ngân sách 1,5 triệu, "
        "muốn xem show 11:00."
    )
    planned = client.post("/c1/ask", json={"text": first}).json()
    assert planned["status"] == "VALID"
    assert "nếu nhà mình đi hôm nay" in planned["reply"]
    assert planned["input_hint"] == "Ví dụ: nhà mình đi hôm nay"

    asked = client.post("/c1/ask", json={"text": "nhà mình đi hôm nay", "previous": [first]}).json()
    assert asked["status"] == "NEEDS_INPUT"
    assert "suất 11:00 hôm nay đã huỷ" in asked["reply"]
    assert asked["input_hint"] == "Ví dụ: đổi sang suất 12:30, hoặc: bỏ show"

    previous = [first, "nhà mình đi hôm nay"]
    moved = client.post(
        "/c1/ask", json={"text": "đổi sang suất 12:30", "previous": previous}
    ).json()
    assert moved["status"] == "VALID"
    assert "Show Vũ điệu đại dương suất 12:30" in moved["output"]
    assert "suất 11:00 (có mặt" not in moved["output"]
    dropped = client.post("/c1/ask", json={"text": "bỏ show", "previous": previous}).json()
    assert dropped["status"] == "VALID" and "Show Vũ điệu" not in dropped["output"]
