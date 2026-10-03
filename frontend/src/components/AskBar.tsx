"use client";

import { useState, type ReactNode } from "react";
import { Send } from "lucide-react";
import { AnimatedPlaceholder } from "@/components/AnimatedPlaceholder";
import { EventChips } from "@/components/EventChips";
import type { LifeEvent } from "@/lib/types";

/** Example questions the empty box cycles through. Phrased as the user's own "What if I..." questions. */
const PLACEHOLDERS = [
  "What if I buy a house at 30?",
  "What if I have a child at 32?",
  "What if I buy a $35k car?",
  "What if I lose my job for 6 months?",
  "What if I raise my 401(k) to 10%?",
];
const RUNNING = ["Running the numbers..."];

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
  const [focused, setFocused] = useState(false);
  const busy = pending || disabled;
  // The cycling placeholder shows only while the box is empty and not focused; clicking in clears it at once.
  const showPlaceholder = draft === "" && !focused;

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
      <div className="relative min-w-0 flex-1">
        <input
          id="ask-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          maxLength={500}
          className="w-full rounded-full border border-line bg-transparent px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
        {showPlaceholder && (
          <AnimatedPlaceholder
            texts={pending ? RUNNING : PLACEHOLDERS}
            cycling={!pending}
            className={`absolute inset-y-0 left-4 right-4 flex items-center text-sm text-muted ${pending ? "animate-pulse" : ""}`}
          />
        )}
      </div>
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
