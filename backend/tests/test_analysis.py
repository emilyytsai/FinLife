"""Checklist for Kevin (K3). Replace each skipped placeholder with a real test. Rules: contracts/schema.md "Analysis rules"."""

import pytest


# Metrics


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_analysis_uses_the_no_event_baseline():
    """analyze(profile) is computed from simulate(profile, []) and year-0 flows."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_emergency_fund_months():
    """emergency_fund_months = cash / monthly_outflow_0, one decimal, capped at 99.9."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_savings_rate():
    """savings_rate = (employee + employer + take_home - expenses - debt_payments) / income, three decimals."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_debt_to_income():
    """debt_to_income = debt_payments_0 / income_0, three decimals."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_retirement_target_projected_and_ratio():
    """target = 25 x expenses on the retire_age row; projected = retirement there; ratio three decimals (1.0 if target is 0)."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_zero_income_and_zero_expenses_do_not_crash():
    """Zero income and zero expenses don't crash; income-based rates are 0."""


# Highlights


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_maya_has_four_highlights_in_order():
    """Maya gets exactly 4 highlights: emergency_fund, savings_rate, debt_to_income, retirement_pace."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_highlight_text_formats():
    """Texts match the schema templates: one-decimal months, whole-number percents."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_maya_highlight_tones():
    """Maya's tones follow the thresholds table."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_no_debt_payments_text():
    """With no debt payments the text is 'You have no debt payments.' and the tone is good."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_tone_boundaries_land_on_better_tone():
    """Exactly 6 months, 15%, 20%, 36%, 100%, and 60% land on the better tone."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_tones_use_the_rounded_value_shown():
    """Tones compare the rounded value shown in the text, not the raw value."""


# Suggested scenarios


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_exactly_three_suggestions_in_order():
    """suggested_scenarios has exactly 3: buy_house, job_loss, then set_retirement_pct or have_child."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_suggested_events_are_valid_for_the_profile():
    """Each suggested event validates against the profile (age range and field ranges)."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_suggested_prompts_match_schema_format():
    """Prompts match the schema format, using money() for the price and whole percents."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_suggested_house_price_rule():
    """price = max(50000, round(income x 6 / 10000) x 10000), at age + 6, 10% down, 6.5%, 30 years."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_suggested_retirement_pct_step():
    """Third suggestion raises retirement_pct by 0.05, capped at 0.15, at age + 3."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_high_retirement_pct_suggests_child():
    """A profile with retirement_pct 0.15 gets have_child at age + 8 as the third suggestion."""


@pytest.mark.skip(reason="Kevin: K1-K3")
def test_suggestion_ages_are_clipped():
    """Suggestion ages are clipped to retire_age - 1."""
