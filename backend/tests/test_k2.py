"""K2 tests: engine.money, engine.label, and compare(). Separate from test_engine.py.

Rules under test: contracts/schema.md "Money format", "Labels", and the Compare part of
"Engine rules". money() must produce the same strings as frontend/src/lib/format.ts.
"""

import copy
import json
from pathlib import Path

import pytest

from engine.labels import label, money
from engine.simulate import compare, simulate

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROFILES = json.loads((BACKEND_DIR / "fixtures" / "profiles.json").read_text(encoding="utf-8"))


@pytest.fixture
def maya():
    return copy.deepcopy(next(p["profile"] for p in PROFILES if p["id"] == "maya"))


# --- money -------------------------------------------------------------------------


def test_money_examples():
    """money across the tiers: whole dollars, thousands (1 and 0 decimals), millions."""
    assert money(0) == "$0"
    assert money(999) == "$999"
    assert money(1000) == "$1k"
    assert money(1250) == "$1.3k"  # 1250/100 + 0.5 -> 13 -> 1300 -> 1.3k
    assert money(9500) == "$9.5k"
    assert money(10000) == "$10k"
    assert money(349600) == "$350k"
    assert money(350000) == "$350k"
    assert money(1000000) == "$1M"
    assert money(2550000) == "$2.6M"  # half up to the nearest 100k
    assert money(2600000) == "$2.6M"
    assert money(12400000) == "$12M"


def test_money_matches_frontend_tier_edges():
    """Extra edges that exercise each tier boundary (cross-checked against format.ts)."""
    assert money(500) == "$500"
    assert money(4999) == "$5k"
    assert money(99500) == "$100k"
    assert money(1050000) == "$1.1M"


def test_money_negative_values():
    """money(-x) == '-' + money(x) for nonzero x; zero never gets a sign."""
    for x in (950, 1250, 350000, 2600000, 12400000):
        assert money(-x) == "-" + money(x)
    # Zero (and negative zero) formats as "$0" with no leading minus, like the frontend.
    assert money(0) == "$0"
    assert money(-0.0) == "$0"


def test_money_rounds_half_up_before_choosing_unit():
    """Round half up first, then pick the unit: 999.5 -> $1k, 9999 -> $10k, 999999 -> $1M."""
    assert money(999.5) == "$1k"
    assert money(9999) == "$10k"
    assert money(999999) == "$1M"


def test_money_drops_trailing_zero_decimal():
    """One-decimal tiers drop a trailing '.0': $1k not $1.0k, $2M not $2.0M."""
    assert money(1000) == "$1k"
    assert money(2000000) == "$2M"
    assert "." not in money(1000)
    assert "." not in money(2000000)


# --- label -------------------------------------------------------------------------


def test_label_schema_examples():
    """Every label example in schema.md matches exactly."""
    assert label({"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.10, "rate": 0.065, "years": 30}) == "Buy a $350k house at 28"
    assert label({"type": "have_child", "age": 30, "annual_cost": 15000}) == "Have a child at 30"
    assert label({"type": "job_loss", "age": 31, "months": 6}) == "Lose job for 6 months at 31"
    assert label({"type": "set_retirement_pct", "age": 25, "pct": 0.10}) == "Set 401(k) to 10% at 25"
    assert label({"type": "new_debt", "age": 26, "name": "car", "balance": 30000, "rate": 0.07, "years": 5}) == "Take on a $30k car loan at 26"


def test_label_job_loss_one_month():
    """job_loss with months 1 reads 'Lose job for 1 month at 31' (singular)."""
    assert label({"type": "job_loss", "age": 31, "months": 1}) == "Lose job for 1 month at 31"


def test_label_new_debt_name_ending_in_loan():
    """new_debt named 'student loan' does not say 'loan' twice."""
    out = label({"type": "new_debt", "age": 26, "name": "student loan", "balance": 25000, "rate": 0.055, "years": 10})
    assert out == "Take on a $25k student loan at 26"
    assert out.count("loan") == 1


def test_label_fractional_pct():
    """set_retirement_pct 0.075 reads 'Set 401(k) to 7.5% at 25'."""
    assert label({"type": "set_retirement_pct", "age": 25, "pct": 0.075}) == "Set 401(k) to 7.5% at 25"


def test_label_whole_pct_has_no_decimal():
    """A whole percent shows no decimal: 0.10 -> '10%', not '10.0%'."""
    assert label({"type": "set_retirement_pct", "age": 25, "pct": 0.10}) == "Set 401(k) to 10% at 25"


# --- compare -----------------------------------------------------------------------


def test_compare_baseline_is_the_no_event_run(maya):
    """compare: baseline equals simulate(profile, [])."""
    events = [{"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.10, "rate": 0.065, "years": 30}]
    result = compare(maya, events)
    assert result["baseline"] == simulate(copy.deepcopy(maya), [])


def test_compare_scenario_is_the_event_run(maya):
    """compare: scenario equals simulate(profile, events)."""
    events = [{"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.10, "rate": 0.065, "years": 30}]
    result = compare(maya, events)
    assert result["scenario"] == simulate(copy.deepcopy(maya), events)


def test_compare_diff_is_scenario_minus_baseline(maya):
    """compare: diff equals scenario minus baseline for every summary field."""
    events = [{"type": "set_retirement_pct", "age": 25, "pct": 0.10}]
    result = compare(maya, events)
    for key in ("net_worth_at_retire", "retirement_at_retire", "min_cash", "min_cash_age"):
        expected = result["scenario"]["summary"][key] - result["baseline"]["summary"][key]
        assert result["diff"][key] == expected


def test_compare_no_events_diff_is_all_zero(maya):
    """compare with no events: baseline == scenario, so every diff field is 0."""
    result = compare(maya, [])
    assert result["baseline"] == result["scenario"]
    assert result["diff"] == {
        "net_worth_at_retire": 0,
        "retirement_at_retire": 0,
        "min_cash": 0,
        "min_cash_age": 0,
    }


def test_compare_does_not_mutate_inputs(maya):
    """compare leaves the profile and events it was given unchanged."""
    events = [{"type": "have_child", "age": 30, "annual_cost": 15000}]
    profile_snapshot = copy.deepcopy(maya)
    events_snapshot = copy.deepcopy(events)
    compare(maya, events)
    assert maya == profile_snapshot
    assert events == events_snapshot


# --- flag/money reconciliation (K1 formatter replaced by labels.money) -------------


def test_negative_cash_flag_uses_money_format(maya):
    """The negative_cash flag message formats cash with engine.money."""
    maya["cash"] = 1000.0
    events = [{"type": "buy_house", "age": 23, "price": 400000, "down_pct": 0.20, "rate": 0.065, "years": 30}]
    res = simulate(maya, events)
    neg = next(f for f in res["flags"] if f["code"] == "negative_cash")
    # The row's whole-dollar cash, run through money(), must appear verbatim in the message.
    row_23 = next(r for r in res["years"] if r["age"] == neg["age"])
    assert neg["message"] == f"Cash falls to {money(row_23['cash'])}"
    assert neg["message"].startswith("Cash falls to -$")
