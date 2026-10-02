"""Bedrock guardrail check that every reply passes through before it is returned."""


def check_output(text: str) -> tuple[str, str]:
    """Return (text, action). Phase 0 never calls Bedrock, so it always returns (text, "NONE_LOCAL").

    Brian implements apply_guardrail in B2: GUARDRAIL_INTERVENED returns the guardrail's text,
    an empty GUARDRAIL_ID returns (text, "NONE_LOCAL"), and a failed call returns (text, "ERROR").
    """
    return text, "NONE_LOCAL"
