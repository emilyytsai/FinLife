"use client";

import { useRef, useState, type ReactNode } from "react";
import { Pictogram } from "@/components/Pictogram";
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
import { EventMarker, MARKER_PX, MARKER_STEM, type MarkerHover, type MarkerTone } from "@/components/EventMarker";
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
/** Rough width of one character of a 12px bold label, for label collision checks (labels show on desktop only). */
const LABEL_CHAR_PX = 7.2;
/** Half the width of a typical hover tooltip, used to keep it inside the chart. */
const TOOLTIP_HALF_PX = 80;

interface TimelineChartProps {
  profile: Profile;
  events: LifeEvent[];
  compare: Compare;
  /** Name for the dashed line. The advisor brief says "With their changes". */
  scenarioLabel?: string;
  /** Age highlighted from outside the chart (e.g. an Insights card), drawn as a guide line. */
  focusAge?: number | null;
  /** Called with the age under the pointer or a focused marker, and null when it leaves. */
  onFocusAge?: (age: number | null) => void;
  /** Net worth at retirement above the chart. Off on the main page, where other panels show it. */
  showSummary?: boolean;
  /** Tailwind height classes for the plot area. */
  plotHeight?: string;
  /**
   * Scrubber mode for the main page: a short chart that drives another panel. No y-axis, no value tooltip,
   * small markers, the focused age stays put when the pointer leaves, and a range slider for touch and keys.
   */
  scrubber?: boolean;
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
      icon: (size) => <Pictogram name="user" size={size} />,
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
      icon: (size) => <Pictogram name="palm" size={size} />,
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
    const needYears = (MARKER_PX.desktop + 8 + marker.label.length * LABEL_CHAR_PX) / pxPerYear;
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

export function TimelineChart({
  profile,
  events,
  compare,
  scenarioLabel = "With your changes",
  focusAge = null,
  onFocusAge,
  showSummary = true,
  plotHeight = "h-80 sm:h-[26rem]",
  scrubber = false,
}: TimelineChartProps) {
  const [metric, setMetric] = useState<Metric>("net_worth");
  const [hover, setHover] = useState<MarkerHover | null>(null);
  const [chartWidth, setChartWidth] = useState(0);
  const lastReported = useRef<number | null>(null);

  /** Tells the parent which age is under the pointer, only when it changes. */
  function reportAge(age: number | null) {
    if (!scrubber && age === lastReported.current) return;
    lastReported.current = age;
    onFocusAge?.(age);
  }
  const compact = useIsPhone() || scrubber;
  // Room above the plot for one pictogram plus its stem, and half a pictogram at each side so the
  // first and last markers clear the axis labels. Taller same-age stacks may rise into the header gap.
  const markerPx = compact ? MARKER_PX.phone : MARKER_PX.desktop;
  const margin = { top: MARKER_STEM + markerPx + 12, right: compact ? markerPx / 2 + 4 : 48, bottom: 4, left: markerPx / 2 - 4 };
  const yAxisWidth = scrubber ? 0 : compact ? 48 : 60;

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
        {scrubber ? (
          <p className="text-xs font-bold uppercase tracking-widest text-muted">Drag the timeline to travel through time</p>
        ) : showSummary ? (
          <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <div>
              <dt className="text-muted">Net worth at {profile.retire_age}</dt>
              <dd className="text-lg font-semibold">{money(baseline.summary.net_worth_at_retire)}</dd>
            </div>
            {hasScenario && (
              <div>
                <dt className="text-muted">{scenarioLabel}</dt>
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
        ) : (
          <h2 className="text-sm font-semibold text-muted">Your timeline</h2>
        )}
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

      <div className={`relative mt-4 ${plotHeight}`}>
        <ResponsiveContainer width="100%" height="100%" onResize={(width) => setChartWidth(width)}>
          <LineChart
            data={data}
            margin={margin}
            onMouseMove={(state) => reportAge(state.activeLabel === undefined ? null : Number(state.activeLabel))}
            onMouseLeave={() => !scrubber && reportAge(null)}
            className={scrubber ? "cursor-ew-resize" : undefined}
          >
            <CartesianGrid stroke="var(--line)" vertical={false} />
            <XAxis dataKey="age" type="number" domain={[startAge, endAge]} allowDecimals={false} tickLine={false} stroke="var(--muted)" />
            <YAxis hide={scrubber} tickFormatter={money} width={yAxisWidth} tickLine={false} axisLine={false} stroke="var(--muted)" />
            <Tooltip
              active={hover ? false : undefined}
              content={scrubber ? () => null : undefined}
              cursor={!scrubber}
              formatter={(value, name) => [money(Number(value)), name === "baseline" ? "Today's path" : scenarioLabel]}
              labelFormatter={(age) => `Age ${age}`}
            />
            {spans.map(([from, to]) => (
              <ReferenceArea key={`flag-${from}`} x1={from} x2={Math.min(to + 1, endAge)} fill="var(--alert)" fillOpacity={0.08} ifOverflow="hidden" />
            ))}
            {hasScenario &&
              events.map((event) => (
                <ReferenceLine key={`line-${event.id ?? event.age}`} x={event.age} stroke="var(--accent)" strokeOpacity={0.35} strokeDasharray="2 4" />
              ))}
            {focusAge !== null && focusAge >= startAge && focusAge <= endAge && (
              <ReferenceLine
                x={focusAge}
                stroke={scrubber ? "var(--primary)" : "var(--ink)"}
                strokeOpacity={scrubber ? 0.9 : 0.35}
                strokeWidth={scrubber ? 2.5 : 1.5}
              />
            )}
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
                    onHover={(next) => {
                      setHover(next);
                      reportAge(next ? marker.age : null);
                    }}
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
            // Keep the centered tooltip inside the chart so it never spills off a phone screen.
            style={{ left: Math.min(Math.max(hover.x, TOOLTIP_HALF_PX), Math.max(chartWidth - TOOLTIP_HALF_PX, TOOLTIP_HALF_PX)), top: hover.y - 6 }}
          >
            {hover.text}
          </div>
        )}
      </div>
      {scrubber && onFocusAge && (
        <div style={{ paddingLeft: margin.left, paddingRight: margin.right }}>
          <label htmlFor="age-scrubber" className="sr-only">
            Travel to age
          </label>
          <input
            id="age-scrubber"
            type="range"
            min={startAge}
            max={endAge}
            step={1}
            value={focusAge ?? startAge}
            onChange={(event) => reportAge(Number(event.target.value))}
            className="h-2 w-full cursor-pointer accent-[var(--primary)]"
          />
        </div>
      )}
    </section>
  );
}
