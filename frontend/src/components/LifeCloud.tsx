"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import {
  ChildAsset,
  CreditCardAsset,
  DebitCardAsset,
  InvestmentsAsset,
  HouseAsset,
  NetworkSphereAsset,
  PersonAsset,
  SedanAsset,
  SuvAsset,
} from "@/components/cloud/assets";
import { money } from "@/lib/format";
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
      <section aria-labelledby="cloud-heading" className="relative rounded-card bg-black p-5 text-neutral-100 sm:p-6">
        <h2 id="cloud-heading" className="sr-only">
          Your life at age {age}
        </h2>

        {row && (
          <dl className="flex justify-center text-center">
            <Figure label="Net worth" value={shown(row.net_worth)} format={money} large />
          </dl>
        )}
        {outside && (
          <p className="mt-1 text-center text-xs text-neutral-500">
            {outside === "before" ? "Before today: no numbers yet." : `The plan runs to age ${last}.`}
          </p>
        )}

        {/* The scene: point clouds standing on a scanned ground plane. */}
        <div className={`relative mt-4 transition-opacity duration-500 ${outside ? "opacity-30" : ""}`}>
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
            <div
              className="absolute inset-x-[-20%] bottom-0 h-32 origin-bottom transition-[background-position] duration-700 ease-out [mask-image:linear-gradient(to_top,black,transparent)] [transform:perspective(420px)_rotateX(62deg)]"
              style={{
                backgroundImage: "radial-gradient(rgba(229,229,229,0.45) 1px, transparent 1.5px)",
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
            <Metric label="Cash" value={shown(row.cash)} visual={<DebitCardAsset className={METRIC_VISUAL} />} />
            <Metric label="Debt" value={shown(row.debt)} visual={<CreditCardAsset className={METRIC_VISUAL} />} />
            {/* No investments value in the engine yet (schema has no field for it), so this shows a dash, never a made-up number. */}
            <Metric label="Investments" value={null} visual={<InvestmentsAsset className={METRIC_VISUAL} />} />
            <Metric label="Retirement" value={shown(row.retirement)} visual={<NetworkSphereAsset className={METRIC_VISUAL} />} />
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
      <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</dt>
      <dd className={`font-light tabular-nums tracking-tight text-white ${large ? "text-5xl" : "text-2xl"}`} aria-live="polite">
        {value === null ? "—" : <AnimatedNumber value={value} format={format} />}
      </dd>
    </div>
  );
}

function Metric({ label, value, visual }: { label: string; value: number | null; visual: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {visual}
      <div>
        <dt className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">{label}</dt>
        <dd className="text-2xl font-light tabular-nums tracking-tight text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.35)]">
          {value === null ? "—" : <AnimatedNumber value={value} format={money} />}
        </dd>
      </div>
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

/** One point-cloud model in the scene. Hover, focus, or tap shows its values beside it. */
function Item({ label, sections, children }: { label: string; sections: Section[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<Side>("right");

  // Open beside the model, toward the side of the screen with more room; below it if neither side fits.
  function show(el: Element) {
    const rect = el.getBoundingClientRect();
    const roomRight = window.innerWidth - rect.right;
    const roomLeft = rect.left;
    const needed = TIP_WIDTH + TIP_GAP + 8;
    if (roomRight >= needed && roomRight >= roomLeft) setSide("right");
    else if (roomLeft >= needed) setSide("left");
    else {
      // Below, kept on screen: lined up with the model's edge when centering would run off either side.
      const center = rect.left + rect.width / 2;
      setSide(center - TIP_WIDTH / 2 < 8 ? "below-start" : center + TIP_WIDTH / 2 > window.innerWidth - 8 ? "below-end" : "below");
    }
    setOpen(true);
  }

  return (
    <motion.li
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.3 } }}
      transition={{ duration: 0.4 }}
      className="relative"
      onMouseEnter={(event) => show(event.currentTarget)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(event) => (open ? setOpen(false) : show(event.currentTarget))}
        onFocus={(event) => show(event.currentTarget)}
        onBlur={() => setOpen(false)}
        className="block rounded-xl outline-none focus-visible:ring-1 focus-visible:ring-white/60"
      >
        {children}
      </button>
      <AnimatePresence>
        {open && sections.length > 0 && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, x: side === "right" ? -6 : side === "left" ? 6 : 0, y: side.startsWith("below") ? -4 : 0 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className={`pointer-events-none absolute z-20 w-60 rounded-xl border border-white/15 bg-neutral-950/90 p-3 text-sm shadow-2xl backdrop-blur-md ${TIP_POSITION[side]}`}
          >
            {sections.map((part, index) => (
              <div key={part.title} className={index > 0 ? "mt-2 border-t border-white/10 pt-2" : ""}>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">{part.title}</p>
                <dl className="mt-1 space-y-0.5">
                  {part.details.map((detail) => (
                    <div key={detail.label} className="flex justify-between gap-3">
                      <dt className="text-neutral-400">{detail.label}</dt>
                      <dd className="tabular-nums text-white">{detail.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
}
