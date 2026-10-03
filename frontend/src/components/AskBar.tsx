"use client";

import { useState, type ReactNode } from "react";
import { Send } from "lucide-react";
import { EventChips } from "@/components/EventChips";
import type { LifeEvent } from "@/lib/types";

interface AskInputProps {
  pending: boolean;
  disabled: boolean;
  onSend: (text: string) => Promise<boolean>;
}

/**
 * The "what if" question box and send button. Answers show up as changes to the numbers and the scene, never as
 * reply text. A question that fails to send is put back in the box.
 */
export function AskInput({ pending, disabled, onSend }: AskInputProps) {
  const [draft, setDraft] = useState("");
  const busy = pending || disabled;

  async function send(text: string) {
    setDraft("");
    const sent = await onSend(text);
    if (!sent) setDraft(text);
  }

  return (
    <form
      className="flex gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (draft.trim()) send(draft);
      }}
    >
      <label htmlFor="ask-input" className="sr-only">
        Ask what if
      </label>
      <input
        id="ask-input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={pending ? "Running the numbers..." : "What if I buy a house at 30?"}
        maxLength={500}
        className={`min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 ${
          pending ? "animate-pulse" : ""
        }`}
      />
      <button
        type="submit"
        disabled={busy || !draft.trim()}
        aria-label="Ask"
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-canvas disabled:opacity-40"
      >
        <Send size={16} aria-hidden="true" />
      </button>
    </form>
  );
}

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

/** Everything around the question box: suggested questions, the active what-ifs, and the footer. */
export function AskBar({ pending, disabled, suggestions, events, noChange, onSend, onRemoveEvent, footer }: AskBarProps) {
  const busy = pending || disabled;

  return (
    <section className="space-y-3 rounded-card bg-surface p-4 shadow-soft sm:p-5" aria-label="Your what-ifs">
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
              onClick={() => onSend(prompt)}
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
