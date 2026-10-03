"""Spacing for Bedrock calls. The hackathon account allows about 1 call per second for the whole team."""

import threading
import time

MIN_GAP_SECONDS = 1.1

_lock = threading.Lock()
_last_call = float("-inf")


def pace() -> None:
    """Sleep so consecutive Bedrock calls (model or guardrail) from this process start at least 1.1 s apart."""
    global _last_call
    with _lock:
        while (wait := _last_call + MIN_GAP_SECONDS - time.perf_counter()) > 0:
            time.sleep(wait)
        _last_call = time.perf_counter()
