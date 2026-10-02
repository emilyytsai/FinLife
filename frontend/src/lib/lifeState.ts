import type { PictogramName } from "@/components/Pictogram";
import { money, pct } from "./format";
import type { LifeEvent, Profile, YearRow } from "./types";

// "Life in Icons": which life events have happened by a given age, as groups of pictograms.
// Only reads the profile, the events, and the engine's row for that age. No financial math here.

export interface LifeFigure {
  /** Stable across ages, so a figure animates only when it first appears or disappears. */
  key: string;
  name: PictogramName;
  slash?: boolean;
  muted?: boolean;
  /** The event that added this figure, if any (used to celebrate new what-ifs). */
  eventId?: string;
}

export interface LifeGroup {
  key: string;
  caption: string;
  figures: LifeFigure[];
}

const isCar = (name: string) => /\bcar\b/i.test(name);

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Events that have started by `age`, in age order. */
function happened(events: LifeEvent[], age: number): LifeEvent[] {
  return events.filter((event) => event.age <= age).sort((a, b) => a.age - b.age);
}

export function lifeAt(profile: Profile, events: LifeEvent[], age: number, row: YearRow | undefined): LifeGroup[] {
  const past = happened(events, age);
  const groups: LifeGroup[] = [];

  const kids = past.filter((event) => event.type === "have_child");
  groups.push({
    key: "family",
    caption: kids.length === 0 ? "Just you" : `You + ${plural(kids.length, "child", "children")}`,
    figures: [
      { key: "you", name: "user" },
      ...kids.map((kid) => ({ key: `kid-${kid.id}`, name: "child" as const, eventId: kid.id })),
    ],
  });

  const house = past.find((event) => event.type === "buy_house");
  groups.push(
    house
      ? { key: "home", caption: "Homeowner", figures: [{ key: `home-${house.id}`, name: "house", eventId: house.id }] }
      : { key: "home", caption: "Renting", figures: [{ key: "home-rent", name: "building" }] },
  );

  const gap = past.find((event) => event.type === "job_loss" && event.age === age);
  if (age >= profile.retire_age) {
    groups.push({ key: "work", caption: "Retired", figures: [{ key: "work-retired", name: "palm" }] });
  } else if (gap) {
    groups.push({ key: "work", caption: "Between jobs", figures: [{ key: `work-gap-${gap.id}`, name: "briefcase", slash: true, eventId: gap.id }] });
  } else {
    groups.push({ key: "work", caption: "Working", figures: [{ key: "work", name: "briefcase" }] });
  }

  const cars: LifeFigure[] = [
    ...profile.debts.flatMap((debt, i) => (isCar(debt.name) ? [{ key: `car-profile-${i}`, name: "car" as const }] : [])),
    ...past.flatMap((event) =>
      event.type === "new_debt" && isCar(event.name) ? [{ key: `car-${event.id}`, name: "car" as const, eventId: event.id }] : [],
    ),
  ];
  if (cars.length > 0) groups.push({ key: "cars", caption: plural(cars.length, "car", "cars"), figures: cars });

  if (row) {
    const inDebt = row.debt > 0;
    groups.push({
      key: "debt",
      caption: inDebt ? `${money(row.debt)} debt` : "Debt-free",
      figures: [{ key: "debt", name: "card", muted: !inDebt }],
    });
  }

  const contribution = [...past].reverse().find((event) => event.type === "set_retirement_pct");
  const savePct = contribution?.type === "set_retirement_pct" ? contribution.pct : profile.retirement_pct;
  groups.push({
    key: "savings",
    caption: `401(k) ${pct(savePct)}`,
    figures: [{ key: "savings", name: "piggy", eventId: contribution?.id }],
  });

  return groups;
}
