"use client";

import { useState, type ReactNode } from "react";
import { TreePalm, User } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EventIcon } from "@/components/EventIcon";
import { EventMarker, type MarkerHover, type MarkerTone } from "@/components/EventMarker";
import { eventShortLabel, eventTooltip } from "@/lib/eventMeta";
import { money } from "@/lib/format";
import { useIsPhone } from "@/lib/useIsPhone";
import type { Compare, Flag, LifeEvent, Profile, YearRow } from "@/lib/types";

type Metric = "net_worth" | "cash";

const METRICS: { value: Metric; label: string }[] = [
  { value: "net_worth", label: "Net worth" },
  { value: "cash", label: "Cash" },
];

/** How long each line takes to draw. Event badges are timed against it. */
const LINE_MS = 1500;
/** Desktop badge diameter and a rough 11px label character width, for label collision checks. */
const BADGE_PX = 22;
const LABEL_CHAR_PX = 6.5;

interface TimelineChartProps {
  profile: Profile;
  events: LifeEvent[];
  compare: Compare;
}

interface Point {
  age: number;
  baseline: number;
  scenario?: number;
}

interface MarkerSpec {
  key: string;
  age: number;
  y: number;
  tone: MarkerTone;
  label: string;
  tooltip: string;
  icon: (size: number) => ReactNode;
  stackIndex: number;
}

function valueByAge(rows: YearRow[], metric: Metric): Map<number, number> {
  return new Map(rows.map((row) => [row.age, row[metric]]));
}

/** Consecutive flagged ages merged into [start, end] spans for shading. */
function flagSpans(flags: Flag[]): [number, number][] {
  const ages = [...new Set(flags.map((flag) => flag.age))].sort((a, b) => a - b);
  const spans: [number, number][] = [];
  for (const age of ages) {
    const last = spans[spans.length - 1];
    if (last && age === last[1] + 1) last[1] = age;
    else spans.push([age, age]);
  }
  return spans;
}

function buildMarkers(profile: Profile, events: LifeEvent[], baseline: Map<number, number>, scenario: Map<number, number>): MarkerSpec[] {
  const stackCount = new Map<number, number>();
  const nextIndex = (age: number) => {
    const index = stackCount.get(age) ?? 0;
    stackCount.set(age, index + 1);
    return index;
  };
  const markers: MarkerSpec[] = [];

  const startY = baseline.get(profile.age);
  if (startY !== undefined) {
    markers.push({
      key: "profile-start",
      age: profile.age,
      y: startY,
      tone: "profile",
      label: `You, ${profile.age}`,
      tooltip: `You today, age ${profile.age}`,
      icon: (size) => <User size={size} aria-hidden="true" focusable="false" />,
      stackIndex: nextIndex(profile.age),
    });
  }

  for (const event of events) {
    const y = scenario.get(event.age);
    if (y === undefined) continue;
    markers.push({
      key: event.id ?? `${event.type}-${event.age}`,
      age: event.age,
      y,
      tone: "event",
      label: eventShortLabel(event),
      tooltip: eventTooltip(event),
      icon: (size) => <EventIcon event={event} size={size} />,
      stackIndex: nextIndex(event.age),
    });
  }

  const retireY = baseline.get(profile.retire_age);
  if (retireY !== undefined) {
    markers.push({
      key: "profile-retire",
      age: profile.retire_age,
      y: retireY,
      tone: "profile",
      label: `Retire, ${profile.retire_age}`,
      tooltip: `Retire at ${profile.retire_age}`,
      icon: (size) => <TreePalm size={size} aria-hidden="true" focusable="false" />,
      stackIndex: nextIndex(profile.retire_age),
    });
  }
  return markers;
}

/**
 * Keys of markers whose label fits before the next badge in the same stack row.
 * Labels go right of the badge, except at endAge where they go left.
 */
function labelsThatFit(markers: MarkerSpec[], pxPerYear: number, endAge: number): Set<string> {
  const fits = new Set<string>();
  if (pxPerYear <= 0) return fits;
  for (const marker of markers) {
    const needYears = (BADGE_PX + 8 + marker.label.length * LABEL_CHAR_PX) / pxPerYear;
    const direction = marker.age === endAge ? -1 : 1;
    const blocked = markers.some((other) => {
      if (other === marker || other.stackIndex !== marker.stackIndex) return false;
      const gap = (other.age - marker.age) * direction;
      return gap > 0 && gap < needYears;
    });
    if (!blocked) fits.add(marker.key);
  }
  return fits;
}

export function TimelineChart({ profile, events, compare }: TimelineChartProps) {
  const [metric, setMetric] = useState<Metric>("net_worth");
  const [hover, setHover] = useState<MarkerHover | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const compact = useIsPhone();
  const margin = { top: 56, right: compact ? 12 : 48, bottom: 4, left: 0 };
  const yAxisWidth = compact ? 48 : 60;

  const { baseline, scenario, diff } = compare;
  const hasScenario = events.length > 0;
  const baselineValues = valueByAge(baseline.years, metric);
  const scenarioValues = valueByAge(scenario.years, metric);
  const data: Point[] = baseline.years.map((row) => ({
    age: row.age,
    baseline: row[metric],
    scenario: hasScenario ? scenarioValues.get(row.age) : undefined,
  }));
  if (data.length === 0) return null;

  const startAge = data[0].age;
  const endAge = data[data.length - 1].age;
  const delayFor = (age: number) => ((LINE_MS / 1000) * (age - startAge)) / Math.max(endAge - startAge, 1);
  const markers = buildMarkers(profile, events, baselineValues, scenarioValues);
  const pxPerYear = (chartWidth - yAxisWidth - margin.left - margin.right) / Math.max(endAge - startAge, 1);
  const labeled = compact ? new Set<string>() : labelsThatFit(markers, pxPerYear, endAge);
  const spans = flagSpans(hasScenario ? scenario.flags : baseline.flags);
  // A new key remounts the scenario line so it redraws left to right after each change.
  const scenarioKey = JSON.stringify(events);

  return (
    <section className="rounded-card bg-surface p-4 shadow-soft sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div>
            <dt className="text-muted">Net worth at {profile.retire_age}</dt>
            <dd className="text-lg font-semibold">{money(baseline.summary.net_worth_at_retire)}</dd>
          </div>
          {hasScenario && (
            <div>
              <dt className="text-muted">With your changes</dt>
              <dd className="text-lg font-semibold">
                {money(scenario.summary.net_worth_at_retire)}{" "}
                <span className={`text-sm ${diff.net_worth_at_retire < 0 ? "text-alert" : "text-good"}`}>
                  ({diff.net_worth_at_retire >= 0 ? "+" : ""}
                  {money(diff.net_worth_at_retire)})
                </span>
              </dd>
            </div>
          )}
        </dl>
        <div role="radiogroup" aria-label="Chart metric" className="flex rounded-full print:hidden border border-line p-0.5 text-sm">
          {METRICS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={metric === option.value}
              onClick={() => setMetric(option.value)}
              className={`rounded-full px-3 py-1 ${metric === option.value ? "bg-primary text-white" : "text-muted"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-4 h-72 sm:h-96">
        <ResponsiveContainer width="100%" height="100%" onResize={(width) => setChartWidth(width)}>
          <LineChart data={data} margin={margin}>
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="age" type="number" domain={[startAge, endAge]} allowDecimals={false} tickLine={false} stroke="var(--muted)" />
            <YAxis tickFormatter={money} width={yAxisWidth} tickLine={false} axisLine={false} stroke="var(--muted)" />
            <Tooltip
              active={hover ? false : undefined}
              formatter={(value, name) => [money(Number(value)), name === "baseline" ? "Today's path" : "With your changes"]}
              labelFormatter={(age) => `Age ${age}`}
            />
            {spans.map(([from, to]) => (
              <ReferenceArea key={`flag-${from}`} x1={from} x2={Math.min(to + 1, endAge)} fill="var(--alert)" fillOpacity={0.08} ifOverflow="hidden" />
            ))}
            {hasScenario &&
              events.map((event) => (
                <ReferenceLine key={`line-${event.id ?? event.age}`} x={event.age} stroke="var(--accent)" strokeOpacity={0.35} strokeDasharray="2 4" />
              ))}
            <Line dataKey="baseline" stroke="var(--primary)" strokeWidth={2.5} dot={false} animationDuration={LINE_MS} />
            {hasScenario && (
              <Line
                key={scenarioKey}
                dataKey="scenario"
                stroke="var(--accent)"
                strokeWidth={2.5}
                strokeDasharray="6 4"
                dot={false}
                animationDuration={LINE_MS}
              />
            )}
            {markers.map((marker) => (
              <ReferenceDot
                key={marker.key}
                x={marker.age}
                y={marker.y}
                ifOverflow="visible"
                shape={(props) => (
                  <EventMarker
                    cx={props.cx}
                    cy={props.cy}
                    icon={marker.icon}
                    tone={marker.tone}
                    label={marker.label}
                    tooltip={marker.tooltip}
                    stackIndex={marker.stackIndex}
                    delay={delayFor(marker.age)}
                    compact={compact}
                    showLabel={labeled.has(marker.key)}
                    labelLeft={marker.age === endAge}
                    onHover={setHover}
                  />
                )}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        {hover && (
          <div
            role="tooltip"
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink px-2.5 py-1.5 text-xs font-medium text-white shadow-soft"
            style={{ left: hover.x, top: hover.y - 6 }}
          >
            {hover.text}
          </div>
        )}
      </div>
    </section>
  );
}
