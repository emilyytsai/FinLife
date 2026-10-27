// Event labels, ported from backend/engine/labels.py (contracts/schema.md "Labels").

import { money, pct } from "../format";
import type { LifeEvent } from "../types";

/** Describe an event like "Buy a $350k house at 28". */
export function label(event: LifeEvent): string {
  switch (event.type) {
    case "buy_house":
      return `Buy a ${money(event.price)} house at ${event.age}`;
    case "have_child":
      return `Have a child at ${event.age}`;
    case "job_loss":
      return `Lose job for ${event.months} ${event.months === 1 ? "month" : "months"} at ${event.age}`;
    case "set_retirement_pct":
      return `Set 401(k) to ${pct(event.pct)} at ${event.age}`;
    case "new_debt": {
      const descriptor = event.name.trimEnd().toLowerCase().endsWith("loan") ? event.name : `${event.name} loan`;
      return `Take on a ${money(event.balance)} ${descriptor} at ${event.age}`;
    }
  }
}
