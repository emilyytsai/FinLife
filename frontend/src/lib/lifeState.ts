import type { PictogramName } from "@/components/Pictogram";
import { money, pct } from "./format";
import type { BuyHouseEvent, LifeEvent, Profile, YearRow } from "./types";

// "Life in Icons": what the user has and owes at a given age, as pictograms with a data table behind each.
// Values come straight from the profile, the events, or the engine's row for that age. No financial math here.

export interface Detail {
  label: string;
  value: string;
}

export interface LifeFigure {
  /** Stable across ages, so a figure animates only when it first appears or disappears. */
  key: string;
  name: PictogramName;
  slash?: boolean;
  muted?: boolean;
  /** The event that added this figure, if any (used to celebrate new what-ifs). */
  eventId?: string;
  /** Popover heading and rows. */
  title: string;
  details: Detail[];
}

export interface LifeGroup {
  key: string;
  caption: string;
  figures: LifeFigure[];
}

const isCar = (name: string) => /\b(car|suv|truck|van)\b/i.test(name);

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Events that have started by `age`, in age order. */
function happened(events: LifeEvent[], age: number): LifeEvent[] {
  return events.filter((event) => event.age <= age).sort((a, b) => a.age - b.age);
}

function houseDetails(house: BuyHouseEvent, row: YearRow | undefined): Detail[] {
  return [
    { label: "Purchase price", value: money(house.price) },
    { label: "Bought at", value: `Age ${house.age}` },
    { label: "Down payment", value: money(house.price * house.down_pct) },
    { label: "Mortgage at purchase", value: money(house.price * (1 - house.down_pct)) },
    { label: "Mortgage rate", value: pct(house.rate) },
    { label: "Term", value: `${house.years} yrs` },
    ...(row ? [{ label: "Home equity", value: money(row.home_equity) }] : []),
  ];
}

export function lifeAt(profile: Profile, events: LifeEvent[], age: number, row: YearRow | undefined): LifeGroup[] {
  const past = happened(events, age);
  const groups: LifeGroup[] = [];

  const kids = past.filter((event) => event.type === "have_child");
  groups.push({
    key: "family",
    caption: kids.length === 0 ? "You" : `You + ${kids.length}`,
    figures: [
      {
        key: "you",
        name: "user",
        title: "You",
        details: [
          { label: "Age", value: String(age) },
          { label: "Retire at", value: String(profile.retire_age) },
          ...(row ? [{ label: "Expenses", value: `${money(row.expenses)}/yr` }] : []),
        ],
      },
      ...kids.map((kid) => ({
        key: `kid-${kid.id}`,
        name: "child" as const,
        eventId: kid.id,
        title: "Child",
        details: [
          { label: "Born", value: `Your age ${kid.age}` },
          { label: "Child's age", value: String(age - kid.age) },
          { label: "Cost in first year", value: `${money(kid.annual_cost)}/yr` },
          { label: "Costs run to", value: `Your age ${kid.age + 17}` },
        ],
      })),
    ],
  });

  const house = past.find((event): event is BuyHouseEvent => event.type === "buy_house");
  groups.push(
    house
      ? {
          key: "home",
          caption: "Home",
          figures: [{ key: `home-${house.id}`, name: "house", eventId: house.id, title: "Home", details: houseDetails(house, row) }],
        }
      : {
          key: "home",
          caption: "Renting",
          figures: [
            {
              key: "home-rent",
              name: "building",
              title: "Renting",
              details: [{ label: `Rent at ${profile.age}`, value: `${money(profile.monthly_rent)}/mo` }],
            },
          ],
        },
  );

  const gap = past.find((event) => event.type === "job_loss" && event.age === age);
  const incomeRow = row ? [{ label: "Income this year", value: money(row.income) }] : [];
  if (age >= profile.retire_age) {
    groups.push({
      key: "work",
      caption: "Retired",
      figures: [
        {
          key: "work-retired",
          name: "palm",
          title: "Retired",
          details: row ? [{ label: "Net worth", value: money(row.net_worth) }] : [],
        },
      ],
    });
  } else if (gap?.type === "job_loss") {
    groups.push({
      key: "work",
      caption: "Job gap",
      figures: [
        {
          key: `work-gap-${gap.id}`,
          name: "briefcase",
          slash: true,
          eventId: gap.id,
          title: "Between jobs",
          details: [{ label: "Months out", value: String(gap.months) }, ...incomeRow],
        },
      ],
    });
  } else {
    groups.push({
      key: "work",
      caption: "Work",
      figures: [{ key: "work", name: "briefcase", title: "Work", details: incomeRow }],
    });
  }

  const cars: LifeFigure[] = [
    ...profile.debts.flatMap((debt, i) =>
      isCar(debt.name)
        ? [
            {
              key: `car-profile-${i}`,
              name: "car" as const,
              title: capitalize(debt.name),
              details: [
                { label: `Balance at ${profile.age}`, value: money(debt.balance) },
                { label: "Rate", value: pct(debt.rate) },
                { label: "Payment", value: `${money(debt.min_payment)}/mo` },
              ],
            },
          ]
        : [],
    ),
    ...past.flatMap((event) =>
      event.type === "new_debt" && isCar(event.name)
        ? [
            {
              key: `car-${event.id}`,
              name: "car" as const,
              eventId: event.id,
              title: capitalize(event.name),
              details: [
                { label: "Loan amount", value: money(event.balance) },
                { label: "Taken at", value: `Age ${event.age}` },
                { label: "Rate", value: pct(event.rate) },
                { label: "Term", value: `${event.years} yrs` },
              ],
            },
          ]
        : [],
    ),
  ];
  if (cars.length > 0) groups.push({ key: "cars", caption: plural(cars.length, "Car", "Cars"), figures: cars });

  if (row) {
    const loans = [
      ...profile.debts.map((debt) => ({ label: capitalize(debt.name), value: `${money(debt.balance)} at ${pct(debt.rate)}` })),
      ...past.flatMap((event) =>
        event.type === "new_debt" ? [{ label: capitalize(event.name), value: `${money(event.balance)} at ${pct(event.rate)}` }] : [],
      ),
    ];
    groups.push({
      key: "debt",
      caption: "Debt",
      figures: [
        {
          key: "debt",
          name: "card",
          muted: row.debt <= 0,
          title: "Debt (excl. mortgage)",
          details: [{ label: "Total balance", value: money(row.debt) }, ...loans.map((loan) => ({ ...loan, label: `${loan.label}, start` }))],
        },
      ],
    });
  }

  const contribution = [...past].reverse().find((event) => event.type === "set_retirement_pct");
  const savePct = contribution?.type === "set_retirement_pct" ? contribution.pct : profile.retirement_pct;
  groups.push({
    key: "savings",
    caption: "401(k)",
    figures: [
      {
        key: "savings",
        name: "piggy",
        eventId: contribution?.id,
        title: "401(k)",
        details: [
          ...(row ? [{ label: "Balance", value: money(row.retirement) }] : []),
          { label: "Your contribution", value: pct(savePct) },
          { label: "Employer match up to", value: pct(profile.employer_match_pct) },
        ],
      },
    ],
  });

  return groups;
}
