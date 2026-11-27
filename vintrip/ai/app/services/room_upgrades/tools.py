"""Backend CP1 tool wrappers for the Room Upgrades AI workflow (C2-CP2).

Exposes five explicit business tools over the read/quote CP1 Core API endpoints:
- get_booking_context
- find_available_rooms
- get_upgrade_policy
- calculate_upgrade_quote
- validate_upgrade_proposal

Security invariants:
- Forwards ONLY the authenticated staff member's Bearer token (never a privileged service token).
- Never logs Authorization headers or tokens.
- Exposes ZERO mutation tools (no room move, hold, booking edit, payment, or refund).
"""

import asyncio
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import quote as url_quote
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx
from pydantic import ValidationError

from app.services.room_upgrades.schemas import (
    BackendBookingContextResponse,
    BackendBookingListResponse,
    BackendPolicy,
    BackendQuoteResponse,
    PolicySourceOut,
    RequestType,
    ToolTraceOut,
)


class CoreAuthError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class CoreNotFoundError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class CoreDependencyError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class AvailableRoomsResult:
    candidate_ids: list[str]
    available_ids: list[str]
    unavailable_reasons: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class UpgradePolicyResult:
    policy: BackendPolicy | None
    sources: list[PolicySourceOut]
    conflict: bool = False


@dataclass(frozen=True)
class ProposalValidationResult:
    passed: bool
    snapshot_drift: bool
    issues: list[str]


def enumerate_local_nights(effective_at: str, check_out_at: str, timezone_name: str) -> list[str]:
    """Enumerate calendar nights in the hotel's timezone (mirrors CP1 FULL_LOCAL_NIGHT)."""
    try:
        tz = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as exc:
        raise ValueError(f"Unknown timezone: {timezone_name}") from exc
    start_dt = datetime.fromisoformat(effective_at.replace("Z", "+00:00")).astimezone(tz)
    end_dt = datetime.fromisoformat(check_out_at.replace("Z", "+00:00")).astimezone(tz)
    day = start_dt.date()
    end_day = end_dt.date()
    dates: list[str] = []
    while day < end_day:
        if len(dates) >= 366:
            raise ValueError("Stay exceeds supported range")
        dates.append(day.isoformat())
        day += timedelta(days=1)
    return dates


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


class RoomUpgradeToolset:
    """Scoped tool executor for one Room Upgrades workflow turn."""

    def __init__(
        self,
        *,
        core: httpx.AsyncClient,
        access_token: str,
        request_id: UUID,
        deadline: float,
        core_timeout_seconds: float,
    ) -> None:
        self._core = core
        self._access_token = access_token
        self._request_id = request_id
        self._deadline = deadline
        self._core_timeout = core_timeout_seconds
        self.traces: list[ToolTraceOut] = []

    def _headers(self) -> dict[str, str]:
        # Authorization header is created per call and never written to logs or traces.
        return {
            "Authorization": f"Bearer {self._access_token}",
            "X-Request-Id": str(self._request_id),
        }

    def _call_timeout(self) -> float:
        remaining = self._deadline - asyncio.get_running_loop().time()
        if remaining <= 0.1:
            raise CoreDependencyError("DEADLINE_EXCEEDED", "Quá thời hạn xử lý 30 giây.")
        return min(self._core_timeout, remaining - 0.05)

    async def _request(
        self,
        tool_name: str,
        method: str,
        path: str,
        *,
        params: dict[str, str] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        started = time.perf_counter()
        timeout = self._call_timeout()
        try:
            async with asyncio.timeout(timeout):
                response = await self._core.request(
                    method,
                    path,
                    params=params,
                    json=json_body,
                    headers=self._headers(),
                    timeout=timeout,
                )
        except (TimeoutError, httpx.TimeoutException) as exc:
            self._record(tool_name, "timeout", started, "Core API timeout")
            raise CoreDependencyError(
                "CORE_API_TIMEOUT", "Hệ thống Core API phản hồi quá chậm; chưa thể báo giá."
            ) from exc
        except httpx.HTTPError as exc:
            self._record(tool_name, "connection_error", started, type(exc).__name__)
            raise CoreDependencyError(
                "CORE_API_UNAVAILABLE", "Không thể kết nối Core API; chưa thể báo giá."
            ) from exc

        if response.status_code == 401:
            self._record(tool_name, "unauthorized", started, "HTTP 401")
            raise CoreAuthError(401, "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.")
        if response.status_code == 403:
            self._record(tool_name, "forbidden", started, "HTTP 403")
            raise CoreAuthError(403, "Bạn không có phân công nhân viên tại khách sạn này.")
        if response.status_code == 404:
            self._record(tool_name, "not_found", started, "HTTP 404")
            raise CoreNotFoundError("Không tìm thấy dữ liệu trong khách sạn được cấp quyền.")
        if response.status_code >= 500:
            self._record(tool_name, f"http_{response.status_code}", started, "Core API 5xx")
            raise CoreDependencyError(
                "CORE_API_ERROR", "Core API đang gặp lỗi dịch vụ; vui lòng thử lại sau."
            )
        if response.status_code >= 400:
            self._record(tool_name, f"http_{response.status_code}", started, "Core API 4xx")
            raise CoreDependencyError(
                f"CORE_API_HTTP_{response.status_code}",
                "Yêu cầu không hợp lệ theo hợp đồng Core API.",
            )

        try:
            data = response.json()
        except ValueError as exc:
            self._record(tool_name, "invalid_json", started, "Malformed JSON from Core API")
            raise CoreDependencyError(
                "CORE_API_INVALID_RESPONSE", "Core API trả về dữ liệu không hợp lệ."
            ) from exc
        if not isinstance(data, dict):
            self._record(tool_name, "invalid_payload", started, "Non-object JSON from Core API")
            raise CoreDependencyError(
                "CORE_API_INVALID_RESPONSE", "Core API trả về dữ liệu không hợp lệ."
            )
        return data

    def _record(
        self, tool_name: str, outcome: str, started: float, detail: str | None = None
    ) -> None:
        self.traces.append(
            ToolTraceOut(
                tool=tool_name,
                outcome=outcome,
                latency_ms=max(0, round((time.perf_counter() - started) * 1000)),
                detail=detail,
            )
        )

    async def authorize_and_list_bookings(
        self, hotel_id: str, *, room_number: str | None = None
    ) -> BackendBookingListResponse:
        """Verify hotel staff assignment on Core API and fetch current in-house bookings."""
        started = time.perf_counter()
        params = {"hotelId": hotel_id}
        if room_number:
            params["roomNumber"] = room_number
        data = await self._request(
            "authorize_hotel_scope",
            "GET",
            "/api/commerce/room-upgrades/bookings",
            params=params,
        )
        try:
            parsed = BackendBookingListResponse.model_validate(data)
        except ValidationError as exc:
            self._record("authorize_hotel_scope", "schema_error", started, "Invalid list schema")
            raise CoreDependencyError(
                "CORE_API_SCHEMA_ERROR", "Dữ liệu danh sách booking không khớp hợp đồng CP1."
            ) from exc
        self._record(
            "authorize_hotel_scope",
            "ok",
            started,
            f"role={parsed.staff_role} bookings={len(parsed.items)}",
        )
        return parsed

    async def get_booking_context(
        self, hotel_id: str, booking_code: str
    ) -> BackendBookingContextResponse:
        """Tool 1: Fetch verified booking, room catalog, inventory, rates, policies, benefits."""
        started = time.perf_counter()
        encoded_code = url_quote(booking_code, safe="")
        data = await self._request(
            "get_booking_context",
            "GET",
            f"/api/commerce/room-upgrades/bookings/{encoded_code}",
            params={"hotelId": hotel_id},
        )
        try:
            parsed = BackendBookingContextResponse.model_validate(data)
        except ValidationError as exc:
            self._record("get_booking_context", "schema_error", started, "Invalid context schema")
            raise CoreDependencyError(
                "CORE_API_SCHEMA_ERROR", "Dữ liệu booking context không khớp hợp đồng CP1."
            ) from exc
        self._record(
            "get_booking_context",
            "ok",
            started,
            (
                f"booking={parsed.booking.booking_code} "
                f"status={parsed.booking.status} roomTypes={len(parsed.room_types)}"
            ),
        )
        return parsed

    def find_available_rooms(
        self,
        context: BackendBookingContextResponse,
        *,
        effective_at: str,
        request_type: RequestType,
        required_features: list[str],
        policy: BackendPolicy | None,
        requested_target_id: str | None = None,
    ) -> AvailableRoomsResult:
        """Tool 2: Discover backend catalog candidate roomTypeIds and check nightly availability."""
        started = time.perf_counter()
        current = next(
            (r for r in context.room_types if r.id == context.booking.room_type_id), None
        )
        if current is None:
            self._record("find_available_rooms", "missing_current_room", started)
            return AvailableRoomsResult([], [], {})

        try:
            dates = enumerate_local_nights(
                effective_at, context.booking.check_out_at, context.hotel.timezone
            )
        except ValueError:
            dates = []

        allowed_transitions = (
            {(t.from_room, t.to_room) for t in policy.rules.allowed_transitions}
            if policy is not None
            else set()
        )
        inv_map = {(inv.room_type_id, inv.date): inv for inv in context.inventory}

        candidate_ids: list[str] = []
        available_ids: list[str] = []
        unavailable_reasons: dict[str, str] = {}

        # Restrict strictly to backend room_types catalog (no invented IDs, bounded set).
        ordered_rooms = sorted(context.room_types, key=lambda r: (r.rank, r.id))
        for room in ordered_rooms:
            if room.id == current.id:
                continue
            is_requested = requested_target_id == room.id
            transition_ok = not allowed_transitions or (current.id, room.id) in allowed_transitions
            rank_ok = request_type == "ROOM_CHANGE" or room.rank > current.rank
            capacity_ok = room.max_guests >= context.booking.guests
            features_ok = all(feat in room.features for feat in required_features)

            if not (transition_ok and rank_ok and capacity_ok and features_ok):
                if is_requested:
                    candidate_ids.append(room.id)
                    unavailable_reasons[room.id] = "ineligible_room_constraints"
                continue

            if not dates:
                candidate_ids.append(room.id)
                unavailable_reasons[room.id] = "invalid_night_range"
                continue

            missing_inv = False
            sold_out_date: str | None = None
            for day in dates:
                inv = inv_map.get((room.id, day))
                if inv is None:
                    missing_inv = True
                    break
                avail = inv.total - inv.held - inv.sold - inv.out_of_service
                if inv.stop_sell or avail < 1:
                    sold_out_date = day
                    break

            candidate_ids.append(room.id)
            if missing_inv:
                unavailable_reasons[room.id] = "missing_inventory"
            elif sold_out_date is not None:
                unavailable_reasons[room.id] = f"sold_out:{sold_out_date}"
            else:
                available_ids.append(room.id)

        self._record(
            "find_available_rooms",
            "ok",
            started,
            f"candidates={len(candidate_ids)} available={len(available_ids)}",
        )
        return AvailableRoomsResult(
            candidate_ids=candidate_ids,
            available_ids=available_ids,
            unavailable_reasons=unavailable_reasons,
        )

    def get_upgrade_policy(
        self,
        context: BackendBookingContextResponse,
        *,
        effective_at: str,
        now: datetime,
    ) -> UpgradePolicyResult:
        """Tool 3: Resolve active versioned upgrade policy and source clauses."""
        started = time.perf_counter()
        try:
            eff_dt = _parse_iso(effective_at)
        except ValueError:
            self._record("get_upgrade_policy", "invalid_effective_at", started)
            return UpgradePolicyResult(policy=None, sources=[])

        active = [
            p
            for p in context.policies
            if _parse_iso(p.valid_from) <= now and _parse_iso(p.valid_until) > eff_dt
        ]
        active.sort(key=lambda p: p.version, reverse=True)
        if not active:
            self._record("get_upgrade_policy", "missing", started, "No active policy")
            return UpgradePolicyResult(policy=None, sources=[])
        if len(active) > 1 and active[1].version == active[0].version:
            self._record(
                "get_upgrade_policy", "version_conflict", started, "Duplicate policy version"
            )
            return UpgradePolicyResult(policy=None, sources=[], conflict=True)

        chosen = active[0]
        sources = [
            PolicySourceOut(
                ref=f"{chosen.code}:v{chosen.version}:{src.code}",
                code=src.code,
                policy_code=chosen.code,
                policy_version=chosen.version,
                clause=src.clause,
            )
            for src in chosen.sources
        ]
        self._record(
            "get_upgrade_policy",
            "ok",
            started,
            f"policy={chosen.code}@v{chosen.version}",
        )
        return UpgradePolicyResult(policy=chosen, sources=sources)

    async def calculate_upgrade_quote(
        self,
        *,
        hotel_id: str,
        booking_code: str,
        target_room_type_id: str,
        effective_at: str,
        request_type: RequestType,
        required_features: list[str],
        benefit_id: str | None = None,
    ) -> BackendQuoteResponse:
        """Tool 4: Call CP1 deterministic pricing & independent validation endpoint."""
        started = time.perf_counter()
        payload: dict[str, Any] = {
            "hotelId": hotel_id,
            "bookingCode": booking_code,
            "targetRoomTypeId": target_room_type_id,
            "effectiveAt": effective_at,
            "requestType": request_type,
            "requiredFeatures": required_features,
        }
        if benefit_id is not None:
            payload["benefitId"] = benefit_id

        data = await self._request(
            "calculate_upgrade_quote",
            "POST",
            "/api/commerce/room-upgrades/quotes",
            json_body=payload,
        )
        try:
            quote = BackendQuoteResponse.model_validate(data)
        except ValidationError as exc:
            self._record("calculate_upgrade_quote", "schema_error", started, "Invalid quote schema")
            raise CoreDependencyError(
                "CORE_API_SCHEMA_ERROR", "Báo giá từ Core API không khớp hợp đồng CP1."
            ) from exc
        self._record(
            "calculate_upgrade_quote",
            quote.status,
            started,
            f"target={target_room_type_id} diff={quote.price_diff_vnd}",
        )
        return quote

    def validate_upgrade_proposal(
        self,
        quote: BackendQuoteResponse,
        context: BackendBookingContextResponse,
        *,
        expected_snapshot_id: str,
    ) -> ProposalValidationResult:
        """Tool 5: Independently verify quote integrity, snapshot consistency, and invariants."""
        started = time.perf_counter()
        issues: list[str] = []
        snapshot_drift = quote.snapshot_id != expected_snapshot_id
        if snapshot_drift:
            issues.append("SNAPSHOT_DRIFT")
        if quote.hotel_id != context.hotel.id:
            issues.append("HOTEL_SCOPE_MISMATCH")
        if quote.booking_code is not None and quote.booking_code != context.booking.booking_code:
            issues.append("BOOKING_MISMATCH")
        if quote.status in {"VALID", "REQUIRES_MANAGER"}:
            if not (quote.validation.checked and quote.validation.passed):
                issues.append("BACKEND_VALIDATION_NOT_PASSED")
            if quote.totals is None or quote.price_diff_vnd is None:
                issues.append("MISSING_VERIFIED_TOTALS")
            elif quote.totals.price_diff_vnd != quote.price_diff_vnd:
                issues.append("TOTALS_MISMATCH")
            if quote.status == "REQUIRES_MANAGER" and quote.approval_role != "MANAGER":
                issues.append("MANAGER_APPROVAL_REQUIRED")
            if quote.approval_role is None:
                issues.append("MISSING_APPROVAL_ROLE")
        else:
            if quote.totals is not None or quote.price_diff_vnd is not None:
                issues.append("NON_PRICED_STATUS_CARRIES_TOTALS")

        passed = not issues
        self._record(
            "validate_upgrade_proposal",
            "passed" if passed else "failed",
            started,
            f"target={quote.target_room_type_id} issues={','.join(issues) or 'none'}",
        )
        return ProposalValidationResult(passed=passed, snapshot_drift=snapshot_drift, issues=issues)
