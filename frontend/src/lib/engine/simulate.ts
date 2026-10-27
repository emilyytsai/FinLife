// Year-by-year simulation, ported line for line from backend/engine/simulate.py (contracts/schema.md "Engine rules").

import { money } from "../format";
import type { Compare, Flag, FlagCode, LifeEvent, Profile, Result, Summary, YearRow } from "../types";

/** Every simulation runs to this age. retire_age is when work stops; the years after it still matter. */
export const PLAN_TO_AGE = 95;

/** Round to a whole dollar, half away from zero (Python's Decimal ROUND_HALF_UP). */
export function roundMoney(x: number): number {
  return Math.sign(x) * Math.floor(Math.abs(x) + 0.5) || 0;
}

/** Level annual payment that retires `balance` over `years` at annual `rate`. */
function amortizedPayment(balance: number, rate: number, years: number): number {
  if (rate === 0) return balance / years;
  return (balance * rate) / (1 - (1 + rate) ** -years);
}

export interface YearZeroFlows {
  income: number;
  employee: number;
  employer: number;
  take_home: number;
  expenses: number;
  debt_payments: number;
  mortgage_payment: number;
  monthly_outflow: number;
}

/** Flow values at profile.age for the no-event baseline. Shared with analyze(). */
export function yearZeroFlows(profile: Profile): YearZeroFlows {
  const { tax_rate } = profile.assumptions;
  const income = profile.income;
  const employee = income * profile.retirement_pct;
  const employer = income * Math.min(profile.retirement_pct, profile.employer_match_pct);
  const take_home = (income - employee) * (1 - tax_rate);
  const expenses = profile.monthly_expenses * 12 + profile.monthly_rent * 12;

  let debt_payments = 0;
  for (const d of profile.debts) {
    const interest = d.balance * d.rate;
    debt_payments += Math.min(d.min_payment * 12, d.balance + interest);
  }
  const mortgage_payment = 0;
  const monthly_outflow = (expenses + debt_payments + mortgage_payment) / 12;
  return { income, employee, employer, take_home, expenses, debt_payments, mortgage_payment, monthly_outflow };
}

interface DebtState {
  rate: number;
  balance: number;
  annual_payment: number;
  next_balance: number;
}

export function simulate(profile: Profile, events: LifeEvent[]): Result {
  const { investment_return, inflation, cash_yield, tax_rate, home_cost_pct } = profile.assumptions;
  const startAge = profile.age;
  const retireAge = profile.retire_age;

  let cash = profile.cash;
  let retirement = profile.retirement_balance;
  let retirementPct = profile.retirement_pct;

  const debts: DebtState[] = profile.debts.map((d) => ({
    rate: d.rate,
    balance: d.balance,
    annual_payment: d.min_payment * 12,
    next_balance: d.balance,
  }));

  let ownsHome = false;
  let homeValue = 0;
  let mortgageBalance = 0;
  let mortgageRate = 0;
  let mortgagePayment = 0;

  // A child born before profile.age is already costing money; only its remaining years fall inside the plan.
  const children = events
    .filter((ev) => ev.type === "have_child" && ev.age < startAge)
    .map((ev) => ({ start_age: ev.age, annual_cost: ev.type === "have_child" ? ev.annual_cost : 0 }));
  const jobLossMonths = new Map<number, number>();

  const eventsByAge = new Map<number, LifeEvent[]>();
  for (const ev of events) eventsByAge.set(ev.age, [...(eventsByAge.get(ev.age) ?? []), ev]);

  const years: YearRow[] = [];
  const flags: Flag[] = [];
  const seen = new Set<FlagCode>();

  for (let a = startAge; a <= Math.max(retireAge, PLAN_TO_AGE); a++) {
    const n = a - startAge;
    const retired = a >= retireAge;

    // Step 1: apply events at the start of age a, in list order.
    for (const ev of eventsByAge.get(a) ?? []) {
      if (ev.type === "buy_house") {
        cash -= ev.price * ev.down_pct;
        homeValue = ev.price;
        mortgageBalance = ev.price * (1 - ev.down_pct);
        mortgageRate = ev.rate;
        mortgagePayment = amortizedPayment(mortgageBalance, mortgageRate, ev.years);
        ownsHome = true;
      } else if (ev.type === "new_debt") {
        debts.push({
          rate: ev.rate,
          balance: ev.balance,
          annual_payment: amortizedPayment(ev.balance, ev.rate, ev.years),
          next_balance: ev.balance,
        });
      } else if (ev.type === "set_retirement_pct") {
        retirementPct = ev.pct;
      } else if (ev.type === "have_child") {
        children.push({ start_age: a, annual_cost: ev.annual_cost });
      } else if (ev.type === "job_loss") {
        jobLossMonths.set(a, Math.min((jobLossMonths.get(a) ?? 0) + ev.months, 12));
      }
    }

    // Step 2: this year's flows (balances are post-event). No salary from retire_age on.
    const monthsLost = jobLossMonths.get(a) ?? 0;
    const incomeA = retired ? 0 : profile.income * (1 + profile.salary_growth) ** n * (1 - monthsLost / 12);
    const employeeA = incomeA * retirementPct;
    const employerA = incomeA * Math.min(retirementPct, profile.employer_match_pct);
    const takeHomeA = (incomeA - employeeA) * (1 - tax_rate);

    const livingA = profile.monthly_expenses * 12 * (1 + inflation) ** n;
    const rentA = ownsHome ? 0 : profile.monthly_rent * 12 * (1 + inflation) ** n;
    let childA = 0;
    for (const c of children) {
      if (c.start_age <= a && a <= c.start_age + 17) childA += c.annual_cost * (1 + inflation) ** (a - c.start_age);
    }
    const homeCostA = ownsHome ? homeValue * home_cost_pct : 0;
    const expensesA = livingA + rentA + childA + homeCostA;

    let debtPaymentsA = 0;
    for (const d of debts) {
      const interest = d.balance * d.rate;
      const payment = Math.min(d.annual_payment, d.balance + interest);
      d.next_balance = d.balance + interest - payment;
      debtPaymentsA += payment;
    }

    let mortgagePaymentA = 0;
    let mortgageNextBalance = mortgageBalance;
    if (mortgageBalance > 0) {
      const interest = mortgageBalance * mortgageRate;
      mortgagePaymentA = Math.min(mortgagePayment, mortgageBalance + interest);
      mortgageNextBalance = mortgageBalance + interest - mortgagePaymentA;
    }

    // Step 3: record the row.
    const homeEquity = homeValue - mortgageBalance;
    const debtTotal = debts.reduce((sum, d) => sum + d.balance, 0);
    const netWorth = cash + retirement + homeEquity - debtTotal;
    years.push({
      age: a,
      income: roundMoney(incomeA),
      expenses: roundMoney(expensesA),
      cash: roundMoney(cash),
      retirement: roundMoney(retirement),
      home_equity: roundMoney(homeEquity),
      debt: roundMoney(debtTotal),
      net_worth: roundMoney(netWorth),
    });

    // Flags: cash flags through retire_age, savings_depleted after it.
    const rowCash = years[years.length - 1].cash;
    const monthlyOutflowA = (expensesA + debtPaymentsA + mortgagePaymentA) / 12;
    if (a > retireAge) {
      if (cash < 0 && !seen.has("savings_depleted")) {
        flags.push({ age: a, code: "savings_depleted", message: "Cash and 401(k) are used up" });
        seen.add("savings_depleted");
      }
    } else if (cash < 0 && !seen.has("negative_cash")) {
      flags.push({ age: a, code: "negative_cash", message: `Cash falls to ${money(rowCash)}` });
      seen.add("negative_cash");
    } else if (cash >= 0 && cash < 3 * monthlyOutflowA && !seen.has("low_emergency_fund")) {
      const months = monthlyOutflowA > 0 ? cash / monthlyOutflowA : 0;
      flags.push({ age: a, code: "low_emergency_fund", message: `Cash covers ${months.toFixed(1)} months of expenses` });
      seen.add("low_emergency_fund");
    }

    // Step 4: apply flows to get balances for age a + 1.
    const yieldA = cash > 0 ? cash * cash_yield : 0;
    if (retired) {
      // Spending comes from the 401(k), grossed up for tax, after this year's growth; the rest from cash.
      const spendingA = expensesA + debtPaymentsA + mortgagePaymentA;
      const grown = retirement * (1 + investment_return);
      const grossNeeded = tax_rate < 1 ? spendingA / (1 - tax_rate) : spendingA;
      const withdrawalA = Math.min(grossNeeded, Math.max(grown, 0));
      cash = cash + yieldA + withdrawalA * (1 - tax_rate) - spendingA;
      retirement = grown - withdrawalA;
    } else {
      cash = cash + yieldA + takeHomeA - expensesA - debtPaymentsA - mortgagePaymentA;
      retirement = retirement * (1 + investment_return) + employeeA + employerA;
    }
    for (const d of debts) d.balance = d.next_balance;
    mortgageBalance = mortgageNextBalance;
    if (ownsHome) homeValue *= 1 + inflation;
  }

  flags.sort((x, y) => x.age - y.age);

  // The summary describes the working years: the retire_age row, and the lowest cash up to it.
  const retireRow = years.find((row) => row.age === retireAge)!;
  let minCash = years[0].cash;
  let minCashAge = years[0].age;
  for (const row of years) {
    if (row.age > retireAge) break;
    if (row.cash < minCash) {
      minCash = row.cash;
      minCashAge = row.age;
    }
  }
  const summary: Summary = {
    net_worth_at_retire: retireRow.net_worth,
    retirement_at_retire: retireRow.retirement,
    min_cash: minCash,
    min_cash_age: minCashAge,
  };
  return { years, flags, summary };
}

export function compare(profile: Profile, events: LifeEvent[]): Compare {
  const baseline = simulate(profile, []);
  const scenario = simulate(profile, events);
  const b = baseline.summary;
  const s = scenario.summary;
  const diff: Summary = {
    net_worth_at_retire: s.net_worth_at_retire - b.net_worth_at_retire,
    retirement_at_retire: s.retirement_at_retire - b.retirement_at_retire,
    min_cash: s.min_cash - b.min_cash,
    min_cash_age: s.min_cash_age - b.min_cash_age,
  };
  return { baseline, scenario, diff };
}
