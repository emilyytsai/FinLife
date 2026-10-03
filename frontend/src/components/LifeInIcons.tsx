"use client";

import { useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion, type TargetAndTransition } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { Pictogram, type PictogramName } from "@/components/Pictogram";
import { money } from "@/lib/format";
import { lifeAt, type LifeFigure } from "@/lib/lifeState";
import { useIsPhone } from "@/lib/useIsPhone";
import type { Compare, LifeEvent, Profile, YearRow } from "@/lib/types";

interface LifeInIconsProps {
  profile: Profile;
  events: LifeEvent[];
  compare: Compare;
  /** The age to show. Driven by the timeline scrubber. */
  age: number;
  /** Events just added by a what-if; their figures get a celebration ring. */
  freshIds: string[];
}

type Trend = "up" | "down" | null;
type MetricKey = "net_worth" | "cash" | "retirement" | "home_equity" | "debt";

/** Direction only, compared with the year before. The values themselves are the engine's. */
function trend(rows: YearRow[], age: number, key: MetricKey): Trend {
  const now = rows.find((row) => row.age === age);
  const before = rows.find((row) => row.age === age - 1);
  if (!now || !before || now[key] === before[key]) return null;
  return now[key] > before[key] ? "up" : "down";
}

const wholeNumber = (value: number) => String(Math.round(value));

/** "Life Time Travel": the user's money and life at one age, as big bare numbers and full-body pictograms. */
export function LifeInIcons({ profile, events, compare, age: requestedAge, freshIds }: LifeInIconsProps) {
  const phone = useIsPhone();
  const hasScenario = events.length > 0;
  const rows = hasScenario ? compare.scenario.years : compare.baseline.years;
  const first = rows[0]?.age ?? profile.age;
  const last = rows[rows.length - 1]?.age ?? profile.retire_age;
  const age = Math.min(Math.max(requestedAge, first), last);
  const row = rows.find((r) => r.age === age);
  const baseRow = compare.baseline.years.find((r) => r.age === age);
  const groups = lifeAt(profile, events, age, row);
  const ownsHome = events.some((event) => event.type === "buy_house" && event.age <= age);

  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="life-heading" className="rounded-card bg-surface p-5 shadow-soft sm:p-8">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-muted">Age</p>
            <h2 id="life-heading" className="text-6xl font-extrabold tabular-nums text-primary sm:text-7xl" aria-live="polite">
              <AnimatedNumber value={age} format={wholeNumber} />
            </h2>
          </div>
          {row && (
            <dl>
              <Metric
                label="Net worth"
                value={row.net_worth}
                trend={trend(rows, age, "net_worth")}
                baseline={hasScenario && baseRow && baseRow.net_worth !== row.net_worth ? baseRow.net_worth : undefined}
                large
              />
            </dl>
          )}
        </div>

        {row && (
          <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 sm:flex sm:flex-wrap">
            <Metric label="Cash" value={row.cash} trend={trend(rows, age, "cash")} />
            <Metric label="401(k)" value={row.retirement} trend={trend(rows, age, "retirement")} />
            <AnimatePresence initial={false}>
              {ownsHome && (
                <motion.div key="equity" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>
                  <Metric label="Home equity" value={row.home_equity} trend={trend(rows, age, "home_equity")} />
                </motion.div>
              )}
            </AnimatePresence>
            <Metric label="Debt" value={row.debt} trend={null} />
          </dl>
        )}

        <ul
          className="mt-8 flex min-h-36 flex-wrap items-end gap-x-8 gap-y-6 border-t border-line pt-6 sm:min-h-44 sm:gap-x-12"
          aria-label="Your life at this age"
        >
          <AnimatePresence initial={false} mode="popLayout">
            {groups.map((group) => (
              <motion.li
                key={group.key}
                layout
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
                className="flex flex-col items-center gap-2"
              >
                <div className="flex items-end gap-1 sm:gap-2">
                  <AnimatePresence initial={false} mode="popLayout">
                    {group.figures.map((figure) => (
                      <Figure
                        key={figure.key}
                        figure={figure}
                        phone={phone}
                        fresh={Boolean(figure.eventId && freshIds.includes(figure.eventId))}
                      />
                    ))}
                  </AnimatePresence>
                </div>
                <motion.span layout="position" className="text-xs font-semibold uppercase tracking-wide text-muted sm:text-sm">
                  {group.caption}
                </motion.span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </section>
    </MotionConfig>
  );
}

interface Motion {
  initial: TargetAndTransition;
  exit: TargetAndTransition;
}

/** How each kind of thing arrives and leaves: cars drive, people pop up, homes drop in. */
const MOTIONS: Record<PictogramName, Motion> = {
  car: { initial: { x: -140, opacity: 0 }, exit: { x: 140, opacity: 0 } },
  user: { initial: { y: 60, scaleY: 0.3, opacity: 0 }, exit: { y: 40, scale: 0.5, opacity: 0 } },
  child: { initial: { y: 60, scaleY: 0.2, opacity: 0 }, exit: { y: 40, scale: 0.4, opacity: 0 } },
  house: { initial: { y: -120, opacity: 0 }, exit: { scale: 0.5, opacity: 0 } },
  building: { initial: { y: -120, opacity: 0 }, exit: { scale: 0.5, opacity: 0 } },
  briefcase: { initial: { rotate: -25, scale: 0.4, opacity: 0 }, exit: { rotate: 25, scale: 0.4, opacity: 0 } },
  palm: { initial: { scale: 0, rotate: 20, opacity: 0 }, exit: { scale: 0, opacity: 0 } },
  piggy: { initial: { y: -50, scale: 0.5, opacity: 0 }, exit: { scale: 0.5, opacity: 0 } },
  baby: { initial: { x: -80, opacity: 0 }, exit: { x: 80, opacity: 0 } },
  card: { initial: { x: 80, rotate: 12, opacity: 0 }, exit: { x: -80, opacity: 0 } },
};

type Align = "left" | "center" | "right";
/** Popover width in px (w-60), used to keep it on screen. */
const POPOVER_PX = 240;

/** One full-body pictogram. Hover, focus, or tap shows its data table. */
function Figure({ figure, fresh, phone }: { figure: LifeFigure; fresh: boolean; phone: boolean }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<Align>("center");
  const ref = useRef<HTMLButtonElement>(null);
  const base = phone ? 64 : 104;
  const size = figure.name === "child" ? Math.round(base * 0.8) : base;
  const motionSpec = MOTIONS[figure.name];

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      const mid = rect.left + rect.width / 2;
      if (mid - POPOVER_PX / 2 < 8) setAlign("left");
      else if (mid + POPOVER_PX / 2 > window.innerWidth - 8) setAlign("right");
      else setAlign("center");
    }
    setOpen(true);
  }

  const position = align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2";

  return (
    <motion.span
      layout
      className="relative inline-flex text-ink"
      initial={motionSpec.initial}
      animate={{ x: 0, y: 0, scale: 1, scaleY: 1, rotate: 0, opacity: 1 }}
      exit={{ ...motionSpec.exit, transition: { duration: 0.25 } }}
      transition={{ type: "spring", stiffness: 380, damping: 18 }}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      style={{ transformOrigin: "bottom center" }}
    >
      {fresh && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-4 border-accent"
          initial={{ scale: 0.6, opacity: 0.9 }}
          animate={{ scale: 1.8, opacity: 0 }}
          transition={{ duration: 0.9, repeat: 2, ease: "easeOut" }}
        />
      )}
      <motion.button
        ref={ref}
        type="button"
        aria-label={figure.title}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onFocus={show}
        onBlur={() => setOpen(false)}
        whileHover={{ y: -6, scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        animate={{ opacity: figure.muted ? 0.25 : 1 }}
        className="rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Pictogram name={figure.name} slash={figure.slash} size={size} />
      </motion.button>
      <AnimatePresence>
        {open && figure.details.length > 0 && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className={`absolute top-full z-20 mt-2 w-60 rounded-xl bg-ink p-3.5 text-sm text-white shadow-soft ${position}`}
          >
            <p className="mb-2 font-semibold">{figure.title}</p>
            <dl className="space-y-1.5">
              {figure.details.map((detail) => (
                <div key={detail.label} className="flex justify-between gap-3">
                  <dt className="text-white/70">{detail.label}</dt>
                  <dd className="font-semibold tabular-nums">{detail.value}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.span>
  );
}

function Metric({
  label,
  value,
  trend,
  baseline,
  large = false,
}: {
  label: string;
  value: number;
  trend: Trend;
  /** Today's-path value at the same age, shown struck through when a what-if changes it. */
  baseline?: number;
  large?: boolean;
}) {
  const arrow = large ? 40 : 24;
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-widest text-muted">{label}</dt>
      <dd className="flex items-center gap-1.5">
        <AnimatedNumber
          value={value}
          format={money}
          className={`font-extrabold tabular-nums ${large ? "text-6xl sm:text-7xl" : "text-3xl sm:text-4xl"}`}
        />
        <AnimatePresence mode="wait" initial={false}>
          {trend && (
            <motion.span
              key={trend}
              initial={{ opacity: 0, y: trend === "up" ? 8 : -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {trend === "up" ? (
                <ArrowUpRight className="text-good" size={arrow} aria-label="up from the year before" />
              ) : (
                <ArrowDownRight className="text-alert" size={arrow} aria-label="down from the year before" />
              )}
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence initial={false}>
          {baseline !== undefined && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="ml-1 text-lg font-semibold text-muted line-through sm:text-xl"
            >
              <AnimatedNumber value={baseline} format={money} />
            </motion.span>
          )}
        </AnimatePresence>
      </dd>
    </div>
  );
}
