"""Year-by-year simulation. Kevin implements this in K1 (simulate) and K2 (compare)."""

from decimal import ROUND_HALF_UP, Decimal


def _round_money(x: float) -> int:
    """Round a float to a whole dollar, half up. Used only when building rows and the summary."""
    return int(Decimal(str(x)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _money_flag(x: float) -> str:
    """Minimal money formatter for the negative_cash flag message.

    K1-only placeholder. In K2 this is replaced by engine.labels.money, which both the
    engine and the frontend share. The flag text must match money()'s output once K2 lands.
    """
    if x < 0:
        return "-" + _money_flag(-x)
    n = _round_money(x)
    if n < 1000:
        return f"${n}"
    if n < 10000:
        text = f"{round(n / 1000, 1):.1f}".rstrip("0").rstrip(".")
        return f"${text}k"
    if n < 1000000:
        return f"${round(n / 1000)}k"
    if n < 10000000:
        text = f"{round(n / 1000000, 1):.1f}".rstrip("0").rstrip(".")
        return f"${text}M"
    return f"${round(n / 1000000)}M"


def _amortized_payment(balance: float, rate: float, years: int) -> float:
    """Level annual payment that retires `balance` over `years` at annual `rate`.

    Standard amortization: B * r / (1 - (1 + r)^-years). With r == 0 it is B / years.
    """
    if rate == 0:
        return balance / years
    return balance * rate / (1 - (1 + rate) ** (-years))


def simulate(profile: dict, events: list[dict]) -> dict:
    """Run the profile and events year by year and return a dict shaped like Result.

    See contracts/schema.md "Engine rules" and "Result".
    """
    assumptions = profile["assumptions"]
    investment_return = assumptions["investment_return"]
    inflation = assumptions["inflation"]
    cash_yield = assumptions["cash_yield"]
    tax_rate = assumptions["tax_rate"]
    home_cost_pct = assumptions["home_cost_pct"]

    start_age = profile["age"]
    retire_age = profile["retire_age"]
    income_base = profile["income"]
    salary_growth = profile["salary_growth"]
    employer_match_pct = profile["employer_match_pct"]
    monthly_expenses = profile["monthly_expenses"]
    monthly_rent = profile["monthly_rent"]

    # --- Mutable state carried across years (all floats internally) ---
    cash = float(profile["cash"])
    retirement = float(profile["retirement_balance"])
    retirement_pct = profile["retirement_pct"]

    # Profile debts: fixed annual payment of min_payment * 12.
    # new_debt debts: amortized over their own term. Both count toward the debt column.
    debts = [
        {
            "rate": d["rate"],
            "balance": float(d["balance"]),
            "annual_payment": d["min_payment"] * 12,
        }
        for d in profile["debts"]
    ]

    # The mortgage is tracked separately and is NOT part of the debt column.
    owns_home = False
    home_value = 0.0
    mortgage_balance = 0.0
    mortgage_rate = 0.0
    mortgage_payment = 0.0  # level annual payment, fixed at purchase

    children: list[dict] = []  # each: {"start_age", "annual_cost"}
    job_loss_months: dict[int, int] = {}  # age -> capped months

    # Pre-bucket events by the age they apply at; preserve list order within an age.
    events_by_age: dict[int, list[dict]] = {}
    for ev in events:
        events_by_age.setdefault(ev["age"], []).append(ev)

    years: list[dict] = []
    flags: list[dict] = []
    seen_flag_codes: set[str] = set()

    for a in range(start_age, retire_age + 1):
        n = a - start_age

        # --- Step 1: apply events at the start of age a, in list order ---
        for ev in events_by_age.get(a, []):
            etype = ev["type"]
            if etype == "buy_house":
                price = ev["price"]
                down_pct = ev["down_pct"]
                cash -= price * down_pct
                home_value = float(price)
                mortgage_balance = price * (1 - down_pct)
                mortgage_rate = ev["rate"]
                mortgage_payment = _amortized_payment(mortgage_balance, mortgage_rate, ev["years"])
                owns_home = True
            elif etype == "new_debt":
                balance = float(ev["balance"])
                debts.append(
                    {
                        "rate": ev["rate"],
                        "balance": balance,
                        "annual_payment": _amortized_payment(balance, ev["rate"], ev["years"]),
                    }
                )
            elif etype == "set_retirement_pct":
                retirement_pct = ev["pct"]
            elif etype == "have_child":
                children.append({"start_age": a, "annual_cost": ev["annual_cost"]})
            elif etype == "job_loss":
                job_loss_months[a] = min(job_loss_months.get(a, 0) + ev["months"], 12)

        # --- Step 2: compute this year's flows (balances are post-event) ---
        months_lost = job_loss_months.get(a, 0)
        income_a = income_base * (1 + salary_growth) ** n * (1 - months_lost / 12)
        employee_a = income_a * retirement_pct
        employer_a = income_a * min(retirement_pct, employer_match_pct)
        take_home_a = (income_a - employee_a) * (1 - tax_rate)

        living_a = monthly_expenses * 12 * (1 + inflation) ** n
        rent_a = monthly_rent * 12 * (1 + inflation) ** n if not owns_home else 0.0
        child_a = sum(
            c["annual_cost"] * (1 + inflation) ** (a - c["start_age"])
            for c in children
            if c["start_age"] <= a <= c["start_age"] + 17
        )
        home_cost_a = home_value * home_cost_pct if owns_home else 0.0
        expenses_a = living_a + rent_a + child_a + home_cost_a

        # Debts (profile debts + new_debt): interest, then capped payment so balance >= 0.
        # The payment is a flow (applied in step 4); the row records the pre-payment balance.
        debt_payments_a = 0.0
        for d in debts:
            interest = d["balance"] * d["rate"]
            payment = min(d["annual_payment"], d["balance"] + interest)
            d["next_balance"] = d["balance"] + interest - payment
            debt_payments_a += payment

        # Mortgage: same amortization, tracked separately from the debt column.
        # Its balance is also recorded pre-payment in the row's home_equity.
        mortgage_payment_a = 0.0
        mortgage_next_balance = mortgage_balance
        if mortgage_balance > 0:
            m_interest = mortgage_balance * mortgage_rate
            mortgage_payment_a = min(mortgage_payment, mortgage_balance + m_interest)
            mortgage_next_balance = mortgage_balance + m_interest - mortgage_payment_a

        # --- Step 3: record the row (balances after step 1, money rounded to whole dollars) ---
        home_equity = home_value - mortgage_balance
        debt_total = sum(d["balance"] for d in debts)
        net_worth = cash + retirement + home_equity - debt_total

        years.append(
            {
                "age": a,
                "income": _round_money(income_a),
                "expenses": _round_money(expenses_a),
                "cash": _round_money(cash),
                "retirement": _round_money(retirement),
                "home_equity": _round_money(home_equity),
                "debt": _round_money(debt_total),
                "net_worth": _round_money(net_worth),
            }
        )

        # --- Flags: evaluated on the recorded cash and this year's monthly outflow ---
        monthly_outflow_a = (expenses_a + debt_payments_a + mortgage_payment_a) / 12
        if cash < 0 and "negative_cash" not in seen_flag_codes:
            flags.append(
                {"age": a, "code": "negative_cash", "message": f"Cash falls to {_money_flag(cash)}"}
            )
            seen_flag_codes.add("negative_cash")
        elif 0 <= cash < 3 * monthly_outflow_a and "low_emergency_fund" not in seen_flag_codes:
            months = cash / monthly_outflow_a if monthly_outflow_a > 0 else 0.0
            flags.append(
                {
                    "age": a,
                    "code": "low_emergency_fund",
                    "message": f"Cash covers {months:.1f} months of expenses",
                }
            )
            seen_flag_codes.add("low_emergency_fund")

        # --- Step 4: apply flows to get balances for age a + 1 ---
        yield_a = cash * cash_yield if cash > 0 else 0.0
        cash = cash + yield_a + take_home_a - expenses_a - debt_payments_a - mortgage_payment_a
        retirement = retirement * (1 + investment_return) + employee_a + employer_a
        for d in debts:
            d["balance"] = d["next_balance"]
        mortgage_balance = mortgage_next_balance
        if owns_home:
            home_value = home_value * (1 + inflation)

    flags.sort(key=lambda f: f["age"])

    retire_row = years[-1]
    min_cash = years[0]["cash"]
    min_cash_age = years[0]["age"]
    for row in years:
        if row["cash"] < min_cash:
            min_cash = row["cash"]
            min_cash_age = row["age"]

    summary = {
        "net_worth_at_retire": retire_row["net_worth"],
        "retirement_at_retire": retire_row["retirement"],
        "min_cash": min_cash,
        "min_cash_age": min_cash_age,
    }

    return {"years": years, "flags": flags, "summary": summary}


def compare(profile: dict, events: list[dict]) -> dict:
    """Return {"baseline", "scenario", "diff"} shaped like Compare.

    See contracts/schema.md "Compare" and the Compare part of "Engine rules".
    """
    raise NotImplementedError("Kevin: see schema.md Compare")
