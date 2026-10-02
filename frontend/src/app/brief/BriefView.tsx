"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { TimelineChart } from "@/components/TimelineChart";
import { ApiError, getBrief } from "@/lib/api";
import { withIds } from "@/lib/events";
import type { Brief } from "@/lib/types";

type BriefState = { status: "loading" } | { status: "ok"; brief: Brief } | { status: "error"; message: string };

function errorMessage(error: unknown): string {
  if (error instanceof ApiError && error.status === 404) return "This brief wasn't found. Links expire after 30 days.";
  if (error instanceof ApiError) return error.message;
  return "Couldn't load the brief. Try again.";
}

function useBrief(id: string): BriefState {
  const [state, setState] = useState<BriefState>({ status: "loading" });
  useEffect(() => {
    if (!id) return;
    let active = true;
    getBrief(id)
      .then((brief) => active && setState({ status: "ok", brief }))
      .catch((error: unknown) => active && setState({ status: "error", message: errorMessage(error) }));
    return () => {
      active = false;
    };
  }, [id]);
  return id ? state : { status: "error", message: "This link is missing its brief id. Ask the client to share it again." };
}

export function BriefView() {
  const id = useSearchParams().get("id") ?? "";
  const state = useBrief(id);

  if (state.status === "loading") return <p className="p-8 text-sm text-muted">Loading brief...</p>;
  if (state.status === "error") {
    return (
      <main className="mx-auto w-full max-w-3xl p-8">
        <p role="alert" className="rounded-card bg-surface p-5 text-alert shadow-soft">
          {state.message}
        </p>
      </main>
    );
  }
  return <BriefContent brief={state.brief} />;
}

function BriefContent({ brief }: { brief: Brief }) {
  // Events from the API may arrive without ids; the chart keys its icons by id.
  const events = useMemo(() => withIds(brief.events), [brief.events]);
  const created = new Date(brief.created_at).toLocaleDateString(undefined, { dateStyle: "long" });

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-8 print:max-w-none print:space-y-4 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Advisor brief</h1>
          <p className="mt-1 text-sm text-muted">
            Created {created} · Client-entered, not verified
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-full border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/5 print:hidden"
        >
          <Printer size={16} aria-hidden="true" />
          Print
        </button>
      </header>

      <div className="break-inside-avoid">
        <TimelineChart profile={brief.profile} events={events} compare={brief.compare} scenarioLabel="With their changes" />
      </div>

      <div className="grid gap-6 sm:grid-cols-2 print:grid-cols-2 print:gap-4">
        <Section title="Goals">
          <BulletList items={brief.goals} empty="No goals added." />
        </Section>
        <Section title="What they tried">
          <BulletList items={brief.tried} empty="Nothing else tried." />
        </Section>
      </div>

      <Section title="Where trouble starts">
        {brief.risks.length === 0 ? (
          <p className="text-sm text-muted">No trouble spots found.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {brief.risks.map((risk, index) => (
              <li key={index} className="flex gap-3">
                <span className="shrink-0 rounded-full bg-alert/10 px-2 py-0.5 text-xs font-semibold text-alert">
                  Age {risk.age}
                </span>
                <span>{risk.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Questions for the first meeting">
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          {brief.questions.map((question, index) => (
            <li key={index}>{question}</li>
          ))}
        </ol>
      </Section>

      <footer className="border-t border-line pt-4 text-xs text-muted">{brief.disclaimer}</footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid rounded-card bg-surface p-5 shadow-soft">
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
