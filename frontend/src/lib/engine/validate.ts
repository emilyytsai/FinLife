// Input checks from backend/app/models.py, with the same field paths and plain-English messages.

import type { FieldError, LifeEvent, Profile } from "../types";

type Limit = { ge?: number; le?: number; gt?: number; kind: "rate" | "money" | "plain"; whole?: boolean };

const PROFILE_LIMITS: Record<string, Limit> = {
  age: { ge: 18, kind: "plain", whole: true },
  retire_age: { le: 75, kind: "plain", whole: true },
  income: { ge: 0, kind: "money" },
  salary_growth: { ge: 0, le: 0.2, kind: "rate" },
  cash: { ge: 0, kind: "money" },
  monthly_expenses: { ge: 0, kind: "money" },
  monthly_rent: { ge: 0, kind: "money" },
  retirement_balance: { ge: 0, kind: "money" },
  retirement_pct: { ge: 0, le: 1, kind: "rate" },
  employer_match_pct: { ge: 0, le: 1, kind: "rate" },
};

const ASSUMPTION_LIMITS: Record<string, Limit> = {
  investment_return: { ge: 0, le: 0.2, kind: "rate" },
  inflation: { ge: 0, le: 0.2, kind: "rate" },
  cash_yield: { ge: 0, le: 0.2, kind: "rate" },
  tax_rate: { ge: 0, le: 0.6, kind: "rate" },
  home_cost_pct: { ge: 0, le: 0.05, kind: "rate" },
};

const DEBT_LIMITS: Record<string, Limit> = {
  balance: { ge: 0, kind: "money" },
  rate: { ge: 0, le: 0.4, kind: "rate" },
  min_payment: { ge: 0, kind: "money" },
};

function amount(value: number, kind: Limit["kind"]): string {
  if (kind === "rate") return `${Number((value * 100).toPrecision(6))}%`;
  if (kind === "money") return `$${Math.round(value).toLocaleString("en-US")}`;
  return value.toLocaleString("en-US");
}

function checkNumber(value: unknown, limit: Limit): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return limit.whole ? "Must be a whole number" : "Must be a number";
  if (limit.whole && !Number.isInteger(value)) return "Must be a whole number";
  if (limit.ge !== undefined && value < limit.ge) return `Must be at least ${amount(limit.ge, limit.kind)}`;
  if (limit.gt !== undefined && value <= limit.gt) return `Must be more than ${amount(limit.gt, limit.kind)}`;
  if (limit.le !== undefined && value > limit.le) return `Must be at most ${amount(limit.le, limit.kind)}`;
  return null;
}

function checkFields(target: Record<string, unknown>, limits: Record<string, Limit>, prefix: string, out: FieldError[]) {
  for (const [key, limit] of Object.entries(limits)) {
    const message = checkNumber(target[key], limit);
    if (message) out.push({ field: `${prefix}.${key}`, message });
  }
}

/** Field errors for a profile, empty when it is valid. */
export function profileErrors(profile: Profile): FieldError[] {
  const errors: FieldError[] = [];
  checkFields(profile as unknown as Record<string, unknown>, PROFILE_LIMITS, "profile", errors);
  if (Number.isInteger(profile.age) && Number.isInteger(profile.retire_age) && profile.retire_age <= profile.age) {
    errors.push({ field: "profile.retire_age", message: "Retirement age must be after current age" });
  }
  checkFields(profile.assumptions as unknown as Record<string, unknown>, ASSUMPTION_LIMITS, "profile.assumptions", errors);
  if (profile.debts.length > 5) errors.push({ field: "profile.debts", message: "You can have at most 5 debts" });
  profile.debts.forEach((debt, i) => {
    const prefix = `profile.debts.${i}`;
    const name = debt.name.trim();
    if (name.length === 0) errors.push({ field: `${prefix}.name`, message: "Can't be empty" });
    else if (debt.name.length > 40) errors.push({ field: `${prefix}.name`, message: "Must be 40 characters or fewer" });
    checkFields(debt as unknown as Record<string, unknown>, DEBT_LIMITS, prefix, errors);
  });
  return errors;
}

/** True when the event fits the profile: ages from today (a child up to 17 years back) to retire_age - 1. */
export function eventFits(profile: Profile, event: LifeEvent): boolean {
  const first = event.type === "have_child" ? profile.age - 17 : profile.age;
  return Number.isInteger(event.age) && first <= event.age && event.age <= profile.retire_age - 1;
}
