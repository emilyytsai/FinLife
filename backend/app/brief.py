"""The one-page advisor brief. Phase 0 uses flag-based risks and fixed questions; Brian adds model-written ones in B3."""

import secrets
import string
from datetime import datetime, timezone

from app.stubs import analyze_or_stub, compare_or_stub, label_or_stub

DISCLAIMER = "Client-entered data, not verified. For education only. Not financial advice."
FALLBACK_QUESTIONS = [
    "Which of these goals matters most to you in the next five years?",
    "How stable do you expect your income to be over the next few years?",
    "How would you handle a large unexpected expense today?",
]
GOAL_TYPES = {"buy_house", "have_child", "new_debt"}
TRIED_TYPES = {"job_loss", "set_retirement_pct"}
TTL_SECONDS = 30 * 24 * 60 * 60
ID_ALPHABET = string.ascii_lowercase + string.digits


def build_brief(profile: dict, events: list[dict], messages: list[dict]) -> dict:
    compare = compare_or_stub(profile, events)
    created = datetime.now(timezone.utc).replace(microsecond=0)
    return {
        "id": "".join(secrets.choice(ID_ALPHABET) for _ in range(8)),
        "created_at": created.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "profile": profile,
        "events": events,
        "compare": compare,
        "analysis": analyze_or_stub(profile),
        "goals": [label_or_stub(event) for event in events if event["type"] in GOAL_TYPES],
        "tried": [label_or_stub(event) for event in events if event["type"] in TRIED_TYPES],
        "risks": [{"age": flag["age"], "text": flag["message"]} for flag in compare["scenario"]["flags"]][:4],
        "questions": list(FALLBACK_QUESTIONS),
        "disclaimer": DISCLAIMER,
        "expires_at": int(created.timestamp()) + TTL_SECONDS,
    }
