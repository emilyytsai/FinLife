"use client";

import { useState, type ReactNode } from "react";
import { Send, Sparkles } from "lucide-react";
import { EventChips } from "@/components/EventChips";
import type { LifeEvent } from "@/lib/types";

interface AskBarProps {
  pending: boolean;
  disabled: boolean;
  suggestions: string[];
  events: LifeEvent[];
  /** The last question didn't change the timeline. */
  noChange: boolean;
  onSend: (text: string) => Promise<boolean>;
  onRemoveEvent: (event: LifeEvent) => void;
  /** Shown at the bottom, e.g. the share button. */
  footer?: ReactNode;
}

/**
 * "Ask what if" under the chart: the question box, suggestion chips, and the active what-ifs.
 * Answers show up as changes to the numbers, icons, and chart, never as reply text.
 */
export function AskBar({ pending, disabled, suggestions, events, noChange, onSend, onRemoveEvent, footer }: AskBarProps) {
  const [draft, setDraft] = useState("");
  const busy = pending || disabled;

  async function send(text: string) {
    setDraft("");
    const sent = await onSend(text);
    if (!sent) setDraft(text);
  }

  return (
    <section className="space-y-3 rounded-card bg-surface p-4 shadow-soft sm:p-5" aria-labelledby="ask-heading">
      <h2 id="ask-heading" className="flex items-center gap-2 font-semibold">
        <Sparkles size={16} className="text-accent" aria-hidden="true" />
        Ask &ldquo;what if&rdquo;
      </h2>

      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) send(draft);
        }}
      >
        <label htmlFor="ask-input" className="sr-only">
          Your question
        </label>
        <input
          id="ask-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="What if I buy a house at 30?"
          maxLength={500}
          className="min-w-0 flex-1 rounded-full border border-line px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Ask"
          className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-50"
        >
          <Send size={16} aria-hidden="true" />
        </button>
      </form>

      {pending && <p className="animate-pulse text-sm text-muted">Running the numbers...</p>}
      {noChange && !pending && (
        <p className="text-sm text-muted">No change to your timeline. Try a life event, like buying a home or a job change.</p>
      )}

      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={busy}
              onClick={() => send(prompt)}
              className="rounded-full border border-line px-3 py-1 text-left text-sm transition hover:-translate-y-0.5 hover:border-primary hover:text-primary hover:shadow-soft disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      {events.length > 0 && (
        <div className="border-t border-line pt-3">
          <EventChips events={events} onRemove={busy ? undefined : onRemoveEvent} />
        </div>
      )}

      {footer && <div className="border-t border-line pt-3">{footer}</div>}
    </section>
  );
}
