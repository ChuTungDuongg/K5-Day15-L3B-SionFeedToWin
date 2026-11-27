"""Bounded LLM runner for Room Upgrades (OpenAI Responses API + GPT-6 Luna).

Enforces:
- Direct OpenAI Responses API only (gpt-6-luna, reasoning.effort=low, structured outputs).
- Never silently falls back to another provider or model.
- Hard caps: <= 5 model calls, <= 2 repairs, <= 30 s end-to-end deadline.
- Every provider response (including invalid output / repair calls) records usage and trace.
- Missing provider usage is recorded explicitly as usage_missing (never fabricated).
"""

import asyncio
import json
import time
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any, Protocol, TypeVar
from uuid import UUID

import httpx
from pydantic import BaseModel, ValidationError

from app.clients.llm.base import LlmResult
from app.clients.llm.guarded import GuardedLlmClient, LlmUnavailableError
from app.clients.llm.openai import OpenAIResponsesClient
from app.core.breaker import CircuitBreaker
from app.core.config import RoomUpgradeSettings
from app.services.room_upgrades.schemas import (
    ModelCallTraceOut,
    ModelOutcomeStatus,
    ModelStatusOut,
    UsageStatus,
)
from app.services.summary.schemas import strict_json_schema
from app.services.usage_events import RoomUpgradeStep, RoomUpgradeUsage, UsageEvent

T = TypeVar("T", bound=BaseModel)


class AsyncStructuredLlm(Protocol):
    model: str

    async def agenerate(self, system: str, user: str, schema: dict[str, Any]) -> LlmResult: ...


@dataclass(frozen=True)
class StructuredCallOutcome[TModel: BaseModel]:
    ok: bool
    data: TModel | None
    status: ModelOutcomeStatus
    error_code: str | None = None
    guardrail_codes: tuple[str, ...] = ()


def build_room_upgrade_llm(settings: RoomUpgradeSettings) -> GuardedLlmClient | None:
    """Create the OpenAI Responses API client for GPT-6 Luna, or None if not configured."""
    if not settings.room_upgrades_llm_enabled:
        return None
    if not settings.openai_api_key.get_secret_value().strip():
        return None
    inner = OpenAIResponsesClient(
        settings.openai_api_key,
        model=settings.room_upgrades_llm_model,
        prices=settings.resolved_prices,
        base_url=settings.openai_base_url,
        reasoning_effort=settings.room_upgrades_llm_reasoning_effort,
        timeout_seconds=settings.room_upgrades_llm_call_timeout_seconds,
        max_output_tokens=settings.room_upgrades_max_output_tokens,
    )
    return GuardedLlmClient(inner, CircuitBreaker("room-upgrades-openai"))


class RoomUpgradeLlmRunner:
    """Tracks model-call budget, repair budget, deadline, traces, and FinOps usage events."""

    def __init__(
        self,
        *,
        client: AsyncStructuredLlm | None,
        settings: RoomUpgradeSettings,
        deadline: float,
        request_id: UUID,
        session_id: UUID,
        user_id: UUID | None,
    ) -> None:
        self._client = client
        self._settings = settings
        self._deadline = deadline
        self._request_id = request_id
        self._session_id = session_id
        self._user_id = user_id

        self.call_count = 0
        self.repair_count = 0
        self.prompt_versions: list[str] = []
        self.model_calls: list[ModelCallTraceOut] = []
        self.usage_events: list[UsageEvent] = []
        self.guardrail_events: list[str] = []
        self.last_status: ModelOutcomeStatus = "not_called"
        self.actual_model: str | None = None

    async def call_structured(
        self,
        *,
        step: RoomUpgradeStep,
        repair_step: RoomUpgradeStep,
        prompt_version: str,
        system_prompt: str,
        user_payload: dict[str, Any],
        output_model: type[T],
        schema_name: str,
        validator: Callable[[T], tuple[list[str], str | None]] | None = None,
    ) -> StructuredCallOutcome[T]:
        if prompt_version not in self.prompt_versions:
            self.prompt_versions.append(prompt_version)

        if not self._settings.room_upgrades_llm_enabled:
            self.last_status = "disabled"
            return StructuredCallOutcome(False, None, "disabled", "LLM_DISABLED")
        if self._client is None:
            self.last_status = "not_configured"
            return StructuredCallOutcome(False, None, "not_configured", "OPENAI_API_KEY_MISSING")

        schema = strict_json_schema(output_model)
        current_payload: dict[str, Any] = user_payload
        current_step: RoomUpgradeStep = step
        last_error_code = "INVALID_MODEL_OUTPUT"
        last_status: ModelOutcomeStatus = "invalid_output"
        collected_guardrails: list[str] = []

        while True:
            if self.call_count >= self._settings.room_upgrades_llm_max_calls:
                self.last_status = "budget_exceeded"
                return StructuredCallOutcome(
                    False,
                    None,
                    "budget_exceeded",
                    "MAX_MODEL_CALLS_EXCEEDED",
                    tuple(collected_guardrails),
                )

            remaining = self._deadline - asyncio.get_running_loop().time()
            if remaining <= 0.25:
                self.last_status = "deadline_exceeded"
                return StructuredCallOutcome(
                    False,
                    None,
                    "deadline_exceeded",
                    "WORKFLOW_DEADLINE_EXCEEDED",
                    tuple(collected_guardrails),
                )

            per_call_timeout = min(
                self._settings.room_upgrades_llm_call_timeout_seconds,
                remaining - 0.1,
            )
            self.call_count += 1
            started = time.perf_counter()
            user_text = json.dumps(current_payload, ensure_ascii=False)

            try:
                async with asyncio.timeout(per_call_timeout):
                    result = await self._invoke_client(
                        system_prompt,
                        user_text,
                        schema,
                        timeout_seconds=per_call_timeout,
                        schema_name=schema_name,
                    )
            except (TimeoutError, httpx.TimeoutException):
                self._record_failed_call(current_step, "timeout", started, "MODEL_TIMEOUT")
                self.last_status = "timeout"
                return StructuredCallOutcome(
                    False, None, "timeout", "MODEL_TIMEOUT", tuple(collected_guardrails)
                )
            except LlmUnavailableError:
                self._record_failed_call(current_step, "breaker_open", started, "LLM_BREAKER_OPEN")
                self.last_status = "breaker_open"
                return StructuredCallOutcome(
                    False, None, "breaker_open", "LLM_BREAKER_OPEN", tuple(collected_guardrails)
                )
            except httpx.HTTPStatusError as exc:
                code = f"PROVIDER_HTTP_{exc.response.status_code}"
                self._record_failed_call(current_step, "provider_error", started, code)
                self.last_status = "provider_error"
                return StructuredCallOutcome(
                    False, None, "provider_error", code, tuple(collected_guardrails)
                )
            except (httpx.HTTPError, ValueError, RuntimeError):
                self._record_failed_call(current_step, "provider_error", started, "PROVIDER_ERROR")
                self.last_status = "provider_error"
                return StructuredCallOutcome(
                    False, None, "provider_error", "PROVIDER_ERROR", tuple(collected_guardrails)
                )

            latency_ms = (
                result.latency_ms
                if result.latency_ms is not None
                else max(0, round((time.perf_counter() - started) * 1000))
            )
            self.actual_model = result.model_name or self._settings.room_upgrades_llm_model
            self._record_usage_event(current_step, result, latency_ms)

            # Check truncated/refused output first.
            if result.finish_reason in {"length", "refusal"}:
                error_code = (
                    "MODEL_OUTPUT_TRUNCATED"
                    if result.finish_reason == "length"
                    else "MODEL_REFUSAL"
                )
                self._record_call_trace(
                    current_step, result, latency_ms, status="invalid_output", error_code=error_code
                )
                last_error_code = error_code
                last_status = "invalid_output"
                feedback = (
                    f"Previous response ended with finish_reason={result.finish_reason}. "
                    "Return concise complete JSON matching schema."
                )
            else:
                try:
                    parsed = output_model.model_validate_json(result.output)
                except ValidationError as exc:
                    self._record_call_trace(
                        current_step,
                        result,
                        latency_ms,
                        status="invalid_output",
                        error_code="SCHEMA_VALIDATION_FAILED",
                    )
                    last_error_code = "SCHEMA_VALIDATION_FAILED"
                    last_status = "invalid_output"
                    feedback = "Previous JSON failed schema validation: " + "; ".join(
                        f"{'.'.join(str(p) for p in err['loc'])}: {err['msg']}"
                        for err in exc.errors()[:4]
                    )
                else:
                    if validator is not None:
                        g_codes, g_feedback = validator(parsed)
                    else:
                        g_codes, g_feedback = [], None

                    if not g_codes:
                        self._record_call_trace(current_step, result, latency_ms, status="ok")
                        self.last_status = "ok"
                        return StructuredCallOutcome(
                            True, parsed, "ok", None, tuple(collected_guardrails)
                        )

                    for code in g_codes:
                        if code not in self.guardrail_events:
                            self.guardrail_events.append(code)
                        if code not in collected_guardrails:
                            collected_guardrails.append(code)
                    self._record_call_trace(
                        current_step,
                        result,
                        latency_ms,
                        status="guardrail_rejected",
                        error_code=g_codes[0],
                    )
                    last_error_code = g_codes[0]
                    last_status = "guardrail_rejected"
                    feedback = g_feedback or "Output violated domain guardrails."

            # Bounded repair loop: never exceed max_repairs or max_model_calls.
            if self.repair_count >= self._settings.room_upgrades_llm_max_repairs:
                self.last_status = last_status
                return StructuredCallOutcome(
                    False, None, last_status, last_error_code, tuple(collected_guardrails)
                )
            if self.call_count >= self._settings.room_upgrades_llm_max_calls:
                self.last_status = "budget_exceeded"
                return StructuredCallOutcome(
                    False,
                    None,
                    "budget_exceeded",
                    "MAX_MODEL_CALLS_EXCEEDED",
                    tuple(collected_guardrails),
                )

            self.repair_count += 1
            current_step = repair_step
            current_payload = {
                **user_payload,
                "repairInstruction": (
                    f"Attempt {self.repair_count} repair: {feedback} "
                    "Return ONLY one valid JSON object matching the schema and allowlists."
                ),
            }

    async def _invoke_client(
        self,
        system_prompt: str,
        user_text: str,
        schema: dict[str, Any],
        *,
        timeout_seconds: float,
        schema_name: str,
    ) -> LlmResult:
        assert self._client is not None
        inner = getattr(self._client, "inner", None)
        if isinstance(inner, OpenAIResponsesClient) and isinstance(self._client, GuardedLlmClient):
            if self._client.breaker.is_open():
                raise LlmUnavailableError(self._client.breaker.seconds_left())
            started = time.perf_counter()
            try:
                result = await inner.agenerate(
                    system_prompt,
                    user_text,
                    schema,
                    timeout_seconds=timeout_seconds,
                    schema_name=schema_name,
                )
            except asyncio.CancelledError:
                raise
            except Exception:
                self._client.breaker.record_failure()
                raise
            self._client.breaker.record_success()
            latency = max(0, round((time.perf_counter() - started) * 1000))
            return LlmResult(
                output=result.output,
                model_name=result.model_name,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                cost_usd=result.cost_usd,
                finish_reason=result.finish_reason,
                latency_ms=latency,
                cached_input_tokens=result.cached_input_tokens,
                reasoning_tokens=result.reasoning_tokens,
                response_id=result.response_id,
                usage_reported=result.usage_reported,
            )
        return await self._client.agenerate(system_prompt, user_text, schema)

    def _record_usage_event(
        self, step: RoomUpgradeStep, result: LlmResult, latency_ms: int
    ) -> None:
        model_name = result.model_name or self._settings.room_upgrades_llm_model
        if result.usage_reported:
            payload = RoomUpgradeUsage(
                model=model_name,
                step=step,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                cost_usd=result.cost_usd,
                estimated=True,
                conversation_id=self._session_id,
                turn_id=self._request_id,
                latency_ms=latency_ms,
            )
        else:
            payload = RoomUpgradeUsage(
                model=model_name,
                step="usage_missing",
                input_tokens=None,
                output_tokens=None,
                cost_usd=0.0,
                estimated=True,
                conversation_id=self._session_id,
                turn_id=self._request_id,
                latency_ms=latency_ms,
            )
        self.usage_events.append(UsageEvent(user_id=self._user_id, payload=payload))

    def _record_call_trace(
        self,
        step: str,
        result: LlmResult,
        latency_ms: int,
        *,
        status: str,
        error_code: str | None = None,
    ) -> None:
        usage_status: UsageStatus = "reported" if result.usage_reported else "usage_missing"
        self.model_calls.append(
            ModelCallTraceOut(
                step=step,
                provider=self._settings.room_upgrades_llm_provider,
                model=result.model_name or self._settings.room_upgrades_llm_model,
                response_id=result.response_id,
                status=status,
                latency_ms=latency_ms,
                usage_status=usage_status,
                input_tokens=result.input_tokens if result.usage_reported else None,
                cached_input_tokens=result.cached_input_tokens if result.usage_reported else None,
                output_tokens=result.output_tokens if result.usage_reported else None,
                reasoning_tokens=result.reasoning_tokens if result.usage_reported else None,
                cost_usd=result.cost_usd if result.usage_reported else None,
                finish_reason=result.finish_reason or None,
                error_code=error_code,
            )
        )

    def _record_failed_call(self, step: str, status: str, started: float, error_code: str) -> None:
        self.model_calls.append(
            ModelCallTraceOut(
                step=step,
                provider=self._settings.room_upgrades_llm_provider,
                model=self._settings.room_upgrades_llm_model,
                response_id=None,
                status=status,
                latency_ms=max(0, round((time.perf_counter() - started) * 1000)),
                usage_status="usage_missing",
                error_code=error_code,
            )
        )

    def build_model_status(
        self, *, status: ModelOutcomeStatus | None = None, degraded: bool = False
    ) -> ModelStatusOut:
        reported_calls = [c for c in self.model_calls if c.usage_status == "reported"]
        if not self.model_calls:
            usage_status: UsageStatus = "not_called"
            inp = cached = out = reasoning = None
            cost = None
        elif not reported_calls:
            usage_status = "usage_missing"
            inp = cached = out = reasoning = None
            cost = None
        else:
            usage_status = "reported" if len(reported_calls) == len(self.model_calls) else "partial"
            inp = sum(c.input_tokens or 0 for c in reported_calls)
            out = sum(c.output_tokens or 0 for c in reported_calls)
            cached_vals = [
                c.cached_input_tokens for c in reported_calls if c.cached_input_tokens is not None
            ]
            cached = sum(cached_vals) if cached_vals else None
            reasoning_vals = [
                c.reasoning_tokens for c in reported_calls if c.reasoning_tokens is not None
            ]
            reasoning = sum(reasoning_vals) if reasoning_vals else None
            cost = round(sum(c.cost_usd or 0.0 for c in reported_calls), 8)

        return ModelStatusOut(
            provider=self._settings.room_upgrades_llm_provider,
            api="responses",
            model=self.actual_model or self._settings.room_upgrades_llm_model,
            reasoning_effort=self._settings.room_upgrades_llm_reasoning_effort,
            prompt_versions=list(self.prompt_versions),
            status=status or self.last_status,
            degraded=degraded,
            call_count=self.call_count,
            repair_count=self.repair_count,
            usage_status=usage_status,
            input_tokens=inp,
            cached_input_tokens=cached,
            output_tokens=out,
            reasoning_tokens=reasoning,
            cost_usd=cost,
            response_ids=[c.response_id for c in self.model_calls if c.response_id],
            guardrail_events=list(self.guardrail_events),
        )
