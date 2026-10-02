"""Checklist for Kevin (K1, K2). Replace each skipped placeholder with a real test. Rules: contracts/schema.md."""

import pytest


# simulate: rows and identities (K1)


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_maya_no_events_has_one_row_per_age():
    """Maya with no events returns 39 rows, ages 22 to 60 inclusive."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_maya_age_22_row_matches_schema_example():
    """The age-22 row equals the schema's Result example exactly."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_maya_age_23_row_matches_hand_math():
    """The age-23 row matches values computed by hand (arithmetic in a comment), to the dollar."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_net_worth_identity_on_every_row():
    """net_worth == cash + retirement + home_equity - debt on every row, within $1."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_money_rounds_to_whole_dollars_only_in_rows_and_summary():
    """Floats are kept internally; row and summary money values are whole dollars."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_engine_ignores_event_ids():
    """An event's optional id does not change the result."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_simulate_does_not_mutate_inputs():
    """simulate leaves the profile and events it was given unchanged."""


# Events (K1)


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_events_apply_at_start_of_their_age_in_list_order():
    """Events at age a apply before that year's flows and row, in list order."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_buy_house_lowers_cash_by_down_payment():
    """buy_house at 28: row-28 cash is lower than the no-event run by exactly price x down_pct."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_buy_house_home_equity_equals_down_payment():
    """buy_house at 28: home_equity at 28 equals the down payment."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_buy_house_stops_rent():
    """buy_house at 28: rent is gone from expenses from 28 on."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_home_costs_and_value_grow_with_inflation():
    """home_cost = home_value x home_cost_pct, and home_value grows with inflation."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_mortgage_is_not_in_debt_column():
    """The mortgage reduces home_equity but is not counted in debt."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_five_year_mortgage_is_paid_off():
    """A 5-year mortgage balance reaches 0 after 5 years."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_have_child_cost_window():
    """have_child at 30: costs appear from 30 through 47 and stop at 48."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_child_cost_grows_from_child_start_age():
    """Child cost is annual_cost x (1 + inflation)^(a - child_start_age)."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_job_loss_halves_income_for_six_months():
    """job_loss 6 months at 31: income at 31 is half the no-event value; expenses unchanged."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_job_loss_months_add_and_cap_at_12():
    """Two job_loss events at one age add months, capped at 12."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_set_retirement_pct_changes_contributions():
    """set_retirement_pct 0.10 at 25: contributions change from 25 on; retirement at 60 beats baseline."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_employer_match_is_capped():
    """employer = income x min(retirement_pct, employer_match_pct)."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_new_debt_is_paid_off_after_its_years():
    """new_debt is paid to 0 after its years."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_zero_rate_new_debt():
    """A zero-rate new_debt pays B / years per year and reaches 0."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_every_event_type_works_at_profile_age():
    """Each of the five event types works with age == profile.age."""


# Debts and cash (K1)


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_debts_never_go_below_zero():
    """Payment is min(annual_payment, balance + interest), so balances never go negative."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_student_loan_finishes_and_payment_stops():
    """Maya's student loan reaches 0 and its payment stops after that."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_cash_yield_only_on_positive_cash():
    """cash_yield is earned only when cash > 0."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_cash_can_go_negative():
    """Cash may go negative; it is not floored at 0."""


# Flags and summary (K1)


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_low_emergency_fund_flag():
    """0 <= cash < 3 x monthly_outflow flags low_emergency_fund with 'Cash covers {months:.1f} months of expenses'."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_negative_cash_flag():
    """cash < 0 flags negative_cash with 'Cash falls to {money(cash)}'."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_flags_first_occurrence_only_sorted_by_age():
    """Each flag code appears once, at its first age, and flags are sorted by age."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_summary_comes_from_retire_row_and_min_cash():
    """net_worth/retirement_at_retire come from the retire_age row; min_cash_age is the earliest age of the minimum."""


# compare (K2)


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_compare_baseline_is_the_no_event_run():
    """compare: baseline equals simulate(profile, [])."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_compare_diff_is_scenario_minus_baseline():
    """compare: diff equals scenario minus baseline for every summary field."""


# money (K2)


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_money_examples():
    """money: 0, 999, 999.5, 1000, 1250, 9500, 9999, 10000, 349600, 999999, 1000000, 2550000, 12400000."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_money_negative_values():
    """money(-x) == '-' + money(x)."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_money_rounds_half_up_before_choosing_unit():
    """Round half up first, then pick the unit (999.5 -> $1k, 9999 -> $10k, 999999 -> $1M)."""


# label (K2)


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_label_schema_examples():
    """Every label example in schema.md matches exactly."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_label_job_loss_one_month():
    """job_loss with months 1 reads 'Lose job for 1 month at 31'."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_label_new_debt_name_ending_in_loan():
    """new_debt named 'student loan' does not say 'loan' twice."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_label_fractional_pct():
    """set_retirement_pct 0.075 reads 'Set 401(k) to 7.5% at 25'."""
