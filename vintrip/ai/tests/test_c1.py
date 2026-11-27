from fastapi.testclient import TestClient

from app.main import app


def test_ask_c1(monkeypatch):
    monkeypatch.setenv("MODEL_PROVIDER", "fake")
    client = TestClient(app)
    response = client.post("/c1/ask", json={"text": "Công viên Mẫu, 2 người lớn, "
                                           "09:00–12:00, ngân sách 900.000 đồng."})
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
