"""Controller step of a chat turn: one LLM call that turns the message into JSON (TF31).

The LLM sees only the masked message and recent turns, never Core results. Each role has its
own adapter and breaker (Bảo, 2026-11-16: Controller on OpenAI, Responder on DeepSeek).
"""

import json
import logging
import re
from collections.abc import Callable
from datetime import date
from functools import cache
from pathlib import Path
from typing import Literal

from app.clients.llm.base import LlmResult
from app.clients.llm.deepseek import DeepSeekClient
from app.clients.llm.fake import FakeLlmClient
from app.clients.llm.guarded import GuardedLlmClient
from app.clients.llm.openai import OpenAILlmClient
from app.core.breaker import CircuitBreaker
from app.core.config import get_chat_settings
from app.services.assistant.controller import (
    ControllerOutput,
    apply_guards,
    off_topic_kind,
    to_understanding,
)
from app.services.assistant.planner import today_in_vietnam
from app.services.assistant.schemas import ChatRequest, Understanding
from app.services.assistant.skills.c3_engine import is_disruption, is_followup
from app.services.assistant.skills.cancel_policy import POLICY_CODE, parse_vnd
from app.services.assistant.turn import REEL_KINDS
from app.services.summary.injection import match_injection
from app.services.summary.pii import mask_pii
from app.services.summary.schemas import strict_json_schema
from app.services.summary.vi_text import normalize_text

logger = logging.getLogger(__name__)
Role = Literal["controller", "responder"]
OPENAI_CHAT_MODEL = "gpt-4o-mini"
OPENAI_CHAT_PRICES = {"input": 0.15, "cached_input": 0.075, "output": 0.60}
PROMPT = Path(__file__).parents[2] / "prompts" / "assistant-controller.v11.md"


class LlmNotConfiguredError(Exception):
    pass


WEEKDAYS_VI = ["thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy", "Chủ nhật"]


def build_understanding_input(
    request: ChatRequest, *, max_turns: int = 6, today: date | None = None
) -> str:
    today = today or today_in_vietnam()
    trip = request.trip
    return json.dumps(
        {
            "today": f"{today.isoformat()} ({WEEKDAYS_VI[today.weekday()]})",
            # Only whether a reel is in view: its id never reaches the LLM.
            "hasContextPost": request.context_post_id is not None,
            # What Tripi remembers, without ids or user-written titles (trusted fields only).
            "trip": None
            if trip is None
            else {
                "place": trip.place,
                "dateFrom": trip.date_from.isoformat() if trip.date_from else None,
                "dateTo": trip.date_to.isoformat() if trip.date_to else None,
                "adults": trip.adults,
                "priceMaxPerNight": trip.price_max_per_night,
                "hasReel": trip.reel_id is not None,
                "lastCards": [{"ref": c.ref, "kind": c.kind} for c in trip.last_cards],
                # Stage B plan: names from Core and OSM, never ids or user-written titles.
                "originCity": trip.origin_city,
                "stay": trip.stay.name if trip.stay else None,
                "planDays": len(trip.days),
                "planStops": [stop.name for day in trip.days for stop in day][:20],
                "interests": trip.interests,
                "mealsOnly": trip.meals_only,
                "pendingCount": len(trip.pending_flights or trip.pending),
                "hasChosenFlight": bool(trip.transport and trip.transport.flight_id),
                # What Tripi just asked for: a short reply ("Vũng tàu") finishes this request.
                "awaiting": trip.awaiting.model_dump(mode="json", by_alias=True)
                if trip.awaiting
                else None,
            },
            # Rules that caught injection in comments (TF44) tag the message; the Controller
            # still only names an intent, so the tag is a hint plus a log line, not a block.
            "suspectedInjection": bool(match_injection(request.message)),
            "history": [
                {"role": turn.role, "text": mask_pii(turn.text)}
                for turn in request.history[-max_turns:]
            ],
            # Latest last: with history after it, v5 answered the user's previous message
            # (chain vung-tau-0A2, 3/3 on 17/11; 2/2 right once moved here).
            "message": mask_pii(request.message),
        },
        ensure_ascii=False,
    )


@cache
def get_role_llm(role: Role) -> GuardedLlmClient:
    """One client per role per process, so connections and the breaker are shared."""
    settings = get_chat_settings()
    provider = getattr(settings, f"chat_{role}_provider")
    model = getattr(settings, f"chat_{role}_model")
    limits = {"timeout_seconds": settings.chat_llm_timeout_seconds, "max_attempts": 1}
    if provider == "fake":
        inner = FakeLlmClient()
    elif provider == "openai":
        prices = {
            "input": getattr(settings, f"chat_{role}_price_input"),
            "cached_input": getattr(settings, f"chat_{role}_price_cached_input"),
            "output": getattr(settings, f"chat_{role}_price_output"),
        }
        if not settings.openai_api_key.get_secret_value().strip():
            raise LlmNotConfiguredError(f"{role}: OPENAI_API_KEY is required")
        model = model or OPENAI_CHAT_MODEL
        inner = OpenAILlmClient(
            settings.openai_api_key,
            model=model,
            prices={
                name: OPENAI_CHAT_PRICES[name] if value is None else value
                for name, value in prices.items()
            },
            base_url=settings.openai_base_url,
            reasoning_effort=(
                settings.openai_reasoning_effort if not model.startswith("gpt-4") else ""
            ),
            max_output_tokens=settings.chat_max_output_tokens,
            **limits,
        )
    else:
        if not settings.deepseek_api_key.get_secret_value():
            raise LlmNotConfiguredError(f"{role}: DEEPSEEK_API_KEY is required")
        inner = DeepSeekClient(
            settings.deepseek_api_key,
            model=model,
            base_url=settings.deepseek_base_url,
            max_output_tokens=settings.chat_max_output_tokens,
            **limits,
        )
    return GuardedLlmClient(inner, CircuitBreaker(f"chat-{role}"))


COMMERCE_INTENTS = {"cancel_policy", "booking_draft", "verified_itinerary", "flight_disruption"}
DESTINATIONS = (
    "Ocean Park", "VinUni", "Mega Grand World", "Bát Tràng", "Đà Nẵng", "Hà Nội", "TP.HCM",
    "Đà Lạt", "Hội An", "Vũng Tàu", "Huế", "Nha Trang", "Phú Quốc", "Quy Nhơn", "Hạ Long",
    "Sa Pa", "Ninh Bình",
)


def deterministic_understanding(request: ChatRequest) -> Understanding | None:
    if request.action or request.search_mode == "reel":
        return None
    message = request.message
    folded = normalize_text(message)
    if is_disruption(message) or (
        request.trip and request.trip.pending_flight_disruption and is_followup(message)
    ):
        return Understanding(intent="flight_disruption")
    cancellation = re.search(
        r"\b(huy (?:dat )?(?:phong|booking|don)|hoan tien|(?:phi|chinh sach) huy|"
        r"(?:moc gio|han|cutoff) (?:huy|nhan phong)|cutoff)\b", folded,
    )
    if cancellation or POLICY_CODE.search(message):
        return Understanding(intent="cancel_policy")
    if re.search(
        r"\b(doi (?:sang |hang )?phong|nang hang(?: phong)?|soan(?: ban)? nhap|yeu cau ho tro|"
        r"(?:ho tro|lien he|nhan tin|gui).{0,24}khach san)\b", folded,
    ):
        return Understanding(intent="booking_draft")

    trip = request.trip
    plan = re.search(r"\b(lich trinh|lo trinh|ke hoach du lich|lap lich|xep lich)\b", folded)
    if plan:
        place = next(
            (city for city in DESTINATIONS if re.search(rf"\b{normalize_text(city)}\b", folded)),
            trip.place if trip else "",
        )
        duration = re.search(r"\b(\d{1,2})\s*(ngay|dem)\b", folded)
        days = (int(duration[1]) + (duration[2] == "dem")) if duration else 2
        if re.search(r"\b(ngan sach|kiem chung|xung dot|toi da|duoi)\b", folded):
            return Understanding(
                intent="verified_itinerary", place=place, nights=max(0, min(days - 1, 30)),
                budget_vnd=parse_vnd(message),
            )
        return Understanding(intent="plan_trip", place=place, nights=max(0, min(days - 1, 30)))
    if (
        trip and trip.pending_cancellation
        and re.search(r"\d|múi giờ", message, re.I)
        and off_topic_kind(message) is None
    ):
        return Understanding(intent="cancel_policy")
    if re.search(r"\b(ban la ai|ban ten gi|ten ban la gi|who are you)\b", folded):
        return Understanding(intent="identity")
    if re.match(r"^(xin chao|chao|hi|hello)\b", folded):
        return Understanding(intent="greeting")
    if off_topic_kind(message):
        return Understanding(intent="off_topic")
    return None


async def understand(
    request: ChatRequest, *, max_turns: int, on_usage: Callable[[LlmResult], None] | None = None
) -> tuple[Understanding, LlmResult]:
    """Raises on provider errors, cut output or invalid JSON: the caller falls back."""
    groups = match_injection(request.message)
    if groups:  # rule names only, never the message
        logger.warning("chat.injection.suspected", extra={"groups": groups})
    result = await get_role_llm("controller").agenerate(
        PROMPT.read_text(encoding="utf-8"),
        build_understanding_input(request, max_turns=max_turns),
        strict_json_schema(ControllerOutput),
    )
    if on_usage is not None:
        on_usage(result)
    # A cut JSON can still parse into something wrong; never trust it.
    if result.finish_reason == "length":
        raise ValueError("controller output was cut")
    out = ControllerOutput.model_validate_json(result.output)
    trip = request.trip
    has_reel = bool(
        request.context_post_id
        or (trip and (trip.reel_id or any(c.kind in REEL_KINDS for c in trip.last_cards)))
    )
    out = apply_guards(
        out,
        request.message,
        has_reel=has_reel,
        has_options=bool(trip and (trip.pending or trip.pending_flights)),
        in_plan=bool(trip and trip.days),
        has_booking=bool(
            trip
            and (
                (trip.stay and trip.stay.source == "vintrip")
                or (trip.transport and trip.transport.flight_id)
            )
        ),
        awaiting=trip.awaiting if trip else None,
    )
    return to_understanding(out, trip, today_in_vietnam(), message=request.message), result
