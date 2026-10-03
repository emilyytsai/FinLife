"""Bedrock guardrail check that every reply passes through before it is returned."""

import logging
from functools import lru_cache

from botocore.config import Config

from app import pacing
from app.config import aws_session, get_settings

logger = logging.getLogger("finlife.guardrail")

# Fail fast: a slow or broken guardrail call ends in (text, "ERROR") instead of holding up the reply.
CLIENT_CONFIG = Config(connect_timeout=5, read_timeout=10, retries={"mode": "standard", "total_max_attempts": 2})


@lru_cache
def guardrail_client():
    return aws_session().client("bedrock-runtime", config=CLIENT_CONFIG)


def check_output(text: str) -> tuple[str, str]:
    """Return (text, action) after the finlife-advice guardrail checks a reply.

    GUARDRAIL_INTERVENED returns the guardrail's blocked message. With no GUARDRAIL_ID it returns
    (text, "NONE_LOCAL"), and a failed call is logged and returns (text, "ERROR") so the demo never breaks.
    """
    settings = get_settings()
    if not settings.guardrail_id:
        return text, "NONE_LOCAL"
    try:
        pacing.pace()
        response = guardrail_client().apply_guardrail(
            guardrailIdentifier=settings.guardrail_id,
            guardrailVersion=settings.guardrail_version,
            source="OUTPUT",
            content=[{"text": {"text": text}}],
        )
    except Exception:
        logger.exception("Guardrail check failed")
        return text, "ERROR"
    action = response["action"]
    if action == "GUARDRAIL_INTERVENED":
        return "".join(output["text"] for output in response["outputs"]), action
    return text, action
