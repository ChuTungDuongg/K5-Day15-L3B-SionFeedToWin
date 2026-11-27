import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.c1 import router as c1_router
from app.api.chat import get_core_client, get_gate
from app.api.chat import router as chat_router
from app.api.embedding import router as embedding_router
from app.api.health import router as health_router
from app.api.moderation import get_visobert_client
from app.api.moderation import router as moderation_router
from app.api.room_upgrades import (
    get_room_upgrade_core_client,
    get_room_upgrade_llm,
    get_room_upgrade_session_store,
)
from app.api.room_upgrades import router as room_upgrades_router
from app.clients.llm.openai import OpenAIResponsesClient
from app.services.usage_events import close_usage_redis


@asynccontextmanager
async def lifespan(_app: FastAPI):
    factory = _app.dependency_overrides.get(get_visobert_client, get_visobert_client)
    local = await asyncio.to_thread(factory)
    try:
        yield
    finally:
        # Chat pools are created on first use; close only what exists.
        if get_core_client.cache_info().currsize:
            await get_core_client().aclose()
        if get_gate.cache_info().currsize:
            await get_gate().aclose()
        if get_room_upgrade_core_client.cache_info().currsize:
            await get_room_upgrade_core_client().aclose()
        if get_room_upgrade_session_store.cache_info().currsize:
            await get_room_upgrade_session_store().aclose()
        if get_room_upgrade_llm.cache_info().currsize:
            client = get_room_upgrade_llm()
            inner = getattr(client, "inner", None)
            if isinstance(inner, OpenAIResponsesClient):
                await inner.aclose()
        await close_usage_redis()
        if local is not None:
            await asyncio.to_thread(local.close)
            get_visobert_client.cache_clear()


app = FastAPI(title="Vintrip AI Service", version="0.1.0", lifespan=lifespan)
# App mobile chạy bằng Expo web gọi /chat thẳng từ trình duyệt; app native không cần CORS.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS", "http://localhost:3100,http://localhost:8080,http://localhost:8081"
        ).split(",")
        if origin.strip()
    ],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["authorization", "content-type", "accept", "x-request-id", "idempotency-key"],
)
app.include_router(health_router)
app.include_router(c1_router)
app.include_router(chat_router)
app.include_router(room_upgrades_router)
app.include_router(moderation_router)
app.include_router(embedding_router)
