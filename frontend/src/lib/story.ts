import { money, pct } from "./format";
import type { LifeEvent } from "./types";

// Story copy for the Insights panel. Numbers shown here are the event's own inputs, only formatted.
// No advice: these describe the user's own "what if", never recommend one.

function months(n: number): string {
  return `${n} ${n === 1 ? "month" : "months"}`;
}

function loanName(name: string): string {
  const trimmed = name.trim() || "loan";
  return /loan$/i.test(trimmed) ? trimmed : `${trimmed} loan`;
}

export function storyTitle(event: LifeEvent): string {
  switch (event.type) {
    case "buy_house":
      return `Get the keys to a ${money(event.price)} home`;
    case "have_child":
      return "Grow your family";
    case "job_loss":
      return `A ${months(event.months)} gap between jobs`;
    case "set_retirement_pct":
      return `Save ${pct(event.pct)} in your 401(k)`;
    case "new_debt":
      return `Take on a ${money(event.balance)} ${loanName(event.name)}`;
  }
}

export function storyDetail(event: LifeEvent): string {
  switch (event.type) {
    case "buy_house":
      return `${pct(event.down_pct)} down, ${pct(event.rate)} rate over ${event.years} years. Rent stops that year.`;
    case "have_child":
      return `Child costs of ${money(event.annual_cost)} a year, for 18 years.`;
    case "job_loss":
      return `Income pauses for ${months(event.months)} that year.`;
    case "set_retirement_pct":
      return `Your contribution changes to ${pct(event.pct)} of income from this age on.`;
    case "new_debt":
      return `${pct(event.rate)} rate over ${event.years} years.`;
  }
}

/** "+$120k" / "-$40k" for an engine diff. Formatting only. */
export function signedMoney(x: number): string {
  return `${x >= 0 ? "+" : ""}${money(x)}`;
}
