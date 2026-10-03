import time

from app.pacing import pace


def test_back_to_back_calls_are_at_least_1_1_seconds_apart():
    stamps = []
    for _ in range(2):
        pace()
        stamps.append(time.perf_counter())
    # The stamp is taken just after pace() returns, so allow 1 ms for that gap.
    assert stamps[1] - stamps[0] >= 1.1 - 0.001
