# FinLife Contracts

The single source of truth for shapes and engine rules. Backend Pydantic models and frontend TypeScript types mirror this file exactly. All money is nominal dollars. Rates and percentages are decimals (0.06 = 6%).

Numbers marked "illustrative" are placeholders. The engine's tested output is the real value. Never write tests against illustrative numbers.

## Profile

Maya, the default demo persona:

```json
{
  "age": 22,
  "retire_age": 60,
  "income": 55000,
  "salary_growth": 0.03,
  "cash": 12000,
  "monthly_expenses": 1500,
  "monthly_rent": 1300,
  "retirement_balance": 0,
  "retirement_pct": 0.05,
  "employer_match_pct": 0.03,
  "debts": [
    {"name": "student loan", "balance": 25000, "rate": 0.055, "min_payment": 280}
  ],
  "assumptions": {
    "investment_return": 0.06,
    "inflation": 0.03,
    "cash_yield": 0.02,
    "tax_rate": 0.22,
    "home_cost_pct": 0.015
  }
}
```

| Field | Meaning |
| --- | --- |
| age | Current age |
| retire_age | Age work stops (no salary or 401(k) contributions from this age on). The simulation continues to PLAN_TO_AGE |
| income | Gross annual salary today |
| salary_growth | Annual raise |
| cash | Checking plus savings today |
| monthly_expenses | Living costs per month, excluding rent and debt payments |
| monthly_rent | Rent per month; stops once a house is bought |
| retirement_balance | 401(k) balance today |
| retirement_pct | Employee 401(k) contribution, share of income |
| employer_match_pct | Employer matches contributions up to this share of income |
| debts[].min_payment | Payment per month |
| assumptions.investment_return | Annual return on retirement savings |
| assumptions.inflation | Annual growth of expenses, rent, child costs, and home value |
| assumptions.cash_yield | Annual yield on positive cash |
| assumptions.tax_rate | Flat tax on income after pre-tax 401(k) contributions |
| assumptions.home_cost_pct | Yearly property tax, insurance, and upkeep as a share of home value |

The profile has no name field. Display names exist only in demo fixtures.

### Profile validation
- 18 <= age < retire_age <= 75
- income, cash, monthly_expenses, monthly_rent, retirement_balance >= 0
- 0 <= retirement_pct <= 1; 0 <= employer_match_pct <= 1; 0 <= salary_growth <= 0.2
- 0 <= investment_return, inflation, cash_yield <= 0.2; 0 <= tax_rate <= 0.6; 0 <= home_cost_pct <= 0.05
- At most 5 debts. Each: name 1 to 40 characters, balance >= 0, 0 <= rate <= 0.4, min_payment >= 0

## Events

Exactly five types. Every event may carry an optional "id" string made by the frontend. The engine ignores it and the API preserves it.

```json
{"type": "buy_house", "age": 28, "price": 350000, "down_pct": 0.10, "rate": 0.065, "years": 30}
{"type": "have_child", "age": 30, "annual_cost": 15000}
{"type": "job_loss", "age": 31, "months": 6}
{"type": "set_retirement_pct", "age": 25, "pct": 0.10}
{"type": "new_debt", "age": 26, "name": "car", "balance": 30000, "rate": 0.07, "years": 5}
```

### Event validation (checked against the request's profile)
- profile.age <= age < profile.retire_age. have_child may also start up to 17 years earlier (profile.age - 17 <= age), for a child the user already has
- At most 10 events per request; at most one buy_house
- buy_house: price >= 10000; 0 <= down_pct <= 1; 0 <= rate <= 0.2; 1 <= years <= 40
- have_child: 0 <= annual_cost <= 100000
- job_loss: 1 <= months <= 12
- set_retirement_pct: 0 <= pct <= 1
- new_debt: name 1 to 40 characters; 0 < balance <= 1000000; 0 <= rate <= 0.4; 1 <= years <= 30

## Result

```json
{
  "years": [
    {"age": 22, "income": 55000, "expenses": 33600, "cash": 12000, "retirement": 0, "home_equity": 0, "debt": 25000, "net_worth": -13000}
  ],
  "flags": [
    {"age": 28, "code": "low_emergency_fund", "message": "Cash covers 2.1 months of expenses"}
  ],
  "summary": {"net_worth_at_retire": 980000, "retirement_at_retire": 890000, "min_cash": 3100, "min_cash_age": 28}
}
```

The age-22 row is exact for Maya. Flags and summary are illustrative.

- years: one row per age from profile.age to PLAN_TO_AGE (95) inclusive. Money values are whole dollars.
- flags: sorted by age. Codes: low_emergency_fund, negative_cash, savings_depleted.

## Compare

```json
{"baseline": "Result", "scenario": "Result", "diff": {"net_worth_at_retire": 0, "retirement_at_retire": 0, "min_cash": 0, "min_cash_age": 0}}
```

## Analysis (illustrative values)

```json
{
  "savings_rate": 0.149,
  "emergency_fund_months": 3.9,
  "debt_to_income": 0.061,
  "retirement_target": 2580000,
  "retirement_projected": 890000,
  "retirement_ratio": 0.345,
  "highlights": [
    {"code": "emergency_fund", "tone": "watch", "text": "Cash covers 3.9 months of expenses."},
    {"code": "savings_rate", "tone": "watch", "text": "You save 15% of your income, including your 401(k)."},
    {"code": "debt_to_income", "tone": "good", "text": "Debt payments take 6% of your income."},
    {"code": "retirement_pace", "tone": "alert", "text": "You're on pace for 34% of a common retirement benchmark (25x yearly expenses at 60)."}
  ],
  "suggested_scenarios": [
    {"prompt": "What if I buy a $330k house at 28?", "event": {"type": "buy_house", "age": 28, "price": 330000, "down_pct": 0.10, "rate": 0.065, "years": 30}},
    {"prompt": "What if I lose my job for 6 months at 25?", "event": {"type": "job_loss", "age": 25, "months": 6}},
    {"prompt": "What if I raise my 401(k) to 10% at 25?", "event": {"type": "set_retirement_pct", "age": 25, "pct": 0.10}}
  ]
}
```

## Demo profiles

```json
[{"id": "maya", "name": "Maya", "blurb": "22, marketing coordinator, renting, student loan", "profile": "Profile"}]
```

## Endpoints

| Method | Path | Body | Returns |
| --- | --- | --- | --- |
| GET | /health | none | {"ok": true, "stub_engine": bool, "stub_ai": bool} |
| GET | /profiles | none | [DemoProfile] |
| POST | /analyze | {profile} | {"analysis": Analysis, "baseline": Result} |
| POST | /simulate | {profile, events} | Result |
| POST | /compare | {profile, events} | Compare |
| POST | /chat | {session_id, profile, events, messages} | ChatResponse |
| POST | /share | {session_id, profile, events, messages} | {"brief_id": "k3f9x2ab", "url": "..."} |
| GET | /brief/{id} | none | Brief, or 404 |

Any response produced by a stub sets the header `X-FinLife-Stub: 1`.

### POST /chat
- messages: `[{"role": "user" | "assistant", "content": string}]`, oldest first, last one from the user. Only the 20 most recent are sent to the model.
- ChatResponse: `{"reply": string, "events": [Event], "compare": Compare, "suggestions": [string], "status": "ok" | "blocked" | "fallback" | "stub"}`
- events: the full list after this turn. Existing ids are preserved. New events have no id; the frontend assigns one.
- suggestions: up to 2 prompts from analyze(profile).suggested_scenarios whose event type is not already in events.
- status: ok = normal; blocked = the guardrail replaced the reply; fallback = the number check failed twice and a template reply was used; stub = the AI is not connected.

### POST /share
- url = FRONTEND_URL + "/brief/?id=" + brief_id

## Brief

```json
{
  "id": "k3f9x2ab",
  "created_at": "2026-10-03T14:05:00Z",
  "profile": {},
  "events": [],
  "compare": {"baseline": {}, "scenario": {}, "diff": {}},
  "analysis": {},
  "goals": ["Buy a $350k house at 28"],
  "tried": ["Lose job for 6 months at 31"],
  "risks": [{"age": 28, "text": "Cash covers 2.1 months of expenses"}],
  "questions": ["...", "...", "..."],
  "disclaimer": "Client-entered data, not verified. For education only. Not financial advice."
}
```

- id: 8 random lowercase letters and digits.
- goals: labels of buy_house, have_child, and new_debt events.
- tried: labels of job_loss and set_retirement_pct events.
- risks: at most 4, written by the model from flags and compare. Every number must appear in compare.
- questions: exactly 3, written by the model.
- Stored with expires_at (epoch seconds, 30 days after created_at) for DynamoDB TTL. expires_at is not returned by the API.

## Errors

- 422: `{"errors": [{"field": "profile.retire_age", "message": "Retirement age must be after current age"}]}`
- 404: `{"error": "Brief not found"}`
- 503: `{"error": "The coach is busy. Try again in a few seconds."}`
- 500: `{"error": "Something went wrong"}`

## Money format: engine.money(x)
Round half up. Decide the unit after rounding.
- Negative values: "-" + money(abs(x))
- Under $1,000: whole dollars, "$950"
- $1,000 to $9,999: one decimal in thousands, drop ".0": "$1k", "$9.5k"
- $10,000 to $999,999: whole thousands: "$350k"
- $1M to $9.99M: one decimal in millions, drop ".0": "$1M", "$2.6M"
- $10M and up: whole millions: "$12M"

The frontend's formatter must produce identical strings.

## Labels: engine.label(event)
- buy_house: "Buy a $350k house at 28"
- have_child: "Have a child at 30"
- job_loss: "Lose job for 6 months at 31" ("1 month" when months == 1)
- set_retirement_pct: "Set 401(k) to 10% at 25" (whole percent; one decimal if not whole)
- new_debt: "Take on a $30k car loan at 26" (if name already ends in "loan", do not add "loan" again)

## Engine rules

PLAN_TO_AGE = 95. Rows run from profile.age to PLAN_TO_AGE inclusive. Ages a >= retire_age are retired years. For each age a, in this order:
1. Apply events whose age == a, in list order.
2. Compute this year's flows.
3. Record the row: balances after step 1, plus this year's income and expenses.
4. Apply the flows to get the balances for age a + 1.

Events, applied at the start of age a:
- buy_house: cash -= price x down_pct. home_value = price. A mortgage of price x (1 - down_pct) starts. Rent stops from age a.
- new_debt: a debt with the given balance starts.
- set_retirement_pct: retirement_pct = pct from age a on.
- have_child: a child cost stream starts at age a and runs 18 years (ages a to a + 17). A have_child before profile.age is already active at profile.age: only its remaining years are simulated, and the starting balances are the profile's.
- job_loss: marks age a. Months from several job_loss events at one age add up, capped at 12.

Flows for age a, with n = a - profile.age:
- income_a = income x (1 + salary_growth)^n x (1 - job_loss_months_a / 12) while working; 0 in retired years (so employee_a, employer_a, and take_home_a are 0 too)
- employee_a = income_a x retirement_pct_a
- employer_a = income_a x min(retirement_pct_a, employer_match_pct)
- take_home_a = (income_a - employee_a) x (1 - tax_rate)
- living_a = monthly_expenses x 12 x (1 + inflation)^n
- rent_a = monthly_rent x 12 x (1 + inflation)^n while no house is owned, else 0
- child_a = sum over active children of annual_cost x (1 + inflation)^(a - child_start_age)
- home_cost_a = home_value_a x home_cost_pct (0 with no house)
- expenses_a = living_a + rent_a + child_a + home_cost_a
- Debts (profile debts, new_debt, and the mortgage), each: interest = balance x rate; payment = min(annual_payment, balance + interest); next balance = balance + interest - payment.
  - Profile debts: annual_payment = min_payment x 12.
  - new_debt and the mortgage: annual_payment = B x r / (1 - (1 + r)^-years), or B / years when r == 0. B is the starting balance, r the annual rate.
- debt_payments_a = payments on profile debts and new_debt. mortgage_payment_a = the mortgage payment.
- monthly_outflow_a = (expenses_a + debt_payments_a + mortgage_payment_a) / 12

Next balances:
- Working years:
  - cash = cash + (cash x cash_yield if cash > 0) + take_home_a - expenses_a - debt_payments_a - mortgage_payment_a. Cash may go negative.
  - retirement = retirement x (1 + investment_return) + employee_a + employer_a
- Retired years: spending is drawn from the 401(k) first, grossed up for tax, then from cash.
  - spending_a = expenses_a + debt_payments_a + mortgage_payment_a
  - grown_a = retirement x (1 + investment_return)
  - withdrawal_a = min(spending_a / (1 - tax_rate), grown_a), or spending_a when tax_rate is 1
  - cash = cash + (cash x cash_yield if cash > 0) + withdrawal_a x (1 - tax_rate) - spending_a. Cash may go negative.
  - retirement = grown_a - withdrawal_a
- home_value = home_value x (1 + inflation)

Row values:
- debt = sum of profile debts and new_debt balances. The mortgage is NOT in debt.
- home_equity = home_value - mortgage balance
- net_worth = cash + retirement + home_equity - debt
- Keep floats internally; round money to whole dollars only when building rows and the summary.

Flags (first age only for each code, sorted by age):
- low_emergency_fund: 0 <= cash < 3 x monthly_outflow_a. Message: "Cash covers {months:.1f} months of expenses".
- negative_cash: cash < 0. Message: "Cash falls to {money(cash)}".
- low_emergency_fund and negative_cash are checked on rows up to retire_age only.
- savings_depleted: a > retire_age and cash < 0 (the 401(k) is used up). Message: "Cash and 401(k) are used up".

Summary:
- net_worth_at_retire and retirement_at_retire come from the retire_age row.
- min_cash is the lowest cash across rows up to retire_age; min_cash_age is the earliest age it occurs.

Compare:
- baseline = simulate(profile, []); scenario = simulate(profile, events)
- diff = scenario.summary minus baseline.summary, field by field

## Analysis rules

analyze(profile) uses the baseline (no events). "Year 0" means the flows at profile.age.
- emergency_fund_months = cash / monthly_outflow_0, one decimal, capped at 99.9
- savings_rate = (employee_0 + employer_0 + take_home_0 - expenses_0 - debt_payments_0) / income_0, three decimals (0 if income is 0)
- debt_to_income = debt_payments_0 / income_0, three decimals (0 if income is 0)
- retirement_target = 25 x expenses on the retire_age row
- retirement_projected = retirement on the retire_age row
- retirement_ratio = projected / target, three decimals (1.0 if target is 0)

highlights: exactly 4, in this order. Tones compare the rounded value shown in the text.
| code | text | good | watch | alert |
| --- | --- | --- | --- | --- |
| emergency_fund | "Cash covers {m:.1f} months of expenses." | >= 6 | 3 to 6 | < 3 |
| savings_rate | "You save {p}% of your income, including your 401(k)." | >= 15 | 5 to 15 | < 5 |
| debt_to_income | "Debt payments take {p}% of your income." or "You have no debt payments." | <= 20 | 20 to 36 | > 36 |
| retirement_pace | "You're on pace for {p}% of a common retirement benchmark (25x yearly expenses at {retire_age})." | >= 100 | 60 to 100 | < 60 |
Percent values in text are whole numbers. Boundaries belong to the better tone.

suggested_scenarios: exactly 3, in this order. Ages are clipped to retire_age - 1.
1. buy_house at age + 6; price = max(50000, round(income x 6 / 10000) x 10000); down_pct 0.10, rate 0.065, years 30. Prompt: "What if I buy a {money(price)} house at {a}?"
2. job_loss at age + 3, months 6. Prompt: "What if I lose my job for 6 months at {a}?"
3. If retirement_pct < 0.15: set_retirement_pct at age + 3 with pct = min(retirement_pct + 0.05, 0.15). Prompt: "What if I raise my 401(k) to {p}% at {a}?" Otherwise: have_child at age + 8, annual_cost 15000. Prompt: "What if I have a child at {a}?"

## Audit record (finlife-audit)
`{"session_id", "ts" (ISO 8601 UTC with milliseconds), "request": {"profile", "events", "last_user_message"}, "tool_calls": [{"name", "input", "is_error"}], "reply", "status", "model_id", "guardrail_action", "number_check": "pass" | "retried" | "fallback" | "skipped", "latency_ms"}`
