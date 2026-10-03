import type { Compare, DemoProfile, LifeEvent, Profile, Result, YearRow } from "../types";

// MOCK DATA for the demo branch's use case: on by default there (?mock=off turns it off). Not on main or frontend.
// The engine has no spouse, owned home, or investment portfolio, so this file projects a household in the browser.
// That breaks the project's "all math lives in the engine" rule on purpose, for the demo. The numbers are
// simplified and are not the engine's. Fictional people; no real names or data.

export interface Spouse {
  age: number;
  income: number;
  monthlyExpenses: number;
  retirementBalance: number;
}

export interface Home {
  /** Which model to draw. */
  kind: "condo" | "apartment" | "house";
  value: number;
  mortgageBalance: number;
  rate: number;
  yearsLeft: number;
  monthlyHoa: number;
  /** Extra rows for the home's hover card (e.g. how the down payment was paid). */
  notes?: { label: string; value: string }[];
}

export interface Household {
  spouse: Spouse;
  home: Home;
  investments: { balance: number; monthlyContribution: number };
  /** A child in the family: her age today and her cost this year (rises with inflation until 18). */
  child?: { ageToday: number; costToday: number };
  /** Maya's work after the child arrives: unpaid leave in the birth year, then a reduced schedule for a while. */
  herWork?: { leaveMonths: number; schedulePct: number; untilChildAge: number };
}

/** Extra numbers for one age that the schema's YearRow doesn't carry. */
export interface MockYear {
  herIncome: number;
  herExpenses: number;
  /** Maya's work this year, in words (e.g. "80% schedule"). */
  herSchedule: string;
  spouseAge: number;
  spouseIncome: number;
  spouseExpenses: number;
  investments: number;
  investmentContribution: number;
  home: Home["kind"];
  homeValue: number;
  mortgageBalance: number;
  monthlyHoa: number;
  homeNotes: { label: string; value: string }[];
  /** null when there's no child in this scenario. */
  childAge: number | null;
  childExpenses: number;
}

/** Maya: $200k a year, a 401(k), a brokerage account, and two car loans. Her husband's numbers live in the household. */
export const MOCK_PROFILE: Profile = {
  age: 32,
  retire_age: 62,
  income: 200000,
  salary_growth: 0.03,
  cash: 60000,
  monthly_expenses: 5000, // her share of day-to-day spending
  monthly_rent: 0, // they own the condo
  retirement_balance: 210000,
  retirement_pct: 0.1,
  employer_match_pct: 0.04,
  debts: [
    { name: "car", balance: 14000, rate: 0.059, min_payment: 420 },
    { name: "SUV", balance: 28000, rate: 0.064, min_payment: 610 },
  ],
  assumptions: { investment_return: 0.06, inflation: 0.03, cash_yield: 0.02, tax_rate: 0.24, home_cost_pct: 0.01 },
};

/** Base household: her husband, a $650k condo, and a $140k brokerage portfolio. */
export const MOCK_HOUSEHOLD: Household = {
  spouse: { age: 34, income: 110000, monthlyExpenses: 3000, retirementBalance: 95000 },
  home: { kind: "condo", value: 650000, mortgageBalance: 470000, rate: 0.061, yearsLeft: 26, monthlyHoa: 550 },
  investments: { balance: 140000, monthlyContribution: 2000 },
};

export const MOCK_PERSONA: DemoProfile = {
  id: "maya-household",
  name: "Maya",
  blurb: "32, married, a condo and two cars.",
  profile: MOCK_PROFILE,
};

/** About $18k a year: in line with the USDA's estimate of roughly $310k to raise a child to 17 (middle-income couple). */
const CHILD_COST = 18000;

/** A have_child event born `ageToday` years ago, at her first-year cost. */
function childEvent(profile: Profile, ageToday: number): LifeEvent {
  const firstYear = CHILD_COST / (1 + profile.assumptions.inflation) ** ageToday;
  return { type: "have_child", age: profile.age - ageToday, annual_cost: Math.round(firstYear / 100) * 100 };
}

// House purchase: sell the condo (6% selling costs), keep $20k cash as a cushion, and sell the brokerage account
// (about $15k of tax on the gains). Everything else goes into the down payment on a $950k house, 30 years at 6.1%.
const HOUSE_PRICE = 950000;
const SALE_COSTS = 0.06;
const CASH_KEPT = 20000;
const BROKERAGE_TAX = 15000;
const condoProceeds = MOCK_HOUSEHOLD.home.value * (1 - SALE_COSTS) - MOCK_HOUSEHOLD.home.mortgageBalance;
const cashUsed = MOCK_PROFILE.cash - CASH_KEPT;
const brokerageProceeds = MOCK_HOUSEHOLD.investments.balance - BROKERAGE_TAX;
const downPayment = condoProceeds + cashUsed + brokerageProceeds;

const k = (value: number) => `$${Math.round(value / 1000)}k`;
const KID_WORDS = /\b(kid|kids|child|children|baby|daughter|son)\b/i;

export interface MockScenario {
  id: string;
  /** The suggested question, also shown above the scene while the scenario is on. */
  prompt: string;
  /** Typed questions that mean this scenario. */
  matches: (text: string) => boolean;
  profile: (profile: Profile) => Profile;
  household: Household;
  /** Events for the timeline markers and chips. */
  events: (profile: Profile) => LifeEvent[];
}

/** The demo's hard-coded scenarios. A typed question picks the first whose `matches` passes. */
export const MOCK_SCENARIOS: MockScenario[] = [
  {
    // Sell the condo and buy a house with cash and the brokerage account. Both cars stay.
    id: "house",
    prompt: "What if we sell the condo and buy a house, using our cash and selling our brokerage account?",
    matches: (text) => /\b(house|home)\b/i.test(text) || /\b(sell|selling)\b.*\bcondo\b/i.test(text),
    profile: (profile) => ({ ...profile, cash: CASH_KEPT }),
    household: {
      ...MOCK_HOUSEHOLD,
      home: {
        kind: "house",
        value: HOUSE_PRICE,
        mortgageBalance: HOUSE_PRICE - downPayment,
        rate: 0.061,
        yearsLeft: 30,
        monthlyHoa: 0,
        notes: [
          { label: "Down payment", value: k(downPayment) },
          { label: "From the condo", value: k(condoProceeds) },
          { label: "From cash", value: k(cashUsed) },
          { label: "From the brokerage", value: k(brokerageProceeds) },
        ],
      },
      investments: { balance: 0, monthlyContribution: MOCK_HOUSEHOLD.investments.monthlyContribution },
    },
    events: (profile) => [
      {
        type: "buy_house",
        age: profile.age,
        price: HOUSE_PRICE,
        down_pct: Math.round((downPayment / HOUSE_PRICE) * 100) / 100,
        rate: 0.061,
        years: 30,
      },
    ],
  },
  {
    // A child 5 years ago with the same cash, 401(k), and investments: a smaller apartment and one car.
    id: "kid-past",
    prompt: "What if we had a kid 5 years ago, but having the same cash, savings and investments?",
    matches: (text) => KID_WORDS.test(text) && /\b(ago|had|earlier|already)\b/i.test(text),
    profile: (profile) => ({ ...profile, debts: profile.debts.filter((debt) => !/\bsuv\b/i.test(debt.name)) }),
    household: {
      ...MOCK_HOUSEHOLD,
      home: { kind: "apartment", value: 420000, mortgageBalance: 300000, rate: 0.061, yearsLeft: 27, monthlyHoa: 380 },
      child: { ageToday: 5, costToday: CHILD_COST },
    },
    events: (profile) => [childEvent(profile, 5)],
  },
  {
    // A child now: 3 months of unpaid leave, then an 80% schedule until she starts school at 5. Condo and cars stay.
    id: "kid-now",
    prompt: "What if we have a kid now? How would it affect my work income?",
    matches: (text) => KID_WORDS.test(text),
    profile: (profile) => profile,
    household: {
      ...MOCK_HOUSEHOLD,
      child: { ageToday: 0, costToday: CHILD_COST },
      herWork: { leaveMonths: 3, schedulePct: 0.8, untilChildAge: 5 },
    },
    events: (profile) => [childEvent(profile, 0)],
  },
];

export const matchScenario = (text: string): MockScenario | undefined => MOCK_SCENARIOS.find((scenario) => scenario.matches(text));

const PLAN_TO_AGE = 95;

function payment(balance: number, rate: number, years: number): number {
  if (years <= 0 || balance <= 0) return 0;
  return rate === 0 ? balance / years : (balance * rate) / (1 - (1 + rate) ** -years);
}

/** Maya's share of a full schedule this year, and how to say it. */
function herWorkYear(household: Household, childAge: number | null): { share: number; label: string } {
  const work = household.herWork;
  if (!work || childAge === null || childAge >= work.untilChildAge) return { share: 1, label: "Full time" };
  const pct = `${Math.round(work.schedulePct * 100)}%`;
  if (childAge === 0) {
    return { share: ((12 - work.leaveMonths) / 12) * work.schedulePct, label: `${work.leaveMonths} mo unpaid leave, then ${pct}` };
  }
  return { share: work.schedulePct, label: `${pct} schedule` };
}

/**
 * A simplified household projection, for the demo only. Both partners earn and save into the household 401(k)
 * until her retire_age (he retires at the same time); the home appreciates with inflation while its mortgage
 * amortizes; the portfolio grows and takes monthly contributions. In retirement, spending comes from the portfolio,
 * then the 401(k), then cash.
 */
export function mockProject(
  profile: Profile,
  household: Household = MOCK_HOUSEHOLD,
): { compare: Compare; years: Record<number, MockYear> } {
  const { spouse, home, investments, child } = household;
  const a = profile.assumptions;
  let cash = profile.cash;
  let retirement = profile.retirement_balance + spouse.retirementBalance;
  let portfolio = investments.balance;
  let homeValue = home.value;
  let mortgage = home.mortgageBalance;
  const mortgagePayment = payment(home.mortgageBalance, home.rate, home.yearsLeft);
  const debts = profile.debts.map((d) => ({ balance: d.balance, rate: d.rate, annual: d.min_payment * 12 }));

  const rows: YearRow[] = [];
  const extras: Record<number, MockYear> = {};
  for (let age = profile.age; age <= PLAN_TO_AGE; age++) {
    const n = age - profile.age;
    const working = age < profile.retire_age;
    const growth = (1 + profile.salary_growth) ** n;
    const inflation = (1 + a.inflation) ** n;
    const childAge = child ? child.ageToday + n : null;
    const work = herWorkYear(household, childAge);
    const herIncome = working ? profile.income * growth * work.share : 0;
    const hisIncome = working ? spouse.income * growth : 0;
    const contributions = working ? (herIncome + hisIncome) * profile.retirement_pct : 0;
    const match = working ? (herIncome + hisIncome) * Math.min(profile.retirement_pct, profile.employer_match_pct) : 0;
    const takeHome = (herIncome + hisIncome - contributions) * (1 - a.tax_rate);
    const herExpenses = profile.monthly_expenses * 12 * inflation;
    const hisExpenses = spouse.monthlyExpenses * 12 * inflation;
    const childExpenses = child && childAge !== null && childAge < 18 ? child.costToday * inflation : 0;
    const hoa = home.monthlyHoa * 12 * inflation;
    const living = herExpenses + hisExpenses + childExpenses + hoa + homeValue * a.home_cost_pct;

    let debtPayments = 0;
    for (const d of debts) {
      const pay = Math.min(d.annual, d.balance * (1 + d.rate));
      d.balance = Math.max(0, d.balance * (1 + d.rate) - pay);
      debtPayments += pay;
    }
    const mortgagePaid = mortgage > 0 ? Math.min(mortgagePayment, mortgage * (1 + home.rate)) : 0;

    const debtTotal = debts.reduce((sum, d) => sum + d.balance, 0);
    const equity = homeValue - mortgage;
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
    const contribution = working ? investments.monthlyContribution * 12 : 0;
    extras[age] = {
      herIncome: Math.round(herIncome),
      herExpenses: Math.round(herExpenses),
      herSchedule: working ? work.label : "Retired",
      spouseAge: spouse.age + n,
      spouseIncome: Math.round(hisIncome),
      spouseExpenses: Math.round(hisExpenses),
      investments: Math.round(portfolio),
      investmentContribution: Math.round(contribution / 12),
      home: home.kind,
      homeValue: Math.round(homeValue),
      mortgageBalance: Math.round(mortgage),
      monthlyHoa: Math.round(hoa / 12),
      homeNotes: n === 0 ? (home.notes ?? []) : [],
      childAge,
      childExpenses: Math.round(childExpenses),
    };

    // Next year's balances.
    const spending = living + debtPayments + mortgagePaid;
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
    mortgage = Math.max(0, mortgage * (1 + home.rate) - mortgagePaid);
    homeValue *= 1 + a.inflation;
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
