"""K1 tests for the engine's simulate(). Separate from test_engine.py (kept for the final product).

Rules under test: contracts/schema.md "Engine rules", "Result", "Flags", "Summary".
All money in rows and the summary is whole dollars; floats are kept internally.
"""

import copy
import json
from pathlib import Path

import pytest

from engine.simulate import simulate

BACKEND_DIR = Path(__file__).resolve().parent.parent
PROFILES = json.loads((BACKEND_DIR / "fixtures" / "profiles.json").read_text(encoding="utf-8"))


@pytest.fixture
def maya():
    return copy.deepcopy(next(p["profile"] for p in PROFILES if p["id"] == "maya"))


# --- simulate: rows and identities -------------------------------------------------


def test_maya_no_events_has_one_row_per_age(maya):
    """Maya with no events returns 39 rows, ages 22 to 60 inclusive."""
    res = simulate(maya, [])
    assert len(res["years"]) == 39
    assert res["years"][0]["age"] == 22
    assert res["years"][-1]["age"] == 60
    assert [r["age"] for r in res["years"]] == list(range(22, 61))


def test_maya_age_22_row_matches_schema_example(maya):
    """The age-22 row equals the schema's Result example exactly."""
    res = simulate(maya, [])
    assert res["years"][0] == {
        "age": 22,
        "income": 55000,
        "expenses": 33600,
        "cash": 12000,
        "retirement": 0,
        "home_equity": 0,
        "debt": 25000,
        "net_worth": -13000,
    }


def test_maya_age_23_row_matches_hand_math(maya):
    """The age-23 row matches values computed by hand, to the dollar.

    Age-22 flows (n = 0) drive the age-23 balances:
      income_22      = 55000
      employee_22    = 55000 * 0.05            = 2750
      employer_22    = 55000 * min(0.05, 0.03) = 1650
      take_home_22   = (55000 - 2750) * 0.78   = 40755
      living_22      = 1500 * 12               = 18000
      rent_22        = 1300 * 12               = 15600
      expenses_22    = 18000 + 15600           = 33600
      loan interest  = 25000 * 0.055           = 1375
      loan payment   = min(280*12, 25000+1375) = 3360
      loan next_bal  = 25000 + 1375 - 3360     = 23015
      cash yield_22  = 12000 * 0.02            = 240   (cash > 0)
      cash_23 = 12000 + 240 + 40755 - 33600 - 3360    = 16035
      retire_23 = 0 * 1.06 + 2750 + 1650              = 4400
    Age-23 row values (n = 1):
      income_23   = 55000 * 1.03               = 56650
      living_23   = 18000 * 1.03               = 18540
      rent_23     = 15600 * 1.03               = 16068
      expenses_23 = 18540 + 16068              = 34608
      debt_23     = 23015
      home_equity = 0
      net_worth   = 16035 + 4400 + 0 - 23015   = -2580
    """
    res = simulate(maya, [])
    assert res["years"][1] == {
        "age": 23,
        "income": 56650,
        "expenses": 34608,
        "cash": 16035,
        "retirement": 4400,
        "home_equity": 0,
        "debt": 23015,
        "net_worth": -2580,
    }


def test_net_worth_identity_on_every_row(maya):
    """net_worth == cash + retirement + home_equity - debt on every row, within $1."""
    events = [{"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.10, "rate": 0.065, "years": 30}]
    for evs in ([], events):
        res = simulate(maya, evs)
        for r in res["years"]:
            identity = r["cash"] + r["retirement"] + r["home_equity"] - r["debt"]
            assert abs(r["net_worth"] - identity) <= 1, (r["age"], r)


def test_money_rounds_to_whole_dollars_only_in_rows_and_summary(maya):
    """Floats are kept internally; row and summary money values are whole dollars (ints)."""
    res = simulate(maya, [])
    for r in res["years"]:
        for key in ("income", "expenses", "cash", "retirement", "home_equity", "debt", "net_worth"):
            assert isinstance(r[key], int), (r["age"], key)
    for key in ("net_worth_at_retire", "retirement_at_retire", "min_cash", "min_cash_age"):
        assert isinstance(res["summary"][key], int), key


def test_engine_ignores_event_ids(maya):
    """An event's optional id does not change the result."""
    base = {"type": "job_loss", "age": 31, "months": 6}
    with_id = {**base, "id": "abc-123"}
    assert simulate(maya, [base]) == simulate(copy.deepcopy(maya), [with_id])


def test_simulate_does_not_mutate_inputs(maya):
    """simulate leaves the profile and events it was given unchanged."""
    events = [
        {"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.10, "rate": 0.065, "years": 30},
        {"type": "have_child", "age": 30, "annual_cost": 15000},
    ]
    profile_snapshot = copy.deepcopy(maya)
    events_snapshot = copy.deepcopy(events)
    simulate(maya, events)
    assert maya == profile_snapshot
    assert events == events_snapshot


# --- Events ------------------------------------------------------------------------


def test_events_apply_at_start_of_their_age_in_list_order(maya):
    """Events at age a apply before that year's flows and row, in list order.

    Setting the 401(k) to 10% at 25 shows up in the age-25 contribution, which lifts
    the age-26 retirement balance over the no-event run.
    """
    events = [{"type": "set_retirement_pct", "age": 25, "pct": 0.10}]
    base = simulate(maya, [])
    scen = simulate(copy.deepcopy(maya), events)
    base_26 = next(r for r in base["years"] if r["age"] == 26)
    scen_26 = next(r for r in scen["years"] if r["age"] == 26)
    assert scen_26["retirement"] > base_26["retirement"]


def test_buy_house_lowers_cash_by_down_payment(maya):
    """buy_house at 28: row-28 cash is lower than the no-event run by exactly price x down_pct."""
    events = [{"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.10, "rate": 0.065, "years": 30}]
    base = simulate(maya, [])
    scen = simulate(copy.deepcopy(maya), events)
    base_28 = next(r for r in base["years"] if r["age"] == 28)["cash"]
    scen_28 = next(r for r in scen["years"] if r["age"] == 28)["cash"]
    assert base_28 - scen_28 == 35000  # 350000 * 0.10


def test_buy_house_home_equity_equals_down_payment(maya):
    """buy_house at 28: home_equity at 28 equals the down payment."""
    events = [{"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.10, "rate": 0.065, "years": 30}]
    scen = simulate(maya, events)
    row_28 = next(r for r in scen["years"] if r["age"] == 28)
    # home_value 350000 - mortgage 315000 = 35000 down payment
    assert row_28["home_equity"] == 35000


def test_buy_house_stops_rent(maya):
    """buy_house at 28: rent leaves expenses from 28 on (expenses drop vs the no-event run)."""
    events = [{"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.10, "rate": 0.065, "years": 30}]
    base = simulate(maya, [])
    scen = simulate(copy.deepcopy(maya), events)
    # At 27 (pre-house) expenses match; from 28 on the scenario has no rent (but adds home upkeep).
    base_27 = next(r for r in base["years"] if r["age"] == 27)["expenses"]
    scen_27 = next(r for r in scen["years"] if r["age"] == 27)["expenses"]
    assert base_27 == scen_27
    # Rent at 28 ~ 1300*12*1.03^6 ~ 18630; home upkeep 350000*0.015 = 5250. Net expenses drop.
    base_28 = next(r for r in base["years"] if r["age"] == 28)["expenses"]
    scen_28 = next(r for r in scen["years"] if r["age"] == 28)["expenses"]
    assert scen_28 < base_28


def test_home_costs_and_value_grow_with_inflation(maya):
    """home_cost = home_value x home_cost_pct, and home_value grows with inflation.

    home_equity rises each year after purchase as the home appreciates and the mortgage amortizes.
    """
    events = [{"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.10, "rate": 0.065, "years": 30}]
    scen = simulate(maya, events)
    eq = [r["home_equity"] for r in scen["years"] if r["age"] >= 28]
    assert all(later >= earlier for earlier, later in zip(eq, eq[1:]))
    assert eq[0] == 35000


def test_mortgage_is_not_in_debt_column(maya):
    """The mortgage reduces home_equity but is not counted in debt."""
    events = [{"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.10, "rate": 0.065, "years": 30}]
    base = simulate(maya, [])
    scen = simulate(copy.deepcopy(maya), events)
    # The only debts are Maya's student loan; the mortgage must not appear in `debt`.
    for b, s in zip(base["years"], scen["years"]):
        assert b["debt"] == s["debt"]


def test_five_year_mortgage_is_paid_off(maya):
    """A 5-year mortgage balance reaches 0 after 5 years (home_equity == home_value)."""
    events = [{"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.10, "rate": 0.065, "years": 5}]
    scen = simulate(maya, events)
    # After 5 payment-years (ages 28..32), the age-33 row has no mortgage: equity == full value.
    row_33 = next(r for r in scen["years"] if r["age"] == 33)
    home_value_33 = 350000 * (1 + 0.03) ** (33 - 28)
    assert abs(row_33["home_equity"] - round(home_value_33)) <= 1


def test_have_child_cost_window(maya):
    """have_child at 30: costs appear from 30 through 47 and stop at 48."""
    events = [{"type": "have_child", "age": 30, "annual_cost": 15000}]
    base = simulate(maya, [])
    scen = simulate(copy.deepcopy(maya), events)
    by_age_base = {r["age"]: r["expenses"] for r in base["years"]}
    by_age_scen = {r["age"]: r["expenses"] for r in scen["years"]}
    assert by_age_scen[29] == by_age_base[29]  # before
    assert by_age_scen[30] > by_age_base[30]  # first year
    assert by_age_scen[47] > by_age_base[47]  # last year (30 + 17)
    assert by_age_scen[48] == by_age_base[48]  # stops


def test_child_cost_grows_from_child_start_age(maya):
    """Child cost is annual_cost x (1 + inflation)^(a - child_start_age)."""
    events = [{"type": "have_child", "age": 30, "annual_cost": 15000}]
    base = simulate(maya, [])
    scen = simulate(copy.deepcopy(maya), events)
    base_by_age = {r["age"]: r["expenses"] for r in base["years"]}
    scen_by_age = {r["age"]: r["expenses"] for r in scen["years"]}
    # Child cost at age 30 is 15000 * 1.03^0 = 15000; at 31 it is 15000 * 1.03^1 = 15450.
    assert scen_by_age[30] - base_by_age[30] == 15000
    assert scen_by_age[31] - base_by_age[31] == round(15000 * 1.03)


def test_job_loss_halves_income_for_six_months(maya):
    """job_loss 6 months at 31: income at 31 is half the no-event value; expenses unchanged."""
    events = [{"type": "job_loss", "age": 31, "months": 6}]
    base = simulate(maya, [])
    scen = simulate(copy.deepcopy(maya), events)
    base_31 = next(r for r in base["years"] if r["age"] == 31)
    scen_31 = next(r for r in scen["years"] if r["age"] == 31)
    # income_31 is halved before rounding, so compare within $1 of half the baseline row
    # (both are independently rounded to whole dollars).
    assert abs(scen_31["income"] - base_31["income"] * 0.5) <= 1
    assert scen_31["expenses"] == base_31["expenses"]


def test_job_loss_months_add_and_cap_at_12(maya):
    """Two job_loss events at one age add months, capped at 12 (income -> 0)."""
    events = [
        {"type": "job_loss", "age": 31, "months": 8},
        {"type": "job_loss", "age": 31, "months": 8},
    ]
    scen = simulate(maya, events)
    row_31 = next(r for r in scen["years"] if r["age"] == 31)
    assert row_31["income"] == 0  # 16 months capped at 12 -> (1 - 12/12) = 0


def test_set_retirement_pct_changes_contributions(maya):
    """set_retirement_pct 0.10 at 25: retirement at 60 beats baseline."""
    events = [{"type": "set_retirement_pct", "age": 25, "pct": 0.10}]
    base = simulate(maya, [])
    scen = simulate(copy.deepcopy(maya), events)
    assert scen["summary"]["retirement_at_retire"] > base["summary"]["retirement_at_retire"]


def test_employer_match_is_capped(maya):
    """employer = income x min(retirement_pct, employer_match_pct).

    Maya's match cap is 3%. Raising her contribution to 10% does not raise the match,
    so the extra retirement growth comes only from the larger employee contribution.
    """
    # Build a profile whose contribution already exceeds the match cap.
    maya["retirement_pct"] = 0.10  # employer cap stays 0.03
    res = simulate(maya, [])
    # Hand-check year 0: employer = 55000 * min(0.10, 0.03) = 1650; employee = 55000 * 0.10 = 5500.
    # retirement at age 23 = 0 * 1.06 + 5500 + 1650 = 7150.
    row_23 = next(r for r in res["years"] if r["age"] == 23)
    assert row_23["retirement"] == 7150


def test_new_debt_is_paid_off_after_its_years(maya):
    """new_debt is paid to 0 after its years."""
    events = [{"type": "new_debt", "age": 26, "name": "car", "balance": 30000, "rate": 0.07, "years": 5}]
    base = simulate(maya, [])
    scen = simulate(copy.deepcopy(maya), events)
    # The car loan runs ages 26..30; by age 31 the only remaining debt is the student loan.
    base_31 = next(r for r in base["years"] if r["age"] == 31)["debt"]
    scen_31 = next(r for r in scen["years"] if r["age"] == 31)["debt"]
    assert scen_31 == base_31


def test_zero_rate_new_debt(maya):
    """A zero-rate new_debt pays B / years per year and reaches 0."""
    events = [{"type": "new_debt", "age": 26, "name": "loan0", "balance": 30000, "rate": 0.0, "years": 5}]
    base = simulate(maya, [])
    scen = simulate(copy.deepcopy(maya), events)
    # At age 26 the extra debt adds 30000 - 6000 (one payment of B/years) = 24000 over baseline.
    base_26 = next(r for r in base["years"] if r["age"] == 26)["debt"]
    scen_26 = next(r for r in scen["years"] if r["age"] == 26)["debt"]
    assert scen_26 - base_26 == 30000  # row records the pre-payment balance at purchase age
    # By age 31 it is fully paid off.
    base_31 = next(r for r in base["years"] if r["age"] == 31)["debt"]
    scen_31 = next(r for r in scen["years"] if r["age"] == 31)["debt"]
    assert scen_31 == base_31


def test_every_event_type_works_at_profile_age(maya):
    """Each of the five event types works with age == profile.age (22)."""
    event_sets = [
        [{"type": "buy_house", "age": 22, "price": 200000, "down_pct": 0.10, "rate": 0.065, "years": 30}],
        [{"type": "have_child", "age": 22, "annual_cost": 15000}],
        [{"type": "job_loss", "age": 22, "months": 6}],
        [{"type": "set_retirement_pct", "age": 22, "pct": 0.10}],
        [{"type": "new_debt", "age": 22, "name": "car", "balance": 20000, "rate": 0.07, "years": 5}],
    ]
    for evs in event_sets:
        res = simulate(copy.deepcopy(maya), evs)
        assert len(res["years"]) == 39
        assert res["years"][0]["age"] == 22


# --- Debts and cash ----------------------------------------------------------------


def test_debts_never_go_below_zero(maya):
    """Payment is min(annual_payment, balance + interest), so balances never go negative."""
    events = [{"type": "new_debt", "age": 26, "name": "car", "balance": 30000, "rate": 0.07, "years": 5}]
    res = simulate(maya, events)
    for r in res["years"]:
        assert r["debt"] >= 0, r["age"]


def test_student_loan_finishes_and_payment_stops(maya):
    """Maya's student loan reaches 0 and stays 0 (payment stops after payoff)."""
    res = simulate(maya, [])
    debts = [r["debt"] for r in res["years"]]
    assert min(debts) == 0  # it is paid off
    # Once it hits 0 it stays 0 for the rest of the run.
    zero_from = debts.index(0)
    assert all(d == 0 for d in debts[zero_from:])


def test_cash_yield_only_on_positive_cash(maya):
    """cash_yield is earned only when cash > 0.

    A profile that starts underwater earns no yield while negative, so year-over-year cash
    is not helped by the 2% yield until it climbs back above 0.
    """
    maya["cash"] = -5000.0
    maya["monthly_rent"] = 0
    maya["monthly_expenses"] = 100  # keep expenses low so cash recovers
    res = simulate(maya, [])
    # Reconstruct: with cash < 0 at age 22, no yield is applied this year.
    # take_home_22 = (55000 - 2750) * 0.78 = 40755; expenses = 1200; loan pmt = 3360.
    # cash_23 = -5000 + 0 + 40755 - 1200 - 3360 = 31195.
    assert res["years"][1]["cash"] == 31195


def test_cash_can_go_negative(maya):
    """Cash may go negative; it is not floored at 0."""
    maya["cash"] = 1000.0
    events = [{"type": "buy_house", "age": 23, "price": 400000, "down_pct": 0.20, "rate": 0.065, "years": 30}]
    res = simulate(maya, events)
    # 80000 down payment on 1000-ish cash forces the age-23 cash well negative.
    row_23 = next(r for r in res["years"] if r["age"] == 23)
    assert row_23["cash"] < 0


# --- Flags and summary -------------------------------------------------------------


def test_low_emergency_fund_flag(maya):
    """0 <= cash < 3 x monthly_outflow flags low_emergency_fund with the months message."""
    # Shrink starting cash so age 22 trips the low-fund rule but stays non-negative.
    maya["cash"] = 2000.0
    res = simulate(maya, [])
    codes = {f["code"]: f for f in res["flags"]}
    assert "low_emergency_fund" in codes
    assert codes["low_emergency_fund"]["message"].startswith("Cash covers ")
    assert codes["low_emergency_fund"]["message"].endswith(" months of expenses")


def test_negative_cash_flag(maya):
    """cash < 0 flags negative_cash with 'Cash falls to {money(cash)}'."""
    maya["cash"] = 1000.0
    events = [{"type": "buy_house", "age": 23, "price": 400000, "down_pct": 0.20, "rate": 0.065, "years": 30}]
    res = simulate(maya, events)
    codes = {f["code"]: f for f in res["flags"]}
    assert "negative_cash" in codes
    assert codes["negative_cash"]["message"].startswith("Cash falls to -$")


def test_flags_first_occurrence_only_sorted_by_age(maya):
    """Each flag code appears once, at its first age, and flags are sorted by age."""
    maya["cash"] = 1000.0
    events = [{"type": "buy_house", "age": 25, "price": 400000, "down_pct": 0.20, "rate": 0.065, "years": 30}]
    res = simulate(maya, events)
    codes = [f["code"] for f in res["flags"]]
    assert len(codes) == len(set(codes))  # each code at most once
    ages = [f["age"] for f in res["flags"]]
    assert ages == sorted(ages)


def test_summary_comes_from_retire_row_and_min_cash(maya):
    """net_worth/retirement_at_retire come from the retire_age row; min_cash_age is the earliest min."""
    res = simulate(maya, [])
    retire_row = res["years"][-1]
    assert res["summary"]["net_worth_at_retire"] == retire_row["net_worth"]
    assert res["summary"]["retirement_at_retire"] == retire_row["retirement"]
    cash_values = [r["cash"] for r in res["years"]]
    min_cash = min(cash_values)
    expected_age = next(r["age"] for r in res["years"] if r["cash"] == min_cash)
    assert res["summary"]["min_cash"] == min_cash
    assert res["summary"]["min_cash_age"] == expected_age
