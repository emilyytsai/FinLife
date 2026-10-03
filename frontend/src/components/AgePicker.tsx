"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { EventIcon } from "@/components/EventIcon";
import { eventDetails, eventLabel } from "@/lib/eventMeta";
import type { LifeEvent } from "@/lib/types";

interface AgePickerProps {
  startAge: number;
  endAge: number;
  age: number;
  events: LifeEvent[];
  onChange: (age: number) => void;
  /** Shows a quiet "Updating..." while new numbers load. */
  pending?: boolean;
  /** Placed on the right of the card, e.g. the "what if" question box. */
  trailing?: ReactNode;
}

/** Half the slider thumb's width, so ticks and markers line up with the thumb's center at both ends. */
const THUMB_HALF = 9;
/** The scale shows calendar years: this many back and forward from this year. */
const YEARS_BACK = 10;
const YEARS_AHEAD = 60;
const LABEL_EVERY = 10;

/**
 * Picks the age the Time Travel panel shows. The scale is in calendar years (the user's current age is this year);
 * any year on the scale can be picked; the years the engine has numbers for (starting age to the plan end, age 95) are drawn brighter.
 */
export function AgePicker({ startAge, endAge, age, events, onChange, pending = false, trailing }: AgePickerProps) {
  const thisYear = new Date().getFullYear();
  const yearOf = (a: number) => thisYear + (a - startAge);
  const scaleMin = startAge - YEARS_BACK;
  const scaleMax = startAge + YEARS_AHEAD;
  const at = (a: number) => `calc(${THUMB_HALF}px + (100% - ${THUMB_HALF * 2}px) * ${(a - scaleMin) / (scaleMax - scaleMin)})`;
  // Labels: this year (always, in bold), then round decades that don't crowd it. Phones get every other decade.
  const ticks = [
    { a: startAge, narrow: true },
    ...Array.from({ length: YEARS_BACK + YEARS_AHEAD + 1 }, (_, i) => scaleMin + i)
      .filter((a) => yearOf(a) % LABEL_EVERY === 0 && Math.abs(a - startAge) >= 6)
      .map((a) => ({ a, narrow: yearOf(a) % (LABEL_EVERY * 2) === 0 && Math.abs(a - startAge) >= 9 })),
  ];
  // Everything drawn on the track is held to the scale, so nothing can spill past either end.
  const within = (a: number) => Math.min(Math.max(a, scaleMin), scaleMax);
  const pick = (a: number) => onChange(within(a));
  const markers = events.filter((event) => event.age >= scaleMin && event.age <= scaleMax);

  return (
    <section
      aria-labelledby="age-heading"
      className="glass flex flex-col gap-3 rounded-card px-5 py-3 sm:px-6 md:flex-row md:items-center md:gap-6"
    >
      {/* One row on wider screens, so the card stays short: the age and slider, then anything passed in on the right. */}

      <div className="flex min-w-0 flex-1 items-center gap-5 sm:gap-8">
        <div className="w-16 shrink-0">
          <h2 id="age-heading" className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">
            Age
          </h2>
          <p className="text-4xl font-light tabular-nums tracking-tight text-ink" aria-live="polite">
            <AnimatedNumber value={age} format={(v) => String(Math.round(v))} />
          </p>
          {pending && <p className="animate-pulse text-[11px] text-muted">Updating...</p>}
        </div>

        <div className="relative min-w-0 flex-1">
          {/* What-if markers above the track; each jumps to its age. */}
          <div className="relative h-6">
            {markers.map((event) => (
              <Marker
                key={event.id ?? `${event.type}-${event.age}`}
                event={event}
                year={yearOf(event.age)}
                reached={event.age <= age}
                left={at(event.age)}
                // Cards near either end of the track open inward so they stay on screen.
                align={
                  (event.age - scaleMin) / (scaleMax - scaleMin) < 0.2
                    ? "start"
                    : (event.age - scaleMin) / (scaleMax - scaleMin) > 0.8
                      ? "end"
                      : "center"
                }
                onPick={() => pick(event.age)}
              />
            ))}
          </div>

          <label htmlFor="age-picker" className="sr-only">
            Year
          </label>
          <div className="relative">
            {/* A clipped layer, bounded by the track: end caps at the first and last year, and the years with numbers
                drawn brighter than the dimmed past. */}
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <div
                className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-ink/45"
                style={{ left: at(within(startAge)), right: `calc(100% - ${at(within(endAge))})` }}
              />
              {[scaleMin, scaleMax].map((a) => (
                <div
                  key={a}
                  className="absolute top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-ink/35"
                  style={{ left: at(a) }}
                />
              ))}
            </div>
            <input
              id="age-picker"
              type="range"
              min={scaleMin}
              max={scaleMax}
              step={1}
              value={age}
              onChange={(event) => pick(Number(event.target.value))}
              aria-valuetext={`${yearOf(age)}, age ${age}`}
              className="age-range relative"
            />
          </div>

          <div className="relative mt-1 h-4 text-xs tabular-nums text-muted" aria-hidden="true">
            {ticks.map(({ a, narrow }) => (
              <span
                key={a}
                className={`absolute -translate-x-1/2 ${a === startAge ? "font-semibold text-ink" : ""} ${narrow ? "" : "hidden sm:inline"}`}
                style={{ left: at(a) }}
              >
                {yearOf(a)}
              </span>
            ))}
          </div>
        </div>
      </div>
      {trailing && <div className="md:w-80 md:shrink-0 md:border-l md:border-line md:pl-6">{trailing}</div>}
    </section>
  );
}

interface MarkerProps {
  event: LifeEvent;
  year: number;
  reached: boolean;
  left: string;
  align: "start" | "center" | "end";
  onPick: () => void;
}

/** A what-if's icon above the track. Hover or focus shows its specifics; a click jumps to its age. */
function Marker({ event, year, reached, left, align, onPick }: MarkerProps) {
  const [open, setOpen] = useState(false);
  const position = align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";
  return (
    <div
      className="absolute bottom-0 -translate-x-1/2"
      style={{ left }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={onPick}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        aria-label={`Go to ${year}, age ${event.age}: ${eventLabel(event)}`}
        className={`rounded-md p-0.5 transition-opacity hover:opacity-100 ${reached ? "text-ink" : "text-muted opacity-60"}`}
      >
        <EventIcon event={event} size={20} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            role="tooltip"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className={`pointer-events-none absolute bottom-full z-30 mb-2 w-60 rounded-xl border border-line bg-surface/90 p-3 text-sm shadow-2xl backdrop-blur-md ${position}`}
          >
            <p className="font-medium text-ink">{eventLabel(event)}</p>
            <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-muted">
              {year} &middot; age {event.age}
            </p>
            <dl className="mt-2 space-y-0.5 border-t border-line pt-2">
              {eventDetails(event).map((detail) => (
                <div key={detail.label} className="flex justify-between gap-3">
                  <dt className="text-muted">{detail.label}</dt>
                  <dd className="tabular-nums text-ink">{detail.value}</dd>
                </div>
              ))}
            </dl>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
