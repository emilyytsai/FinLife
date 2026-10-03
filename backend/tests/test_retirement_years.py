"""The years after retire_age: rows run to PLAN_TO_AGE, spending is drawn from the 401(k), then from cash."""

import copy

from engine.simulate import PLAN_TO_AGE, simulate


def row_at(result: dict, age: int) -> dict:
    return next(r for r in result["years"] if r["age"] == age)


def test_rows_run_to_plan_age_for_every_retire_age(maya):
    for retire_age in (40, 60, 75):
        profile = copy.deepcopy(maya)
        profile["retire_age"] = retire_age
        ages = [r["age"] for r in simulate(profile, [])["years"]]
        assert ages == list(range(profile["age"], PLAN_TO_AGE + 1))


def test_no_salary_from_retire_age_on(maya):
    res = simulate(maya, [])
    assert row_at(res, maya["retire_age"] - 1)["income"] > 0
    assert all(r["income"] == 0 for r in res["years"] if r["age"] >= maya["retire_age"])


def test_spending_comes_from_the_401k_while_it_lasts(maya):
    """With money in the 401(k), cash only earns its yield; the 401(k) grows less the spending (grossed up for tax)."""
    res = simulate(maya, [])
    retire = maya["retire_age"]
    before, after = row_at(res, retire), row_at(res, retire + 1)
    a = maya["assumptions"]
    assert after["cash"] == round(before["cash"] * (1 + a["cash_yield"]))
    expected = before["retirement"] * (1 + a["investment_return"]) - before["expenses"] / (1 - a["tax_rate"])
    # Rows are whole dollars while the engine keeps floats, so allow a couple of dollars of rounding.
    assert abs(after["retirement"] - expected) <= 2


def test_savings_depleted_flag_once_the_401k_and_cash_run_out(maya):
    """Little saved for retirement: the 401(k) empties, then cash goes negative and the flag marks that year."""
    profile = copy.deepcopy(maya)
    profile["retirement_pct"] = 0
    profile["employer_match_pct"] = 0
    res = simulate(profile, [])
    flag = next(f for f in res["flags"] if f["code"] == "savings_depleted")
    assert flag["age"] > profile["retire_age"]
    assert flag["message"] == "Cash and 401(k) are used up"
    assert row_at(res, flag["age"])["cash"] < 0
    assert row_at(res, flag["age"])["retirement"] == 0
    assert row_at(res, flag["age"] - 1)["cash"] >= 0


def test_summary_and_cash_flags_cover_only_the_working_years(maya):
    """The retirement drawdown doesn't move min_cash or the two cash flags, which describe the years up to retire_age."""
    profile = copy.deepcopy(maya)
    profile["retirement_pct"] = 0
    profile["employer_match_pct"] = 0
    res = simulate(profile, [])
    working = [r for r in res["years"] if r["age"] <= profile["retire_age"]]
    assert res["summary"]["min_cash"] == min(r["cash"] for r in working)
    assert res["summary"]["net_worth_at_retire"] == row_at(res, profile["retire_age"])["net_worth"]
    cash_flags = [f for f in res["flags"] if f["code"] in ("low_emergency_fund", "negative_cash")]
    assert all(f["age"] <= profile["retire_age"] for f in cash_flags)
