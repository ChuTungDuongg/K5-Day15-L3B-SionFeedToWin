"""POST /room-upgrades/chat (mounted behind Traefik as POST /ai/room-upgrades/chat).

Staff-only AI copilot for hotel room upgrades (C2-CP2):
- Mandatory user access token (no guest access, no privileged service account bypass).
- Verifies JWT signature/claims and active session via Core API /api/auth/me.
- Forwards user's Bearer token to Core API so server-side hotel scope is enforced on every call.
- Never logs Authorization headers or tokens.
"""

import asyncio
from functools import cache
from typing import Annotated
from uuid import uuid4

import httpx
import jwt
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from redis import asyncio as aioredis
from starlette.concurrency import run_in_threadpool

from app.api.chat import get_jwks
from app.clients.llm.guarded import GuardedLlmClient
from app.core.config import RoomUpgradeSettings, get_room_upgrade_settings
from app.services.room_upgrades.llm_runner import AsyncStructuredLlm, build_room_upgrade_llm
from app.services.room_upgrades.schemas import (
    RoomUpgradeChatRequest,
    RoomUpgradeChatResponse,
)
from app.services.room_upgrades.session import (
    RoomUpgradeSessionStore,
    SessionScopeMismatchError,
)
from app.services.room_upgrades.tools import CoreAuthError
from app.services.room_upgrades.workflow import RoomUpgradeWorkflow

router = APIRouter(tags=["room-upgrades"])
_bearer = HTTPBearer(auto_error=False)


@cache
def get_room_upgrade_core_client() -> httpx.AsyncClient:
    settings = get_room_upgrade_settings()
    return httpx.AsyncClient(
        base_url=settings.core_api_url,
        timeout=settings.room_upgrades_core_timeout_seconds,
        limits=httpx.Limits(max_connections=30, max_keepalive_connections=10),
    )


@cache
def get_room_upgrade_session_store() -> RoomUpgradeSessionStore:
    settings = get_room_upgrade_settings()
    try:
        redis_client = aioredis.Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=0.2,
            socket_timeout=0.2,
        )
    except ValueError:
        redis_client = None
    return RoomUpgradeSessionStore(
        redis_client,
        ttl_seconds=settings.room_upgrades_session_ttl_seconds,
    )


@cache
def get_room_upgrade_llm() -> GuardedLlmClient | None:
    return build_room_upgrade_llm(get_room_upgrade_settings())


def verify_staff_token(token: str, settings: RoomUpgradeSettings) -> str:
    """Verify user JWT using Core API JWKS; rejects service tokens and invalid claims."""
    claims = jwt.decode(
        token,
        get_jwks(settings.resolved_jwks_url).get_signing_key_from_jwt(token).key,
        algorithms=["ES256"],
        issuer=settings.auth_jwt_issuer,
        audience=settings.auth_jwt_audience,
        options={"require": ["sub", "sid", "role", "iat", "exp"]},
    )
    if (
        claims.get("typ") == "service"
        or claims["role"] not in {"member", "moderator", "superadmin"}
        or not isinstance(claims["sid"], str)
        or not claims["sid"]
        or not claims["sub"]
    ):
        raise jwt.InvalidTokenError("invalid user claims")
    return str(claims["sub"])


async def authenticate_staff_user(
    credentials: HTTPAuthorizationCredentials | None,
    *,
    settings: RoomUpgradeSettings,
    core: httpx.AsyncClient,
    deadline: float,
) -> tuple[str, str]:
    """Authenticate caller with mandatory Bearer JWT + Core /api/auth/me check."""
    if credentials is None or not credentials.credentials.strip():
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Cần access token hợp lệ để sử dụng trợ lý nâng hạng phòng.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    remaining = deadline - asyncio.get_running_loop().time()
    if remaining <= 0.2:
        raise HTTPException(status.HTTP_504_GATEWAY_TIMEOUT, "Quá thời hạn xác thực phiên.")
    try:
        user_id = await run_in_threadpool(verify_staff_token, token, settings)
        timeout = min(settings.room_upgrades_core_timeout_seconds, remaining - 0.1)
        async with asyncio.timeout(timeout):
            response = await core.get(
                "/api/auth/me",
                headers={"Authorization": f"Bearer {token}"},
                timeout=timeout,
            )
        if response.status_code in {401, 403}:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                "Phiên đăng nhập không còn hiệu lực.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        response.raise_for_status()
        return user_id, token
    except HTTPException:
        raise
    except jwt.PyJWKClientConnectionError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Chưa thể kết nối dịch vụ xác thực."
        ) from exc
    except jwt.PyJWTError as exc:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Token không hợp lệ hoặc đã hết hạn.",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise HTTPException(
            status.HTTP_504_GATEWAY_TIMEOUT, "Xác thực phiên quá thời gian cho phép."
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Chưa thể kiểm tra phiên đăng nhập."
        ) from exc


@router.post(
    "/room-upgrades/chat",
    response_model=RoomUpgradeChatResponse,
    responses={
        401: {"description": "Missing, invalid, or revoked Bearer access token"},
        403: {"description": "Caller lacks hotel staff assignment or session scope mismatch"},
        503: {"description": "Core API dependency unavailable"},
        504: {"description": "Workflow or upstream timeout"},
    },
)
async def room_upgrades_chat(
    body: RoomUpgradeChatRequest,
    http_request: Request,
    response: Response,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    settings: Annotated[RoomUpgradeSettings, Depends(get_room_upgrade_settings)],
    core: Annotated[httpx.AsyncClient, Depends(get_room_upgrade_core_client)],
    session_store: Annotated[RoomUpgradeSessionStore, Depends(get_room_upgrade_session_store)],
    llm_client: Annotated[AsyncStructuredLlm | None, Depends(get_room_upgrade_llm)],
) -> RoomUpgradeChatResponse | JSONResponse:
    started = asyncio.get_running_loop().time()
    deadline = started + settings.room_upgrades_llm_timeout_seconds
    request_id = uuid4()

    # Optional request ID propagation if caller supplied a valid UUID.
    incoming_rid = http_request.headers.get("x-request-id")
    if incoming_rid:
        try:
            from uuid import UUID

            request_id = UUID(incoming_rid)
        except ValueError:
            pass

    user_id, token = await authenticate_staff_user(
        credentials, settings=settings, core=core, deadline=deadline
    )

    workflow = RoomUpgradeWorkflow(
        settings=settings,
        core=core,
        llm_client=llm_client,
        session_store=session_store,
    )
    try:
        result = await workflow.execute(
            body,
            user_id=user_id,
            access_token=token,
            request_id=request_id,
            started_monotonic=started,
        )
    except CoreAuthError as exc:
        headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
        raise HTTPException(exc.status_code, exc.message, headers=headers) from exc
    except SessionScopeMismatchError as exc:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Phiên làm việc thuộc nhân viên hoặc khách sạn khác; không được phép truy cập chéo.",
        ) from exc

    response.headers["Cache-Control"] = "no-store"
    if result.workflow_status == "DEPENDENCY_ERROR":
        err_status = (
            status.HTTP_504_GATEWAY_TIMEOUT
            if result.trace.error_code in {"CORE_API_TIMEOUT", "DEADLINE_EXCEEDED"}
            else status.HTTP_503_SERVICE_UNAVAILABLE
        )
        return JSONResponse(
            status_code=err_status,
            content=result.model_dump(mode="json", by_alias=True),
            headers={"Cache-Control": "no-store"},
        )
    return result
