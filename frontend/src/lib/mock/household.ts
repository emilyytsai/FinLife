import type { Compare, DemoProfile, Profile, Result, YearRow } from "../types";

// MOCK DATA FOR LOCAL UI TESTING ONLY. Opened with ?mock=household; never used in the demo.
// The engine has no spouse, owned home, or investment portfolio yet, so this file projects a household in the browser.
// That breaks the project's "all math lives in the engine" rule on purpose, for visual testing. The numbers are
// simplified and are not the engine's. Fictional people; no real names or data.

export interface Spouse {
  age: number;
  income: number;
  monthlyExpenses: number;
  retirementBalance: number;
}

export interface Condo {
  value: number;
  mortgageBalance: number;
  rate: number;
  yearsLeft: number;
  monthlyHoa: number;
}

export interface Portfolio {
  balance: number;
  monthlyContribution: number;
}

export interface Household {
  spouse: Spouse;
  condo: Condo;
  investments: Portfolio;
}

/** Extra numbers for one age that the schema's YearRow doesn't carry. */
export interface MockYear {
  investments: number;
  condoValue: number;
  mortgageBalance: number;
  spouseAge: number;
  spouseIncome: number;
  spouseExpenses: number;
}

export const MOCK_PROFILE: Profile = {
  age: 32,
  retire_age: 62,
  income: 200000,
  salary_growth: 0.03,
  cash: 45000,
  monthly_expenses: 6500,
  monthly_rent: 0, // they own the condo
  retirement_balance: 180000,
  retirement_pct: 0.1,
  employer_match_pct: 0.04,
  debts: [
    { name: "car", balance: 18000, rate: 0.059, min_payment: 450 },
    { name: "SUV", balance: 32000, rate: 0.064, min_payment: 620 },
  ],
  assumptions: { investment_return: 0.06, inflation: 0.03, cash_yield: 0.02, tax_rate: 0.24, home_cost_pct: 0.01 },
};

export const MOCK_HOUSEHOLD: Household = {
  spouse: { age: 34, income: 95000, monthlyExpenses: 2500, retirementBalance: 70000 },
  condo: { value: 520000, mortgageBalance: 380000, rate: 0.058, yearsLeft: 26, monthlyHoa: 450 },
  investments: { balance: 85000, monthlyContribution: 2500 },
};

export const MOCK_PERSONA: DemoProfile = {
  id: "maya-household",
  name: "Maya (mock household)",
  blurb: "32, married, owns a condo, two cars. Mock data for UI testing.",
  profile: MOCK_PROFILE,
};

const PLAN_TO_AGE = 95;

function payment(balance: number, rate: number, years: number): number {
  if (years <= 0 || balance <= 0) return 0;
  return rate === 0 ? balance / years : (balance * rate) / (1 - (1 + rate) ** -years);
}

/**
 * A simplified household projection, for UI testing only. Both partners earn and save into one 401(k) until her
 * retire_age (he retires at the same time); the condo appreciates with inflation while its mortgage amortizes;
 * the portfolio grows and takes monthly contributions. In retirement, spending comes from the portfolio, then the
 * 401(k), then cash.
 */
export function mockProject(
  profile: Profile,
  household: Household = MOCK_HOUSEHOLD,
): { compare: Compare; years: Record<number, MockYear> } {
  const { spouse, condo, investments } = household;
  const a = profile.assumptions;
  let cash = profile.cash;
  let retirement = profile.retirement_balance + spouse.retirementBalance;
  let portfolio = investments.balance;
  let condoValue = condo.value;
  let mortgage = condo.mortgageBalance;
  const mortgagePayment = payment(condo.mortgageBalance, condo.rate, condo.yearsLeft);
  const debts = profile.debts.map((d) => ({ balance: d.balance, rate: d.rate, annual: d.min_payment * 12 }));

  const rows: YearRow[] = [];
  const extras: Record<number, MockYear> = {};
  for (let age = profile.age; age <= PLAN_TO_AGE; age++) {
    const n = age - profile.age;
    const working = age < profile.retire_age;
    const growth = (1 + profile.salary_growth) ** n;
    const inflation = (1 + a.inflation) ** n;
    const herIncome = working ? profile.income * growth : 0;
    const hisIncome = working ? spouse.income * growth : 0;
    const contributions = working ? (herIncome + hisIncome) * profile.retirement_pct : 0;
    const match = working ? (herIncome + hisIncome) * Math.min(profile.retirement_pct, profile.employer_match_pct) : 0;
    const takeHome = (herIncome + hisIncome - contributions) * (1 - a.tax_rate);
    const hisExpenses = spouse.monthlyExpenses * 12 * inflation;
    const living =
      profile.monthly_expenses * 12 * inflation + hisExpenses + condo.monthlyHoa * 12 * inflation + condoValue * a.home_cost_pct;

    let debtPayments = 0;
    for (const d of debts) {
      const pay = Math.min(d.annual, d.balance * (1 + d.rate));
      d.balance = Math.max(0, d.balance * (1 + d.rate) - pay);
      debtPayments += pay;
    }
    const mortgagePaid = mortgage > 0 ? Math.min(mortgagePayment, mortgage * (1 + condo.rate)) : 0;

    const debtTotal = debts.reduce((sum, d) => sum + d.balance, 0);
    const equity = condoValue - mortgage;
    rows.push({
      age,
      income: Math.round(herIncome + hisIncome),
      expenses: Math.round(living),
      cash: Math.round(cash),
      retirement: Math.round(retirement),
      home_equity: Math.round(equity),
      debt: Math.round(debtTotal),
      net_worth: Math.round(cash + retirement + equity + portfolio - debtTotal),
    });
    extras[age] = {
      investments: Math.round(portfolio),
      condoValue: Math.round(condoValue),
      mortgageBalance: Math.round(mortgage),
      spouseAge: spouse.age + n,
      spouseIncome: Math.round(hisIncome),
      spouseExpenses: Math.round(hisExpenses),
    };

    // Next year's balances.
    const spending = living + debtPayments + mortgagePaid;
    const contribution = working ? investments.monthlyContribution * 12 : 0;
    portfolio = portfolio * (1 + a.investment_return) + contribution;
    retirement = retirement * (1 + a.investment_return) + contributions + match;
    cash += cash > 0 ? cash * a.cash_yield : 0;
    if (working) {
      cash += takeHome - spending - contribution;
    } else {
      let need = spending;
      const fromPortfolio = Math.min(need, portfolio);
      portfolio -= fromPortfolio;
      need -= fromPortfolio;
      const fromRetirement = Math.min(need / (1 - a.tax_rate), retirement);
      retirement -= fromRetirement;
      need -= fromRetirement * (1 - a.tax_rate);
      cash -= need;
    }
    mortgage = Math.max(0, mortgage * (1 + condo.rate) - mortgagePaid);
    condoValue *= 1 + a.inflation;
  }

  const retireRow = rows.find((r) => r.age === profile.retire_age) ?? rows[rows.length - 1];
  const working = rows.filter((r) => r.age <= profile.retire_age);
  const lowest = working.reduce((min, r) => (r.cash < min.cash ? r : min), working[0]);
  const result: Result = {
    years: rows,
    flags: [],
    summary: {
      net_worth_at_retire: retireRow.net_worth,
      retirement_at_retire: retireRow.retirement,
      min_cash: lowest.cash,
      min_cash_age: lowest.age,
    },
  };
  const zero = { net_worth_at_retire: 0, retirement_at_retire: 0, min_cash: 0, min_cash_age: 0 };
  return { compare: { baseline: result, scenario: result, diff: zero }, years: extras };
}
