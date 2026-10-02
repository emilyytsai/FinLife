import { Baby, BriefcaseBusiness, Car, CreditCard, House, PiggyBank, type LucideIcon } from "lucide-react";
import { money, pct } from "./format";
import type { LifeEvent } from "./types";

// Icon mapping from the game plan, section 6. job_loss also gets a red slash (see EventIcon).

export function eventIcon(event: LifeEvent): LucideIcon {
  switch (event.type) {
    case "buy_house":
      return House;
    case "have_child":
      return Baby;
    case "job_loss":
      return BriefcaseBusiness;
    case "set_retirement_pct":
      return PiggyBank;
    case "new_debt":
      return /\bcar\b/i.test(event.name) ? Car : CreditCard;
  }
}

function debtName(name: string): string {
  const trimmed = name.trim() || "loan";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

/** "car" -> "car loan"; "student loan" stays as is (same rule as engine.label). */
function loanName(name: string): string {
  return /loan$/i.test(name) ? name : `${name} loan`;
}

/** Short text next to the chart badge: "House", "401(k) 10%". */
export function eventShortLabel(event: LifeEvent): string {
  switch (event.type) {
    case "buy_house":
      return "House";
    case "have_child":
      return "Child";
    case "job_loss":
      return "Job loss";
    case "set_retirement_pct":
      return `401(k) ${pct(event.pct)}`;
    case "new_debt":
      return debtName(event.name);
  }
}

/** Hover text on the chart badge: "Buy house at 28, $350k". */
export function eventTooltip(event: LifeEvent): string {
  switch (event.type) {
    case "buy_house":
      return `Buy house at ${event.age}, ${money(event.price)}`;
    case "have_child":
      return `Have a child at ${event.age}, ${money(event.annual_cost)}/yr`;
    case "job_loss":
      return `Lose job at ${event.age}, ${event.months} ${event.months === 1 ? "month" : "months"}`;
    case "set_retirement_pct":
      return `Set 401(k) to ${pct(event.pct)} at ${event.age}`;
    case "new_debt":
      return `${loanName(debtName(event.name))} at ${event.age}, ${money(event.balance)}`;
  }
}

/** Chip text. Mirrors engine.label (contracts/schema.md "Labels"). */
export function eventLabel(event: LifeEvent): string {
  switch (event.type) {
    case "buy_house":
      return `Buy a ${money(event.price)} house at ${event.age}`;
    case "have_child":
      return `Have a child at ${event.age}`;
    case "job_loss":
      return `Lose job for ${event.months} ${event.months === 1 ? "month" : "months"} at ${event.age}`;
    case "set_retirement_pct":
      return `Set 401(k) to ${pct(event.pct)} at ${event.age}`;
    case "new_debt":
      return `Take on a ${money(event.balance)} ${loanName(event.name.trim())} at ${event.age}`;
  }
}
