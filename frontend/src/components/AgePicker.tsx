"use client";

import type { ReactNode } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { EventIcon } from "@/components/EventIcon";
import { eventLabel } from "@/lib/eventMeta";
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
  const pick = (a: number) => onChange(Math.min(Math.max(a, scaleMin), scaleMax));

  return (
    <section
      aria-labelledby="age-heading"
      className="flex flex-col gap-3 rounded-card bg-surface px-5 py-3 shadow-soft sm:px-6 md:flex-row md:items-center md:gap-6"
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
            {events.map((event) => (
              <button
                key={event.id ?? `${event.type}-${event.age}`}
                type="button"
                onClick={() => pick(event.age)}
                aria-label={`Go to ${yearOf(event.age)}, age ${event.age}: ${eventLabel(event)}`}
                title={eventLabel(event)}
                className={`absolute bottom-0 -translate-x-1/2 rounded-md p-0.5 transition-opacity hover:opacity-100 ${
                  event.age <= age ? "text-ink" : "text-muted opacity-60"
                }`}
                style={{ left: at(event.age) }}
              >
                <EventIcon event={event} size={20} />
              </button>
            ))}
          </div>

          <label htmlFor="age-picker" className="sr-only">
            Year
          </label>
          <div className="relative">
            {/* The years with numbers, brighter than the dimmed ends of the track (the past, and any years past age 95). */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-white/45"
              style={{ left: at(startAge), right: `calc(100% - ${at(endAge)})` }}
            />
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
