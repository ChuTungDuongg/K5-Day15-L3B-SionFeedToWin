"""OpenAI adapter (Chat Completions), httpx like the moderation client; same retry loop as
DeepSeek, which speaks the same wire format.

Differences from DeepSeek:
- response_format json_schema with strict: OpenAI checks the schema itself
  (build_llm_json_schema is written for strict mode);
- max_completion_tokens instead of max_tokens, and no temperature: reasoning models reject
  any value but the default;
- cached prompt tokens are in usage.prompt_tokens_details.cached_tokens.
No default model and no default prices: OpenAI renames models often and sources disagree on
the current list (2026-11-11), so LLM_MODEL and the LLM_PRICE_* settings must be set (cost
must be recorded for every call, RULES §10).
"""

from collections.abc import Mapping
from typing import Any, TypeGuard

import httpx
from pydantic import SecretStr

from app.clients.llm.base import LlmResult
from app.clients.llm.deepseek import DeepSeekClient

GPT_6_LUNA_MODEL = "gpt-6-luna"
# Standard GPT-6 Luna pricing (USD per 1M tokens); reasoning tokens live inside output_tokens.
GPT_6_LUNA_PRICES: dict[str, float] = {"input": 0.10, "cached_input": 0.01, "output": 0.50}


class OpenAILlmClient(DeepSeekClient):
    KEY_NAME = "OPENAI_API_KEY"

    def __init__(
        self,
        api_key: SecretStr,
        *,
        model: str,
        prices: Mapping[str, float],  # USD per 1M tokens: input, cached_input, output
        base_url: str = "https://api.openai.com/v1",
        reasoning_effort: str = "minimal",
        **kwargs: Any,
    ) -> None:
        if not model:
            raise ValueError("LLM_MODEL is required for openai")
        super().__init__(api_key, model=model, base_url=base_url, **kwargs)
        self.prices = dict(prices)
        self.reasoning_effort = reasoning_effort

    def _body(self, system: str, user: str, schema: dict[str, Any]) -> dict[str, Any]:
        # Reasoning models count thinking in max_completion_tokens: by default gpt-5-nano spent
        # all 3,000 on it and returned nothing (live eval 2026-11-11); "minimal" used 0 and
        # answered in 3 s. Empty means not sent, for models without reasoning (gpt-4o-mini).
        effort = {"reasoning_effort": self.reasoning_effort} if self.reasoning_effort else {}
        return effort | {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "summary", "schema": schema, "strict": True},
            },
            "max_completion_tokens": self.max_output_tokens,
        }

    def _cost(self, usage: dict[str, Any]) -> float:
        prompt = int(usage.get("prompt_tokens", 0))
        cached = int((usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0))
        out = int(usage.get("completion_tokens", 0))
        p = self.prices
        return (
            (prompt - cached) * p["input"] + cached * p["cached_input"] + out * p["output"]
        ) / 1e6


def _is_non_negative_int(value: object) -> TypeGuard[int]:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def parse_responses_usage(
    payload: Mapping[str, Any], prices: Mapping[str, float]
) -> tuple[bool, int, int, int | None, int | None, float]:
    """Parse OpenAI Responses API usage without double-counting reasoning tokens.

    In OpenAI Responses API:
    - input_tokens includes input_tokens_details.cached_tokens.
    - output_tokens includes output_tokens_details.reasoning_tokens (billed at output rate).
    Returns (usage_reported, input_tokens, output_tokens, cached, reasoning, cost_usd).
    """
    usage = payload.get("usage")
    if not isinstance(usage, Mapping):
        return False, 0, 0, None, None, 0.0
    input_tokens = usage.get("input_tokens")
    output_tokens = usage.get("output_tokens")
    if not _is_non_negative_int(input_tokens) or not _is_non_negative_int(output_tokens):
        return False, 0, 0, None, None, 0.0

    input_details = usage.get("input_tokens_details")
    cached_tokens: int | None = None
    if isinstance(input_details, Mapping) and "cached_tokens" in input_details:
        raw_cached = input_details.get("cached_tokens")
        if not _is_non_negative_int(raw_cached) or raw_cached > input_tokens:
            return False, 0, 0, None, None, 0.0
        cached_tokens = raw_cached

    output_details = usage.get("output_tokens_details")
    reasoning_tokens: int | None = None
    if isinstance(output_details, Mapping) and "reasoning_tokens" in output_details:
        raw_reasoning = output_details.get("reasoning_tokens")
        if _is_non_negative_int(raw_reasoning):
            reasoning_tokens = raw_reasoning

    cached = cached_tokens or 0
    uncached = input_tokens - cached
    cost_usd = (
        uncached * prices["input"]
        + cached * prices["cached_input"]
        + output_tokens * prices["output"]
    ) / 1_000_000
    return True, input_tokens, output_tokens, cached_tokens, reasoning_tokens, cost_usd


def extract_responses_text(payload: Mapping[str, Any]) -> tuple[str, str]:
    """Return (text, finish_reason) from a Responses API JSON payload."""
    status = str(payload.get("status") or "")
    incomplete = payload.get("incomplete_details")
    incomplete_reason = (
        str(incomplete.get("reason") or "") if isinstance(incomplete, Mapping) else ""
    )

    fragments: list[str] = []
    has_refusal = False
    output_items = payload.get("output")
    if isinstance(output_items, list):
        for item in output_items:
            if not isinstance(item, Mapping):
                continue
            content = item.get("content")
            if not isinstance(content, list):
                continue
            for part in content:
                if not isinstance(part, Mapping):
                    continue
                part_type = part.get("type")
                if part_type == "output_text" and isinstance(part.get("text"), str):
                    fragments.append(part["text"])
                elif part_type == "refusal":
                    has_refusal = True

    text = "".join(fragments)
    if not text and isinstance(payload.get("output_text"), str):
        text = payload["output_text"]

    if status == "incomplete" and incomplete_reason == "max_output_tokens":
        return text, "length"
    if has_refusal:
        return text, "refusal"
    if status == "incomplete":
        return text, incomplete_reason or "incomplete"
    if status and status != "completed":
        return text, status
    return text, "stop"


class OpenAIResponsesClient:
    """Direct OpenAI Responses API adapter (POST /v1/responses) for GPT-6 Luna structured outputs.

    Single-attempt per call (no hidden SDK retries) so callers enforce strict call/deadline budgets.
    Never attaches OpenAI hosted tools (web_search, file_search, code_interpreter).
    """

    KEY_NAME = "OPENAI_API_KEY"

    def __init__(
        self,
        api_key: SecretStr,
        *,
        model: str = GPT_6_LUNA_MODEL,
        prices: Mapping[str, float] = GPT_6_LUNA_PRICES,
        base_url: str = "https://api.openai.com/v1",
        reasoning_effort: str = "low",
        timeout_seconds: float = 15.0,
        max_output_tokens: int = 1500,
        schema_name: str = "room_upgrades_output",
        http: httpx.Client | None = None,
        async_http: httpx.AsyncClient | None = None,
    ) -> None:
        if not api_key.get_secret_value().strip():
            raise ValueError(f"{self.KEY_NAME} is empty")
        if not model.strip():
            raise ValueError("ROOM_UPGRADES_LLM_MODEL is required for openai responses")
        self.api_key = api_key
        self.model = model
        self.prices = dict(prices)
        self.reasoning_effort = reasoning_effort
        self.max_output_tokens = max_output_tokens
        self.schema_name = schema_name
        self._base_url = base_url.rstrip("/")
        self._timeout_seconds = timeout_seconds
        self.http = http
        self.async_http = async_http

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key.get_secret_value()}"}

    def _body(
        self, system: str, user: str, schema: dict[str, Any], *, schema_name: str | None = None
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self.model,
            "instructions": system,
            "input": [
                {
                    "role": "user",
                    "content": [{"type": "input_text", "text": user}],
                }
            ],
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": schema_name or self.schema_name,
                    "strict": True,
                    "schema": schema,
                }
            },
            "max_output_tokens": self.max_output_tokens,
            "store": False,
        }
        if self.reasoning_effort:
            body["reasoning"] = {"effort": self.reasoning_effort}
        return body

    def _parse(self, data: Any) -> LlmResult:
        if not isinstance(data, Mapping):
            raise ValueError("Responses API payload must be a JSON object")
        text, finish_reason = extract_responses_text(data)
        usage_reported, inp, out, cached, reasoning, cost = parse_responses_usage(data, self.prices)
        raw_model = data.get("model")
        model_name = raw_model if isinstance(raw_model, str) and raw_model else self.model
        raw_id = data.get("id")
        response_id = raw_id if isinstance(raw_id, str) and raw_id else None
        return LlmResult(
            output=text,
            model_name=model_name,
            input_tokens=inp,
            output_tokens=out,
            cost_usd=cost,
            finish_reason=finish_reason,
            cached_input_tokens=cached,
            reasoning_tokens=reasoning,
            response_id=response_id,
            usage_reported=usage_reported,
        )

    def generate(self, system: str, user: str, schema: dict[str, Any]) -> LlmResult:
        if self.http is None:
            self.http = httpx.Client(base_url=self._base_url, timeout=self._timeout_seconds)
        response = self.http.post(
            "/responses",
            json=self._body(system, user, schema),
            headers=self._headers(),
        )
        response.raise_for_status()
        return self._parse(response.json())

    async def agenerate(
        self,
        system: str,
        user: str,
        schema: dict[str, Any],
        *,
        timeout_seconds: float | None = None,
        schema_name: str | None = None,
    ) -> LlmResult:
        if self.async_http is None:
            self.async_http = httpx.AsyncClient(
                base_url=self._base_url, timeout=self._timeout_seconds
            )
        kwargs: dict[str, Any] = {}
        if timeout_seconds is not None:
            kwargs["timeout"] = timeout_seconds
        response = await self.async_http.post(
            "/responses",
            json=self._body(system, user, schema, schema_name=schema_name),
            headers=self._headers(),
            **kwargs,
        )
        response.raise_for_status()
        return self._parse(response.json())

    async def aclose(self) -> None:
        if self.async_http is not None:
            await self.async_http.aclose()
            self.async_http = None
