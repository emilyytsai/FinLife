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

/** Picks the age the Time Travel panel shows: a slider with an age scale and a marker at each what-if. */
export function AgePicker({ startAge, endAge, age, events, onChange, pending = false, trailing }: AgePickerProps) {
  const span = Math.max(endAge - startAge, 1);
  const at = (a: number) => `calc(${THUMB_HALF}px + (100% - ${THUMB_HALF * 2}px) * ${(a - startAge) / span})`;
  // The ends, plus every fifth age that isn't crowding an end label.
  const ticks = Array.from({ length: endAge - startAge + 1 }, (_, i) => startAge + i).filter(
    (a) => a === startAge || a === endAge || (a % 5 === 0 && a - startAge >= 4 && endAge - a >= 4),
  );

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
                onClick={() => onChange(event.age)}
                aria-label={`Go to age ${event.age}: ${eventLabel(event)}`}
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
            Age
          </label>
          <input
            id="age-picker"
            type="range"
            min={startAge}
            max={endAge}
            step={1}
            value={age}
            onChange={(event) => onChange(Number(event.target.value))}
            className="age-range"
          />

          <div className="relative mt-1 h-4 text-xs tabular-nums text-muted" aria-hidden="true">
            {ticks.map((a) => (
              <span key={a} className="absolute -translate-x-1/2" style={{ left: at(a) }}>
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>
      {trailing && <div className="md:w-80 md:shrink-0 md:border-l md:border-line md:pl-6">{trailing}</div>}
    </section>
  );
}
