
"""Kết nối OpenAI Chat Completions, với chế độ offline dựa trên căn cứ."""
import json
import os
from pathlib import Path
import re
import sys
from urllib.request import Request, urlopen

from tracing import model_call


ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
EVIDENCE_HEADER = "Căn cứ:\n"
INPUT_HEADER = "\n\nĐầu vào của người dùng:\n"


def _env_values():
    values = {}
    try:
        lines = ENV_FILE.read_text(encoding="utf-8-sig").splitlines()
    except FileNotFoundError:
        lines = []
    for line in lines:
        name, sep, value = line.strip().removeprefix("export ").partition("=")
        name = name.strip()
        if not sep or not re.fullmatch(r"(OPENAI_[A-Z_]+|MODEL_PROVIDER)", name):
            continue
        value = value.strip()
        quoted = re.fullmatch(r"""(['"])(.*?)\1\s*(?:#.*)?""", value)
        values[name] = quoted[2] if quoted else re.split(r"\s+#", value, maxsplit=1)[0]
    return values


def _offline_text(user):
    _, marker, contents = user.partition(EVIDENCE_HEADER)
    if marker:
        evidence, _, _ = contents.partition(INPUT_HEADER)
        if evidence.strip():
            return evidence.strip()
    return "Vini — trợ lý du lịch của Vintrip.\nVini cần thêm thông tin để tra cứu dữ liệu mẫu."


@model_call
def call_model(system: str, user: str) -> dict:
    config = _env_values()

    def setting(name, default=""):
        return os.environ.get(name, config.get(name, default)).strip()

    key = setting("OPENAI_API_KEY")
    force_offline = "--fake" in sys.argv[1:] or setting("MODEL_PROVIDER").lower() == "fake"
    if force_offline or not key:
        return {"text": _offline_text(user), "model": "offline-deterministic",
                "tokens_in": 0, "tokens_out": 0}

    model = setting("OPENAI_MODEL") or "gpt-4o-mini"
    base = (setting("OPENAI_BASE_URL") or "https://api.openai.com/v1").rstrip("/")
    if not base.endswith("/v1"):
        base += "/v1"
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
    }
    request = Request(f"{base}/chat/completions", method="POST",
                      data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                      headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    # 90 giây: câu trả lời dài (vd liệt kê cả catalog) có lúc vượt 30 giây ở run-1 (C1-21 timeout).
    with urlopen(request, timeout=90) as response:
        result = json.load(response)
    usage = result["usage"]
    return {"text": result["choices"][0]["message"]["content"] or "",
            "model": result.get("model") or model,
            "tokens_in": usage["prompt_tokens"], "tokens_out": usage["completion_tokens"]}
