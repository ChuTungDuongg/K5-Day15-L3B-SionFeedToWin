"""End-to-end integration test: FastAPI -> real NestJS Core API -> real PostgreSQL (CP1 fixture).

Runs automatically when Core API is reachable at CORE_API_E2E_URL (default http://localhost:3000)
and seeded with the C2-CP1 demo fixture (member@vintrip.local = RECEPTIONIST,
moderator@vintrip.local = unassigned). Uses a controlled LLM double so this test stays
deterministic and incurs zero external API cost; live GPT-6 Luna checks run via
scripts/smoke_room_upgrades.py --mode live.
"""

import os

import httpx
import pytest

from scripts.smoke_room_upgrades import run_smoke

CORE_URL = os.environ.get("CORE_API_E2E_URL", "http://localhost:3000")
SEED_PASSWORD = os.environ.get("SEED_PASSWORD", "vintrip-dev-123")


def _core_reachable() -> bool:
    try:
        res = httpx.get(f"{CORE_URL}/health", timeout=2.0)
        return res.status_code == 200
    except httpx.HTTPError:
        return False


@pytest.mark.skipif(not _core_reachable(), reason=f"Core API not reachable at {CORE_URL}")
def test_e2e_fastapi_to_nestjs_to_postgres_room_upgrades() -> None:
    report = run_smoke("e2e", CORE_URL, SEED_PASSWORD)
    by_case = {item["case"]: item for item in report["results"]}
    assert by_case["unassigned_staff_403"]["httpStatus"] == 403
    assert by_case["happy_path_600k"]["quoteStatus"] == "VALID"
    assert by_case["happy_path_600k"]["priceDiffVnd"] == 600_000
    assert by_case["happy_path_600k"]["remainingNights"] == 2
    assert by_case["happy_path_600k"]["operationalEffects"] == "NONE"
    assert by_case["followup_turn1_missing_time"]["workflowStatus"] == "NEEDS_INPUT"
    assert by_case["followup_turn2_provide_time"]["priceDiffVnd"] == 600_000
    assert by_case["complimentary_outside_policy"]["quoteStatus"] == "REQUIRES_MANAGER"
    assert by_case["complimentary_outside_policy"]["priceDiffVnd"] == 600_000
    assert by_case["prompt_injection"]["workflowStatus"] == "BLOCKED_INJECTION"
    assert by_case["prompt_injection"]["quoteStatus"] is None
