// Health check and suggested scenarios, ported from backend/engine/analysis.py (contracts/schema.md "Analysis rules").

import { money } from "../format";
import type { Analysis, Highlight, Profile, SuggestedScenario, Tone } from "../types";
import { simulate, yearZeroFlows } from "./simulate";

/** Python's round(): half to even, so results match the original engine exactly. */
export function pyRound(x: number, digits = 0): number {
  const factor = 10 ** digits;
  const scaled = x * factor;
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  const rounded = diff > 0.5 ? floor + 1 : diff < 0.5 ? floor : floor % 2 === 0 ? floor : floor + 1;
  return rounded / factor;
}

const round3 = (x: number) => pyRound(x, 3);
const wholePercent = (ratio: number) => pyRound(ratio * 100);

/** Percent for a prompt: whole number normally, one decimal when not whole (0.075 -> "7.5"). */
function pctLabel(ratio: number): string {
  return String(pyRound(ratio * 1000) / 10);
}

export function analyze(profile: Profile): Analysis {
  const baseline = simulate(profile, []);
  const flows = yearZeroFlows(profile);
  const retireRow = baseline.years.find((row) => row.age === profile.retire_age)!;

  const emergency_fund_months =
    flows.monthly_outflow > 0 ? Math.min(pyRound(profile.cash / flows.monthly_outflow, 1), 99.9) : 99.9;

  let savings_rate = 0;
  let debt_to_income = 0;
  if (flows.income > 0) {
    savings_rate = round3(
      (flows.employee + flows.employer + flows.take_home - flows.expenses - flows.debt_payments) / flows.income,
    );
    debt_to_income = round3(flows.debt_payments / flows.income);
  }

  const retirement_target = 25 * retireRow.expenses;
  const retirement_projected = retireRow.retirement;
  const retirement_ratio = retirement_target !== 0 ? round3(retirement_projected / retirement_target) : 1;

  return {
    savings_rate,
    emergency_fund_months,
    debt_to_income,
    retirement_target,
    retirement_projected,
    retirement_ratio,
    highlights: [
      emergencyFundHighlight(emergency_fund_months),
      savingsRateHighlight(savings_rate),
      debtToIncomeHighlight(debt_to_income, flows.debt_payments),
      retirementPaceHighlight(retirement_ratio, profile.retire_age),
    ],
    suggested_scenarios: suggestedScenarios(profile),
  };
}

// Highlights. Tones compare the rounded value shown in the text; boundaries go to the better tone.

function tone(value: number, good: number, watch: number): Tone {
  return value >= good ? "good" : value >= watch ? "watch" : "alert";
}

function emergencyFundHighlight(months: number): Highlight {
  return {
    code: "emergency_fund",
    tone: tone(months, 6, 3),
    text: `Cash covers ${months.toFixed(1)} months of expenses.`,
  };
}

function savingsRateHighlight(savingsRate: number): Highlight {
  const p = wholePercent(savingsRate);
  return { code: "savings_rate", tone: tone(p, 15, 5), text: `You save ${p}% of your income, including your 401(k).` };
}

function debtToIncomeHighlight(debtToIncome: number, debtPayments0: number): Highlight {
  if (debtPayments0 === 0) return { code: "debt_to_income", tone: "good", text: "You have no debt payments." };
  const p = wholePercent(debtToIncome);
  // Lower is better: 20 -> good, 36 -> watch.
  const t: Tone = p <= 20 ? "good" : p <= 36 ? "watch" : "alert";
  return { code: "debt_to_income", tone: t, text: `Debt payments take ${p}% of your income.` };
}

function retirementPaceHighlight(ratio: number, retireAge: number): Highlight {
  const p = wholePercent(ratio);
  return {
    code: "retirement_pace",
    tone: tone(p, 100, 60),
    text: `You're on pace for ${p}% of a common retirement benchmark (25x yearly expenses at ${retireAge}).`,
  };
}

// Suggested scenarios. Exactly 3, in order. Ages clipped to retire_age - 1.

function suggestedScenarios(profile: Profile): SuggestedScenario[] {
  const { age, retire_age, income, retirement_pct } = profile;
  const clip = (a: number) => Math.min(a, retire_age - 1);

  const houseAge = clip(age + 6);
  const price = Math.max(50000, pyRound((income * 6) / 10000) * 10000);
  const house: SuggestedScenario = {
    prompt: `What if I buy a ${money(price)} house at ${houseAge}?`,
    event: { type: "buy_house", age: houseAge, price, down_pct: 0.1, rate: 0.065, years: 30 },
  };

  const lossAge = clip(age + 3);
  const loss: SuggestedScenario = {
    prompt: `What if I lose my job for 6 months at ${lossAge}?`,
    event: { type: "job_loss", age: lossAge, months: 6 },
  };

  let third: SuggestedScenario;
  if (retirement_pct < 0.15) {
    const thirdAge = clip(age + 3);
    const newPct = Math.min(retirement_pct + 0.05, 0.15);
    third = {
      prompt: `What if I raise my 401(k) to ${pctLabel(newPct)}% at ${thirdAge}?`,
      event: { type: "set_retirement_pct", age: thirdAge, pct: newPct },
    };
  } else {
    const thirdAge = clip(age + 8);
    third = {
      prompt: `What if I have a child at ${thirdAge}?`,
      event: { type: "have_child", age: thirdAge, annual_cost: 15000 },
    };
  }
  return [house, loss, third];
}
