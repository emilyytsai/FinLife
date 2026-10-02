"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { EventIcon } from "@/components/EventIcon";
import { HealthHighlights } from "@/components/HealthCheck";
import { Pictogram } from "@/components/Pictogram";
import { ShareButton } from "@/components/ShareButton";
import { money } from "@/lib/format";
import { signedMoney, storyDetail, storyTitle } from "@/lib/story";
import type { ChatEntry } from "@/lib/useFinLife";
import type { Analysis, Compare, LifeEvent, Profile, ShareRequest, YearRow } from "@/lib/types";

const STATUS_NOTES: Partial<Record<NonNullable<ChatEntry["status"]>, string>> = {
  stub: "Demo reply. The AI coach isn't connected.",
  blocked: "This reply was adjusted to stay within our guidelines.",
};

interface InsightsPanelProps {
  profile: Profile | null;
  events: LifeEvent[];
  compare: Compare | null;
  analysis: Analysis | null;
  impacts: Record<string, Compare>;
  messages: ChatEntry[];
  chatPending: boolean;
  focusAge: number | null;
  onFocusAge: (age: number | null) => void;
  shareRequest: ShareRequest | null;
  shareDisabled: boolean;
}

function rowAt(rows: YearRow[], age: number): YearRow | undefined {
  return rows.find((row) => row.age === age);
}

/** Right column: the big picture, the coach's latest reply, and the life story as cards that follow the chart hover. */
export function InsightsPanel(props: InsightsPanelProps) {
  const { profile, events, compare, analysis, focusAge, shareRequest, shareDisabled } = props;
  return (
    <section
      aria-labelledby="insights-heading"
      className="flex flex-col gap-4 rounded-card bg-surface p-4 shadow-soft lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
    >
      <h2 id="insights-heading" className="font-semibold">
        Insights
      </h2>
      <BigPicture profile={profile} events={events} compare={compare} analysis={analysis} />
      <CoachCard messages={props.messages} pending={props.chatPending} />
      {profile && compare && (
        <StoryStack
          profile={profile}
          events={events}
          compare={compare}
          impacts={props.impacts}
          focusAge={focusAge}
          onFocusAge={props.onFocusAge}
        />
      )}
      {shareRequest && <ShareButton request={shareRequest} disabled={shareDisabled} />}
    </section>
  );
}

function BigPicture({ profile, events, compare, analysis }: Pick<InsightsPanelProps, "profile" | "events" | "compare" | "analysis">) {
  if (!profile || !compare) return <p className="text-sm text-muted">Your numbers appear here.</p>;
  return (
    <div className="space-y-3 rounded-xl bg-canvas p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">The big picture</p>
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <Stat label={`Net worth at ${profile.retire_age}`} value={money(compare.baseline.summary.net_worth_at_retire)} />
        {events.length > 0 && (
          <Stat
            label="With your changes"
            value={money(compare.scenario.summary.net_worth_at_retire)}
            note={signedMoney(compare.diff.net_worth_at_retire)}
            tone={compare.diff.net_worth_at_retire < 0 ? "alert" : "good"}
          />
        )}
      </dl>
      {analysis && <HealthHighlights analysis={analysis} />}
    </div>
  );
}

function CoachCard({ messages, pending }: { messages: ChatEntry[]; pending: boolean }) {
  const lastReplyIndex = messages.findLastIndex((m) => m.role === "assistant");
  const reply = lastReplyIndex >= 0 ? messages[lastReplyIndex] : null;
  const question = lastReplyIndex > 0 ? messages[lastReplyIndex - 1] : null;
  const earlier = lastReplyIndex > 1 ? messages.slice(0, lastReplyIndex - 1) : [];
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
        <MessageCircle size={14} aria-hidden="true" />
        Coach
      </p>
      {!reply && !pending && (
        <p className="mt-2 text-sm text-muted">Ask a &ldquo;what if&rdquo; under the chart. The coach runs the numbers and explains what changes.</p>
      )}
      {question && <p className="mt-2 text-xs text-muted">You asked: {question.content}</p>}
      {reply && <p className="mt-1 whitespace-pre-wrap text-sm">{reply.content}</p>}
      {reply?.status && STATUS_NOTES[reply.status] && <p className="mt-1 text-xs text-muted">{STATUS_NOTES[reply.status]}</p>}
      {pending && <p className="mt-2 animate-pulse text-sm text-muted">Running the numbers...</p>}
      {earlier.length > 0 && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-primary">Earlier conversation ({earlier.length})</summary>
          <ul className="mt-2 space-y-2">
            {earlier.map((message, index) => (
              <li key={index} className={message.role === "user" ? "text-muted" : ""}>
                {message.role === "user" ? "You: " : "Coach: "}
                {message.content}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface Milestone {
  key: string;
  age: number;
  icon: ReactNode;
  title: string;
  detail: string;
  stats: { label: string; value: string; tone?: "good" | "alert" }[];
  flags: string[];
}

function buildMilestones(profile: Profile, events: LifeEvent[], compare: Compare, impacts: Record<string, Compare>): Milestone[] {
  const hasScenario = events.length > 0;
  const flagsAt = (age: number) =>
    (hasScenario ? compare.scenario.flags : compare.baseline.flags).filter((f) => f.age === age).map((f) => f.message);
  const today = rowAt(compare.baseline.years, profile.age);
  const end = hasScenario ? compare.scenario.summary : compare.baseline.summary;

  const start: Milestone = {
    key: "today",
    age: profile.age,
    icon: <Pictogram name="user" size={32} />,
    title: `Today, at ${profile.age}`,
    detail: `You earn ${money(profile.income)} a year and have ${money(profile.cash)} in cash.`,
    stats: today ? [{ label: "Net worth now", value: money(today.net_worth) }] : [],
    flags: flagsAt(profile.age),
  };

  const middle: Milestone[] = [...events]
    .sort((a, b) => a.age - b.age)
    .map((event) => {
      const impact = event.id ? impacts[event.id] : undefined;
      return {
        key: event.id ?? `${event.type}-${event.age}`,
        age: event.age,
        icon: <EventIcon event={event} size={32} />,
        title: storyTitle(event),
        detail: storyDetail(event),
        stats: impact
          ? [
              {
                label: `Net worth at ${profile.retire_age}, on its own`,
                value: signedMoney(impact.diff.net_worth_at_retire),
                tone: impact.diff.net_worth_at_retire < 0 ? "alert" : "good",
              },
              { label: "Lowest cash, on its own", value: `${money(impact.scenario.summary.min_cash)} at ${impact.scenario.summary.min_cash_age}` },
            ]
          : [{ label: "Impact", value: "Working it out..." }],
        flags: flagsAt(event.age),
      };
    });

  const retire: Milestone = {
    key: "retire",
    age: profile.retire_age,
    icon: <Pictogram name="palm" size={32} />,
    title: `Retire at ${profile.retire_age}`,
    detail: hasScenario ? "Where all your what-ifs add up." : "Where today's path leads.",
    stats: [
      { label: "Net worth", value: money(end.net_worth_at_retire) },
      { label: "401(k)", value: money(end.retirement_at_retire) },
    ],
    flags: flagsAt(profile.retire_age),
  };

  return [start, ...middle, retire];
}

function StoryStack(props: {
  profile: Profile;
  events: LifeEvent[];
  compare: Compare;
  impacts: Record<string, Compare>;
  focusAge: number | null;
  onFocusAge: (age: number | null) => void;
}) {
  const milestones = buildMilestones(props.profile, props.events, props.compare, props.impacts);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Your timeline</p>
      <ol className="relative mt-2 space-y-2 before:absolute before:bottom-4 before:left-[27px] before:top-4 before:w-0.5 before:bg-line">
        {milestones.map((milestone) => (
          <MilestoneCard
            key={milestone.key}
            milestone={milestone}
            active={props.focusAge === milestone.age}
            onFocusAge={props.onFocusAge}
          />
        ))}
      </ol>
    </div>
  );
}

function MilestoneCard({ milestone, active, onFocusAge }: { milestone: Milestone; active: boolean; onFocusAge: (age: number | null) => void }) {
  const ref = useRef<HTMLLIElement>(null);

  // Follow the chart: bring the active card into view inside the panel on wide screens.
  useEffect(() => {
    if (active && window.matchMedia("(min-width: 1024px)").matches) {
      ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [active]);

  return (
    <li
      ref={ref}
      tabIndex={0}
      onMouseEnter={() => onFocusAge(milestone.age)}
      onMouseLeave={() => onFocusAge(null)}
      onFocus={() => onFocusAge(milestone.age)}
      onBlur={() => onFocusAge(null)}
      className={`relative flex gap-3 rounded-xl border p-2.5 outline-none transition-colors ${
        active ? "border-accent bg-accent/10" : "border-line bg-surface"
      }`}
    >
      <span className="relative z-10 flex size-10 shrink-0 items-center justify-center rounded-lg bg-surface text-ink">
        {milestone.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">{milestone.title}</p>
          <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-xs font-semibold text-muted">{milestone.age}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted">{milestone.detail}</p>
        {milestone.stats.length > 0 && (
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            {milestone.stats.map((stat) => (
              <Stat key={stat.label} label={stat.label} value={stat.value} tone={stat.tone} />
            ))}
          </dl>
        )}
        {milestone.flags.map((flag) => (
          <p key={flag} className="mt-2 rounded-lg bg-alert/10 px-2 py-1 text-xs font-medium text-alert">
            {flag}
          </p>
        ))}
      </div>
    </li>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "alert" }) {
  const toneClass = tone === "alert" ? "text-alert" : tone === "good" ? "text-good" : "";
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`font-semibold ${note ? "" : toneClass}`}>
        {value}
        {note && <span className={`ml-1 text-xs ${toneClass}`}>({note})</span>}
      </dd>
    </div>
  );
}
