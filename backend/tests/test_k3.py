"""K3 tests: engine.analyze(). Separate from test_analysis.py (kept for the final product).

Rules under test: contracts/schema.md "Analysis rules". analyze(profile) uses the no-event
baseline and year-0 flows. money()/percent formatting come from K2.
"""

import copy
import json
from pathlib import Path

import pytest

from engine.analysis import analyze
from engine.simulate import _year_zero_flows, simulate

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROFILES = json.loads((BACKEND_DIR / "fixtures" / "profiles.json").read_text(encoding="utf-8"))


def _profile(pid: str) -> dict:
    return copy.deepcopy(next(p["profile"] for p in PROFILES if p["id"] == pid))


@pytest.fixture
def maya():
    return _profile("maya")


@pytest.fixture
def priya():
    return _profile("priya")  # retirement_pct 0.10, no debt


# --- Metrics -----------------------------------------------------------------------


def test_analysis_uses_the_no_event_baseline(maya):
    """analyze(profile) is computed from simulate(profile, []) and year-0 flows."""
    a = analyze(maya)
    baseline = simulate(copy.deepcopy(maya), [])
    retire_row = next(r for r in baseline["years"] if r["age"] == maya["retire_age"])
    assert a["retirement_projected"] == retire_row["retirement"]
    assert a["retirement_target"] == 25 * retire_row["expenses"]


def test_emergency_fund_months(maya):
    """emergency_fund_months = cash / monthly_outflow_0, one decimal, capped at 99.9."""
    flows = _year_zero_flows(maya)
    expected = round(maya["cash"] / flows["monthly_outflow"], 1)
    a = analyze(maya)
    assert a["emergency_fund_months"] == expected
    assert a["emergency_fund_months"] == 3.9  # matches the schema's illustrative Maya value


def test_emergency_fund_months_capped_at_99_9(maya):
    """A huge cash balance caps emergency_fund_months at 99.9."""
    maya["cash"] = 10_000_000
    a = analyze(maya)
    assert a["emergency_fund_months"] == 99.9


def test_savings_rate(maya):
    """savings_rate = (employee + employer + take_home - expenses - debt_payments) / income, 3 dp."""
    f = _year_zero_flows(maya)
    expected = round(
        (f["employee"] + f["employer"] + f["take_home"] - f["expenses"] - f["debt_payments"]) / f["income"],
        3,
    )
    assert analyze(maya)["savings_rate"] == expected
    assert analyze(maya)["savings_rate"] == 0.149  # schema illustrative value


def test_debt_to_income(maya):
    """debt_to_income = debt_payments_0 / income_0, three decimals."""
    f = _year_zero_flows(maya)
    assert analyze(maya)["debt_to_income"] == round(f["debt_payments"] / f["income"], 3)
    assert analyze(maya)["debt_to_income"] == 0.061  # schema illustrative value


def test_retirement_target_projected_and_ratio(maya):
    """target = 25 x expenses on the retire_age row; projected = retirement there; ratio 3 dp."""
    baseline = simulate(copy.deepcopy(maya), [])
    retire_row = next(r for r in baseline["years"] if r["age"] == maya["retire_age"])
    a = analyze(maya)
    assert a["retirement_target"] == 25 * retire_row["expenses"]
    assert a["retirement_projected"] == retire_row["retirement"]
    assert a["retirement_ratio"] == round(a["retirement_projected"] / a["retirement_target"], 3)


def test_zero_income_and_zero_expenses_do_not_crash(maya):
    """Zero income and zero expenses don't crash; income-based rates are 0."""
    maya["income"] = 0
    maya["monthly_expenses"] = 0
    maya["monthly_rent"] = 0
    maya["debts"] = []
    a = analyze(maya)
    assert a["savings_rate"] == 0.0
    assert a["debt_to_income"] == 0.0
    # No outflow -> emergency fund months is capped rather than dividing by zero.
    assert a["emergency_fund_months"] == 99.9
    # retirement_target is 25 * expenses; if that is 0, ratio defaults to 1.0.
    if a["retirement_target"] == 0:
        assert a["retirement_ratio"] == 1.0


def test_retirement_ratio_defaults_to_one_when_target_zero(maya):
    """retirement_ratio is 1.0 when the target is 0."""
    maya["monthly_expenses"] = 0
    maya["monthly_rent"] = 0
    a = analyze(maya)
    assert a["retirement_target"] == 0
    assert a["retirement_ratio"] == 1.0


# --- Highlights --------------------------------------------------------------------


def test_maya_has_four_highlights_in_order(maya):
    """Maya gets exactly 4 highlights: emergency_fund, savings_rate, debt_to_income, retirement_pace."""
    codes = [h["code"] for h in analyze(maya)["highlights"]]
    assert codes == ["emergency_fund", "savings_rate", "debt_to_income", "retirement_pace"]


def test_highlight_text_formats(maya):
    """Texts match the schema templates: one-decimal months, whole-number percents."""
    hl = {h["code"]: h for h in analyze(maya)["highlights"]}
    assert hl["emergency_fund"]["text"] == "Cash covers 3.9 months of expenses."
    assert hl["savings_rate"]["text"] == "You save 15% of your income, including your 401(k)."
    assert hl["debt_to_income"]["text"] == "Debt payments take 6% of your income."
    assert hl["retirement_pace"]["text"] == (
        "You're on pace for 34% of a common retirement benchmark (25x yearly expenses at 60)."
    )


def test_maya_highlight_tones(maya):
    """Maya's tones follow the thresholds table."""
    hl = {h["code"]: h["tone"] for h in analyze(maya)["highlights"]}
    assert hl["emergency_fund"] == "watch"   # 3.9 months, in [3, 6)
    assert hl["savings_rate"] == "good"       # 15% -> good boundary
    assert hl["debt_to_income"] == "good"     # 6% <= 20
    assert hl["retirement_pace"] == "alert"   # 34% < 60


def test_no_debt_payments_text(priya):
    """With no debt payments the text is 'You have no debt payments.' and the tone is good."""
    hl = {h["code"]: h for h in analyze(priya)["highlights"]}
    assert hl["debt_to_income"]["text"] == "You have no debt payments."
    assert hl["debt_to_income"]["tone"] == "good"


def test_tone_boundaries_land_on_better_tone(maya):
    """Exactly 6 months, 15%, 20%, 36%, 100%, 60% land on the better tone.

    Each case is engineered so the displayed value hits the boundary exactly, then the tone
    is asserted to be the better of the two adjacent tones.
    """
    # emergency_fund == 6.0 months -> good (cash = 6 * monthly_outflow_0).
    f = _year_zero_flows(maya)
    p = copy.deepcopy(maya)
    p["cash"] = round(6 * f["monthly_outflow"])
    ef = next(h for h in analyze(p)["highlights"] if h["code"] == "emergency_fund")
    assert ef["text"].startswith("Cash covers 6.0 ")
    assert ef["tone"] == "good"

    # debt_to_income displayed 20% -> good; displayed 36% -> watch. The debt needs a balance
    # large enough that the intended annual payment is not capped (payment = min(pmt, bal+int)).
    # 20% boundary: debt_payments / income rounds to 20.
    p20 = copy.deepcopy(maya)
    p20["income"] = 100000
    p20["debts"] = [{"name": "x", "balance": 500000, "rate": 0.0, "min_payment": 100000 * 0.20 / 12}]
    dti20 = next(h for h in analyze(p20)["highlights"] if h["code"] == "debt_to_income")
    assert dti20["text"] == "Debt payments take 20% of your income."
    assert dti20["tone"] == "good"

    p36 = copy.deepcopy(maya)
    p36["income"] = 100000
    p36["debts"] = [{"name": "x", "balance": 500000, "rate": 0.0, "min_payment": 100000 * 0.36 / 12}]
    dti36 = next(h for h in analyze(p36)["highlights"] if h["code"] == "debt_to_income")
    assert dti36["text"] == "Debt payments take 36% of your income."
    assert dti36["tone"] == "watch"

    # retirement_pace: the tone is scored on the displayed whole percent. Boundaries 100 and 60
    # belong to the better tone; just below each boundary drops to the worse tone.
    from engine.analysis import _retirement_pace_highlight

    assert _retirement_pace_highlight(1.00, 60)["tone"] == "good"    # 100% -> good
    assert _retirement_pace_highlight(0.99, 60)["tone"] == "watch"   # 99% -> watch
    assert _retirement_pace_highlight(0.60, 60)["tone"] == "watch"   # 60% -> watch (better tone)
    assert _retirement_pace_highlight(0.59, 60)["tone"] == "alert"   # 59% -> alert


def test_savings_rate_boundary_15_is_good(maya):
    """A displayed savings rate of exactly 15% lands on good."""
    hl = {h["code"]: h for h in analyze(maya)["highlights"]}
    # Maya's savings_rate rounds to 15% and must be good (the boundary belongs to the better tone).
    assert hl["savings_rate"]["text"] == "You save 15% of your income, including your 401(k)."
    assert hl["savings_rate"]["tone"] == "good"


def test_tones_use_the_rounded_value_shown(maya):
    """Tones compare the rounded value shown in the text, not the raw value.

    Maya's raw savings_rate is 0.149 (14.9%), which is below the 15% good threshold; but it is
    displayed as 15% and must therefore be scored as good, not watch.
    """
    a = analyze(maya)
    assert a["savings_rate"] == 0.149  # raw rounds to 0.149 -> displayed 15%
    hl = {h["code"]: h for h in a["highlights"]}
    assert hl["savings_rate"]["text"] == "You save 15% of your income, including your 401(k)."
    assert hl["savings_rate"]["tone"] == "good"  # scored on 15, not on 14.9


# --- Suggested scenarios -----------------------------------------------------------


def test_exactly_three_suggestions_in_order(maya):
    """suggested_scenarios has exactly 3: buy_house, job_loss, then set_retirement_pct or have_child."""
    sugg = analyze(maya)["suggested_scenarios"]
    assert len(sugg) == 3
    types = [s["event"]["type"] for s in sugg]
    assert types[0] == "buy_house"
    assert types[1] == "job_loss"
    assert types[2] in ("set_retirement_pct", "have_child")


def test_suggested_events_are_valid_for_the_profile():
    """Each suggested event validates against the profile (age range and field ranges).

    Checked for the demo personas, all with income < ~$833k so the uncomapped suggested price
    stays within buy_house's 10000..5000000 range.
    """
    for p in PROFILES:
        profile = p["profile"]
        first, last = profile["age"], profile["retire_age"] - 1
        for s in analyze(copy.deepcopy(profile))["suggested_scenarios"]:
            ev = s["event"]
            assert first <= ev["age"] <= last, (p["id"], ev)
            if ev["type"] == "buy_house":
                assert 10000 <= ev["price"] <= 5000000, (p["id"], ev["price"])
                assert 0 <= ev["down_pct"] <= 1
                assert 0 <= ev["rate"] <= 0.2
                assert 1 <= ev["years"] <= 40
            elif ev["type"] == "job_loss":
                assert 1 <= ev["months"] <= 12
            elif ev["type"] == "set_retirement_pct":
                assert 0 <= ev["pct"] <= 1
            elif ev["type"] == "have_child":
                assert 0 <= ev["annual_cost"] <= 100000


def test_suggested_prompts_match_schema_format(maya):
    """Prompts match the schema format, using money() for the price and whole percents."""
    sugg = analyze(maya)["suggested_scenarios"]
    assert sugg[0]["prompt"] == "What if I buy a $330k house at 28?"
    assert sugg[1]["prompt"] == "What if I lose my job for 6 months at 25?"
    assert sugg[2]["prompt"] == "What if I raise my 401(k) to 10% at 25?"


def test_suggested_house_price_rule(maya):
    """price = max(50000, round(income x 6 / 10000) x 10000), at age + 6, 10% down, 6.5%, 30 years."""
    ev = analyze(maya)["suggested_scenarios"][0]["event"]
    expected_price = max(50000, round(maya["income"] * 6 / 10000) * 10000)
    assert ev["price"] == expected_price == 330000
    assert ev["age"] == maya["age"] + 6 == 28
    assert ev["down_pct"] == 0.10
    assert ev["rate"] == 0.065
    assert ev["years"] == 30


def test_suggested_house_price_floor():
    """A very low income still yields the 50000 price floor."""
    low = _profile("maya")
    low["income"] = 1000  # 1000 * 6 = 6000 -> below the 50000 floor
    ev = analyze(low)["suggested_scenarios"][0]["event"]
    assert ev["price"] == 50000


def test_suggested_house_price_uncapped():
    """Per the (tentative) schema, the suggested price is NOT capped at buy_house's 5M max.

    A high income produces a price above 5,000,000. This is a known conflict with the API's
    BuyHouse validation (le=5000000) and is handed off to Brian; the engine itself is uncapped.
    """
    rich = _profile("maya")
    rich["income"] = 1_000_000  # 1,000,000 * 6 = 6,000,000
    ev = analyze(rich)["suggested_scenarios"][0]["event"]
    assert ev["price"] == 6_000_000
    assert ev["price"] > 5_000_000


def test_suggested_retirement_pct_step(maya):
    """Third suggestion raises retirement_pct by 0.05, capped at 0.15, at age + 3."""
    ev = analyze(maya)["suggested_scenarios"][2]["event"]
    assert ev["type"] == "set_retirement_pct"
    assert ev["age"] == maya["age"] + 3 == 25
    assert ev["pct"] == min(maya["retirement_pct"] + 0.05, 0.15) == 0.10


def test_suggested_retirement_pct_capped_at_15():
    """A profile at 0.12 steps to 0.15 (not 0.17), still under the 0.15 branch threshold."""
    p = _profile("maya")
    p["retirement_pct"] = 0.12
    ev = analyze(p)["suggested_scenarios"][2]["event"]
    assert ev["type"] == "set_retirement_pct"
    assert ev["pct"] == 0.15


def test_high_retirement_pct_suggests_child():
    """A profile with retirement_pct 0.15 gets have_child at age + 8 as the third suggestion."""
    p = _profile("maya")
    p["retirement_pct"] = 0.15
    ev = analyze(p)["suggested_scenarios"][2]["event"]
    assert ev["type"] == "have_child"
    assert ev["age"] == p["age"] + 8 == 30
    assert ev["annual_cost"] == 15000
    assert analyze(p)["suggested_scenarios"][2]["prompt"] == "What if I have a child at 30?"


def test_suggestion_ages_are_clipped():
    """Suggestion ages are clipped to retire_age - 1."""
    p = _profile("maya")
    p["age"] = 58
    p["retire_age"] = 60  # retire_age - 1 = 59, so age+6/age+3/age+8 all clip to 59
    for s in analyze(p)["suggested_scenarios"]:
        assert s["event"]["age"] == 59
