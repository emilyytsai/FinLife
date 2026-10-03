"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, MousePointer2 } from "lucide-react";
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

/** Direction only, compared with the year before. The values themselves are the engine's. */
function trend(rows: YearRow[], age: number, key: "net_worth" | "cash" | "retirement"): Trend {
  const now = rows.find((row) => row.age === age);
  const before = rows.find((row) => row.age === age - 1);
  if (!now || !before || now[key] === before[key]) return null;
  return now[key] > before[key] ? "up" : "down";
}

/** The user's life at one age: big numbers plus a row of pictograms that animate as life changes. */
export function LifeInIcons({ profile, events, compare, focusAge, freshIds }: LifeInIconsProps) {
  const hasScenario = events.length > 0;
  const rows = hasScenario ? compare.scenario.years : compare.baseline.years;
  const first = rows[0]?.age ?? profile.age;
  const last = rows[rows.length - 1]?.age ?? profile.retire_age;
  // Not hovering: show where the what-ifs lead (the latest event's age), or today with none.
  const latestEvent = events.reduce((max, event) => Math.max(max, event.age), profile.age);
  const age = Math.min(Math.max(focusAge ?? (hasScenario ? latestEvent : profile.age), first), last);
  const row = rows.find((r) => r.age === age);
  const groups = lifeAt(profile, events, age, row);
  const flags = (hasScenario ? compare.scenario.flags : compare.baseline.flags).filter((flag) => flag.age === age);

  const heading =
    focusAge !== null ? `At age ${age}` : hasScenario ? `With your what-ifs, by ${age}` : `Today, age ${age}`;

  return (
    <MotionConfig reducedMotion="user">
      <section aria-labelledby="life-heading" className="rounded-card bg-surface p-4 shadow-soft sm:p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="life-heading" className="text-xs font-bold uppercase tracking-widest text-muted" aria-live="polite">
            {heading}
          </h2>
          <p className="hidden items-center gap-1 text-xs text-muted sm:flex">
            <MousePointer2 size={12} aria-hidden="true" />
            Hover the chart to travel through time
          </p>
        </div>

        {row && (
          <dl className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
            <Metric label="Net worth" value={money(row.net_worth)} trend={trend(rows, age, "net_worth")} large />
            <Metric label="Cash" value={money(row.cash)} trend={trend(rows, age, "cash")} />
            <Metric label="401(k)" value={money(row.retirement)} trend={trend(rows, age, "retirement")} />
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
                <motion.span layout="position" className="text-xs font-semibold text-ink">
                  {group.caption}
                </motion.span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>

        {flags.map((flag) => (
          <p key={flag.code} className="mt-4 rounded-lg bg-alert/10 px-3 py-1.5 text-sm font-medium text-alert">
            {flag.message}
          </p>
        ))}
      </section>
    </MotionConfig>
  );
}

function Figure({ figure, fresh }: { figure: LifeFigure; fresh: boolean }) {
  const size = figure.name === "child" ? 40 : 48;
  return (
    <motion.span
      layout
      className="relative inline-flex text-ink"
      initial={{ y: -36, scale: 0.4, opacity: 0 }}
      animate={{ y: 0, scale: 1, opacity: figure.muted ? 0.3 : 1 }}
      exit={{ scale: 0.4, opacity: 0, transition: { duration: 0.15 } }}
      transition={{ type: "spring", stiffness: 520, damping: 20 }}
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
      <Pictogram name={figure.name} slash={figure.slash} size={size} />
    </motion.span>
  );
}

function Metric({ label, value, trend, large = false }: { label: string; value: string; trend: Trend; large?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-widest text-muted">{label}</dt>
      <dd className="flex items-center gap-1">
        <span className={`font-bold tabular-nums ${large ? "text-4xl sm:text-5xl" : "text-2xl"}`}>{value}</span>
        {trend === "up" && <ArrowUpRight className="text-good" size={large ? 28 : 20} aria-label="up from the year before" />}
        {trend === "down" && <ArrowDownRight className="text-alert" size={large ? 28 : 20} aria-label="down from the year before" />}
      </dd>
    </div>
  );
}
