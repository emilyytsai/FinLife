"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import {
  ChildAsset,
  CreditCardAsset,
  DebtAsset,
  InvestmentsAsset,
  HouseAsset,
  NetworkSphereAsset,
  PersonAsset,
  SedanAsset,
  SuvAsset,
} from "@/components/cloud/assets";
import { money, pct } from "@/lib/format";
import { tipContent, tipReveal } from "@/lib/tipReveal";
import { lifeAt, type Detail, type LifeFigure } from "@/lib/lifeState";
import type { Compare, LifeEvent, Profile } from "@/lib/types";

interface LifeCloudProps {
  profile: Profile;
  events: LifeEvent[];
  compare: Compare;
  /** The age to show. Driven by the timeline scrubber. */
  age: number;
}

interface Section {
  title: string;
  details: Detail[];
  /** A short sentence instead of (or above) the rows. */
  note?: string;
}

const section = (figure: LifeFigure | undefined): Section[] =>
  figure && figure.details.length > 0 ? [{ title: figure.title, details: figure.details }] : [];
const isSuv = (title: string) => /\b(suv|truck|van)\b/i.test(title);

/** Size of each money tile's point cloud: a little smaller on wide screens, where four stack beside the scene. */
const METRIC_VISUAL = "size-14 sm:size-16 lg:size-16";

/** From this many models on, the scene keeps clear of the money column (wide screens). */
const CROWDED_AT = 3;
/** The fallback never shrinks the models below this. */
const MIN_SCALE = 0.55;

/** Pixels the ground grid shifts per year of age, so scrubbing reads as travel. */
const GROUND_STEP = 24;

/**
 * "Life Time Travel" as a LiDAR scan: the people and things in the user's life as point clouds on a dotted ground,
 * with the money in a data row below. Everything comes from the engine row, the profile, and the events at that age.
 */
export function LifeCloud({ profile, events, compare, age: requestedAge }: LifeCloudProps) {
  const rows = events.length > 0 ? compare.scenario.years : compare.baseline.years;
  const first = rows[0]?.age ?? profile.age;
  const last = rows[rows.length - 1]?.age ?? profile.retire_age;
  const age = Math.min(Math.max(requestedAge, first), last);
  const row = rows.find((r) => r.age === age);
  // The engine has numbers from today to age 95. Outside that, the scene dims and the numbers show a dash.
  const outside = requestedAge < first ? "before" : requestedAge > last ? "after" : null;
  const shown = (value: number) => (outside ? null : value);

  const groups = Object.fromEntries(lifeAt(profile, events, age, row).map((group) => [group.key, group]));
  const [you, ...kids] = groups.family?.figures ?? [];
  const home = groups.home?.figures[0];
  const work = groups.work?.figures[0];
  const cars = groups.cars?.figures ?? [];
  const debt = groups.debt?.figures[0];
  const savings = groups.savings?.figures[0];

  // Hover cards for the money tiles. Every value is the engine's (this year's row and the plan's summary) or the profile's.
  const summary = (events.length > 0 ? compare.scenario : compare.baseline).summary;
  const noNumbers: Section[] = [{ title: "No numbers", details: [], note: "The plan has no numbers for this year." }];
  const cashSections: Section[] =
    outside || !row
      ? noNumbers
      : [
          {
            title: "Cash this year",
            details: [
              { label: "Income", value: money(row.income) },
              { label: "Living costs", value: money(row.expenses) },
              { label: "Cash yield", value: pct(profile.assumptions.cash_yield) },
            ],
          },
          {
            title: `Working years (to ${profile.retire_age})`,
            details: [{ label: "Lowest cash", value: `${money(summary.min_cash)} at ${summary.min_cash_age}` }],
          },
        ];
  const debtSections: Section[] = outside
    ? noNumbers
    : [
        ...section(debt),
        ...(home?.name === "house" && row ? [{ title: "Home", details: [{ label: "Home equity", value: money(row.home_equity) }] }] : []),
      ];
  const investmentSections: Section[] = [
    {
      title: "Investments",
      details: [],
      note: "Not in the plan yet. The engine doesn't track a brokerage portfolio, so there's no value to show.",
    },
  ];
  const retirementSections: Section[] =
    outside || !savings
      ? noNumbers
      : [
          { title: "401(k)", details: savings.details },
          {
            title: "Outlook",
            details: [
              { label: "Expected return", value: `${pct(profile.assumptions.investment_return)}/yr` },
              { label: `At ${profile.retire_age}`, value: money(summary.retirement_at_retire) },
            ],
          },
        ];
  const ownsHome = home?.name === "house";
  const modelCount = 1 + kids.length + (ownsHome ? 1 : 0) + cars.length;
  const crowded = modelCount >= CROWDED_AT;

  // Fallback scaling: when the row of models is wider than its safe zone, shrink the whole group to fit.
  // Measured with unscaled sizes (transforms don't change layout), so it never feeds back on itself.
  const zoneRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLUListElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const zone = zoneRef.current;
    const row = rowRef.current;
    if (!zone || !row) return;
    const observer = new ResizeObserver(() => {
      const style = getComputedStyle(zone);
      const available = zone.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const needed = row.offsetWidth;
      setScale(available > 0 && needed > available ? Math.max(MIN_SCALE, available / needed) : 1);
    });
    observer.observe(zone);
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="cloud-heading" className="relative rounded-card p-5 text-ink sm:p-6">
        <h2 id="cloud-heading" className="sr-only">
          Your life at age {age}
        </h2>

        {row && (
          <dl className="flex justify-center text-center">
            <Figure label="Net worth" value={shown(row.net_worth)} format={money} large />
          </dl>
        )}
        {outside && (
          <p className="mt-1 text-center text-xs text-muted">
            {outside === "before" ? "Before today: no numbers yet." : `The plan runs to age ${last}.`}
          </p>
        )}

        {/* The scene: point clouds standing on a scanned ground plane. */}
        <div className={`relative mt-4 transition-opacity duration-500 ${outside ? "opacity-30" : ""}`}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
            <div
              className="absolute inset-x-[-20%] bottom-0 h-32 origin-bottom transition-[background-position] duration-700 ease-out [mask-image:linear-gradient(to_top,black,transparent)] [transform:perspective(420px)_rotateX(62deg)]"
              style={{
                backgroundImage: "radial-gradient(var(--ground-dot) 1px, transparent 1.5px)",
                backgroundSize: `${GROUND_STEP}px ${GROUND_STEP}px`,
                backgroundPosition: `${-(age - profile.age) * GROUND_STEP}px 0`,
              }}
            />
          </div>
          {/* Safe zone: with 3+ models, wide screens reserve the money column's width on the right, so the group
              re-centers in the space to its left. If the row is still too wide, it scales down to fit. */}
          <div ref={zoneRef} className={`flex justify-center transition-[padding] duration-500 ${crowded ? "lg:pr-52" : ""}`}>
            <ul
              ref={rowRef}
              className="relative flex min-h-56 w-full flex-wrap items-end justify-center gap-x-3 gap-y-4 pb-6 pt-4 transition-transform duration-500 sm:min-h-64 sm:gap-x-10 sm:px-2 lg:w-max lg:flex-nowrap"
              style={{ transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: "bottom center" }}
              aria-label="People and things"
            >
              <AnimatePresence initial={false} mode="popLayout">
                <Item key="you" label="You" sections={[...section(you), ...section(work), ...section(savings), ...section(debt)]}>
                  <PersonAsset className="h-40 w-16 sm:h-52 sm:w-24" />
                </Item>
                {kids.map((kid, i) => (
                  <Item key={kid.key} label="Child" sections={section(kid)}>
                    <ChildAsset variant={i % 2 === 0 ? 1 : 2} phase={2 + i} className="h-24 w-12 sm:h-32 sm:w-16" />
                  </Item>
                ))}
                {ownsHome && home && (
                  <Item key={home.key} label="Home" sections={section(home)}>
                    <HouseAsset className="h-36 w-40 sm:h-52 sm:w-64" />
                  </Item>
                )}
                {cars.map((car, i) =>
                  isSuv(car.title) ? (
                    <Item key={car.key} label={car.title} sections={section(car)}>
                      <SuvAsset phase={1 + i} className="h-20 w-32 sm:h-32 sm:w-52" />
                    </Item>
                  ) : (
                    <Item key={car.key} label={car.title} sections={section(car)}>
                      <SedanAsset phase={1 + i} className="h-20 w-32 sm:h-28 sm:w-52" />
                    </Item>
                  ),
                )}
              </AnimatePresence>
            </ul>
          </div>
        </div>

        {/* The money, floating over the right of the scene on wide screens (below it on narrow ones). No borders. */}
        {row && (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 lg:absolute lg:right-6 lg:top-1/2 lg:z-10 lg:mt-0 lg:w-48 lg:-translate-y-1/2 lg:grid-cols-1 lg:gap-2">
            <Metric label="Cash" value={shown(row.cash)} sections={cashSections} visual={<CreditCardAsset className={METRIC_VISUAL} />} />
            <Metric label="Debt" value={shown(row.debt)} sections={debtSections} visual={<DebtAsset className={METRIC_VISUAL} />} />
            {/* No investments value in the engine yet (schema has no field for it), so this shows a dash, never a made-up number. */}
            <Metric
              label="Investments"
              value={null}
              sections={investmentSections}
              visual={<InvestmentsAsset className={METRIC_VISUAL} />}
            />
            <Metric
              label="Retirement"
              value={shown(row.retirement)}
              sections={retirementSections}
              visual={<NetworkSphereAsset className={METRIC_VISUAL} />}
            />
          </dl>
        )}
      </section>
    </MotionConfig>
  );
}

function Figure({
  label,
  value,
  format,
  large = false,
}: {
  label: string;
  value: number | null;
  format: (v: number) => string;
  large?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{label}</dt>
      <dd className={`font-light tabular-nums tracking-tight text-ink ${large ? "text-5xl" : "text-2xl"}`} aria-live="polite">
        {value === null ? "—" : <AnimatedNumber value={value} format={format} />}
      </dd>
    </div>
  );
}

/** One money tile. Hover, focus, or tap shows its specifics beside it. */
function Metric({ label, value, visual, sections }: { label: string; value: number | null; visual: ReactNode; sections: Section[] }) {
  const tip = useSideTip();
  return (
    <div className="relative flex items-center gap-3" onMouseEnter={(event) => tip.show(event.currentTarget)} onMouseLeave={tip.hide}>
      <button
        type="button"
        aria-label={`${label} details`}
        aria-expanded={tip.open}
        onClick={(event) => (tip.open ? tip.hide() : tip.show(event.currentTarget.parentElement ?? event.currentTarget))}
        onFocus={(event) => tip.show(event.currentTarget.parentElement ?? event.currentTarget)}
        onBlur={tip.hide}
        className="shrink-0 rounded-xl outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
      >
        {visual}
      </button>
      <div>
        <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{label}</dt>
        <dd className="text-2xl font-light tabular-nums tracking-tight text-ink drop-shadow-[0_0_8px_var(--number-glow)]">
          {value === null ? "—" : <AnimatedNumber value={value} format={money} />}
        </dd>
      </div>
      <AnimatePresence>{tip.open && sections.length > 0 && <TipCard side={tip.side} sections={sections} />}</AnimatePresence>
    </div>
  );
}

type Side = "right" | "left" | "below" | "below-start" | "below-end";
/** The hover card's width (w-60) and its gap from the model, in px. */
const TIP_WIDTH = 240;
const TIP_GAP = 12;
const TIP_POSITION: Record<Side, string> = {
  right: "left-full top-1/2 ml-3 -translate-y-1/2",
  left: "right-full top-1/2 mr-3 -translate-y-1/2",
  below: "left-1/2 top-full mt-2 -translate-x-1/2",
  "below-start": "left-0 top-full mt-2",
  "below-end": "right-0 top-full mt-2",
};

/** Where a hover card opens: beside its anchor toward the side with more room, or below it if neither side fits. */
function useSideTip() {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<Side>("right");

  function show(el: Element) {
    const rect = el.getBoundingClientRect();
    const roomRight = window.innerWidth - rect.right;
    const roomLeft = rect.left;
    const needed = TIP_WIDTH + TIP_GAP + 8;
    if (roomRight >= needed && roomRight >= roomLeft) setSide("right");
    else if (roomLeft >= needed) setSide("left");
    else {
      // Below, kept on screen: lined up with the anchor's edge when centering would run off either side.
      const center = rect.left + rect.width / 2;
      setSide(center - TIP_WIDTH / 2 < 8 ? "below-start" : center + TIP_WIDTH / 2 > window.innerWidth - 8 ? "below-end" : "below");
    }
    setOpen(true);
  }

  return { open, side, show, hide: () => setOpen(false) };
}

/** The frosted card itself: titled blocks of label/value rows, or a short note. */
function TipCard({ side, sections }: { side: Side; sections: Section[] }) {
  return (
    <motion.div
      role="tooltip"
      {...tipReveal(side)}
      className={`pointer-events-none absolute z-20 w-60 rounded-xl border border-line bg-surface/90 p-3 text-sm shadow-2xl backdrop-blur-md ${TIP_POSITION[side]}`}
    >
      {sections.map((part, index) => (
        <motion.div key={part.title} {...tipContent} className={index > 0 ? "mt-2 border-t border-line pt-2" : ""}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{part.title}</p>
          {part.note && <p className="mt-1 text-ink/80">{part.note}</p>}
          {part.details.length > 0 && (
            <dl className="mt-1 space-y-0.5">
              {part.details.map((detail) => (
                <div key={detail.label} className="flex justify-between gap-3">
                  <dt className="text-muted">{detail.label}</dt>
                  <dd className="tabular-nums text-ink">{detail.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </motion.div>
      ))}
    </motion.div>
  );
}

/** One point-cloud model in the scene. Hover, focus, or tap shows its values beside it. */
function Item({ label, sections, children }: { label: string; sections: Section[]; children: ReactNode }) {
  const tip = useSideTip();
  return (
    <motion.li
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={{ duration: 0.4 }}
      className="relative"
      onMouseEnter={(event) => tip.show(event.currentTarget)}
      onMouseLeave={tip.hide}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={tip.open}
        onClick={(event) => (tip.open ? tip.hide() : tip.show(event.currentTarget))}
        onFocus={(event) => tip.show(event.currentTarget)}
        onBlur={tip.hide}
        className="block rounded-xl outline-none focus-visible:ring-1 focus-visible:ring-ink/40"
      >
        {children}
      </button>
      <AnimatePresence>{tip.open && sections.length > 0 && <TipCard side={tip.side} sections={sections} />}</AnimatePresence>
    </motion.li>
  );
}
