"use client";

import { useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Pictogram } from "@/components/Pictogram";
import { money } from "@/lib/format";
import { lifeAt, type LifeFigure } from "@/lib/lifeState";
import type { Compare, LifeEvent, Profile, YearRow } from "@/lib/types";

interface LifeInIconsProps {
  profile: Profile;
  events: LifeEvent[];
  compare: Compare;
  /** Age under the pointer on the chart, or null. */
  focusAge: number | null;
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

/** The user's money and life at one age: bare numbers, then pictograms with a data table behind each. */
export function LifeInIcons({ profile, events, compare, focusAge, freshIds }: LifeInIconsProps) {
  const hasScenario = events.length > 0;
  const rows = hasScenario ? compare.scenario.years : compare.baseline.years;
  const first = rows[0]?.age ?? profile.age;
  const last = rows[rows.length - 1]?.age ?? profile.retire_age;
  // Not hovering the chart: show the age of the latest what-if, or today with none.
  const latestEvent = events.reduce((max, event) => Math.max(max, event.age), profile.age);
  const age = Math.min(Math.max(focusAge ?? (hasScenario ? latestEvent : profile.age), first), last);
  const row = rows.find((r) => r.age === age);
  const baseRow = compare.baseline.years.find((r) => r.age === age);
  const groups = lifeAt(profile, events, age, row);
  const ownsHome = events.some((event) => event.type === "buy_house" && event.age <= age);

  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="life-heading" className="rounded-card bg-surface p-4 shadow-soft sm:p-5">
        <h2 id="life-heading" className="text-xs font-bold uppercase tracking-widest text-muted" aria-live="polite">
          Age {age}
        </h2>

        {row && (
          <dl className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
            <Metric
              label="Net worth"
              value={money(row.net_worth)}
              trend={trend(rows, age, "net_worth")}
              baseline={hasScenario && baseRow && baseRow.net_worth !== row.net_worth ? money(baseRow.net_worth) : undefined}
              large
            />
            <Metric label="Cash" value={money(row.cash)} trend={trend(rows, age, "cash")} />
            <Metric label="401(k)" value={money(row.retirement)} trend={trend(rows, age, "retirement")} />
            {ownsHome && <Metric label="Home equity" value={money(row.home_equity)} trend={trend(rows, age, "home_equity")} />}
            <Metric label="Debt" value={money(row.debt)} trend={null} />
          </dl>
        )}

        <ul className="mt-5 flex flex-wrap gap-x-6 gap-y-4" aria-label="Your life at this age">
          <AnimatePresence initial={false} mode="popLayout">
            {groups.map((group) => (
              <motion.li
                key={group.key}
                layout
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.15 } }}
                className="flex flex-col items-center gap-1.5"
              >
                <div className="flex h-12 items-end gap-1">
                  <AnimatePresence initial={false} mode="popLayout">
                    {group.figures.map((figure) => (
                      <Figure key={figure.key} figure={figure} fresh={Boolean(figure.eventId && freshIds.includes(figure.eventId))} />
                    ))}
                  </AnimatePresence>
                </div>
                <motion.span layout="position" className="text-xs font-semibold text-muted">
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

type Align = "left" | "center" | "right";
/** Popover width in px (w-56), used to keep it on screen. */
const POPOVER_PX = 224;

/** One pictogram. Hover, focus, or tap shows its data table. */
function Figure({ figure, fresh }: { figure: LifeFigure; fresh: boolean }) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<Align>("center");
  const ref = useRef<HTMLButtonElement>(null);
  const size = figure.name === "child" ? 40 : 48;

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
      initial={{ y: -36, scale: 0.4, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: 1 }}
      exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 520, damping: 20 }}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
    >
      {fresh && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-0 rounded-full border-4 border-accent"
          initial={{ scale: 0.6, opacity: 0.9 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 0.9, repeat: 2, ease: "easeOut" }}
        />
      )}
      <button
        ref={ref}
        type="button"
        aria-label={figure.title}
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        onFocus={show}
        onBlur={() => setOpen(false)}
        className={`rounded-lg outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-primary/40 ${figure.muted ? "opacity-30" : ""}`}
      >
        <Pictogram name={figure.name} slash={figure.slash} size={size} />
      </button>
      <AnimatePresence>
        {open && figure.details.length > 0 && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className={`absolute top-full z-20 mt-2 w-56 rounded-lg bg-ink p-3 text-xs text-white shadow-soft ${position}`}
          >
            <p className="mb-1.5 font-semibold">{figure.title}</p>
            <dl className="space-y-1">
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
  value: string;
  trend: Trend;
  /** Today's-path value at the same age, shown struck through when a what-if changes it. */
  baseline?: string;
  large?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-widest text-muted">{label}</dt>
      <dd className="flex items-center gap-1">
        <span className={`font-bold tabular-nums ${large ? "text-4xl sm:text-5xl" : "text-2xl"}`}>{value}</span>
        {trend === "up" && <ArrowUpRight className="text-good" size={large ? 28 : 20} aria-label="up from the year before" />}
        {trend === "down" && <ArrowDownRight className="text-alert" size={large ? 28 : 20} aria-label="down from the year before" />}
        {baseline && (
          <span className="ml-1 text-sm font-semibold text-muted line-through tabular-nums" aria-label={`without what-ifs ${baseline}`}>
            {baseline}
          </span>
        )}
      </dd>
    </div>
  );
}
