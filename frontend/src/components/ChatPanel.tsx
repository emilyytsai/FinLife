"use client";

import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { EventChips } from "@/components/EventChips";
import { ShareButton } from "@/components/ShareButton";
import type { ChatEntry } from "@/lib/useFinLife";
import type { LifeEvent, ShareRequest } from "@/lib/types";

const STATUS_NOTES: Partial<Record<NonNullable<ChatEntry["status"]>, string>> = {
  stub: "Demo reply. The AI coach isn't connected.",
  blocked: "This reply was adjusted to stay within our guidelines.",
};

interface ChatPanelProps {
  messages: ChatEntry[];
  pending: boolean;
  disabled: boolean;
  suggestions: string[];
  events: LifeEvent[];
  shareRequest: ShareRequest | null;
  onSend: (text: string) => Promise<boolean>;
  onRemoveEvent: (event: LifeEvent) => void;
}

export function ChatPanel({ messages, pending, disabled, suggestions, events, shareRequest, onSend, onRemoveEvent }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages.length, pending]);

  async function send(text: string) {
    setDraft("");
    const sent = await onSend(text);
    if (!sent) setDraft(text);
  }

  const busy = pending || disabled;

  return (
    <section className="flex flex-col rounded-card bg-surface p-4 shadow-soft lg:h-[calc(100vh-7rem)]" aria-labelledby="chat-heading">
      <h2 id="chat-heading" className="flex items-center gap-2 font-semibold">
        <Sparkles size={16} className="text-accent" aria-hidden="true" />
        Ask &ldquo;what if&rdquo;
      </h2>

      <div className="mt-3 min-h-48 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {messages.length === 0 && (
          <p className="text-sm text-muted">
            Ask about a choice you&rsquo;re weighing, like buying a home or changing your 401(k). The coach runs the
            numbers and explains what changes.
          </p>
        )}
        {messages.map((message, index) => (
          <div key={index} className={message.role === "user" ? "flex justify-end" : ""}>
            <div
              className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                message.role === "user" ? "bg-primary text-white" : "bg-canvas"
              }`}
            >
              {message.content}
            </div>
            {message.status && STATUS_NOTES[message.status] && (
              <p className="mt-1 text-xs text-muted">{STATUS_NOTES[message.status]}</p>
            )}
          </div>
        ))}
        {pending && <p className="animate-pulse text-sm text-muted">Running the numbers...</p>}
        <div ref={endRef} />
      </div>

      {events.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <EventChips events={events} onRemove={busy ? undefined : onRemoveEvent} />
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={busy}
              onClick={() => send(prompt)}
              className="rounded-full border border-line px-3 py-1 text-left text-sm hover:border-primary hover:text-primary disabled:opacity-50"
            >
              {prompt}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (draft.trim()) send(draft);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Your question
        </label>
        <input
          id="chat-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="What if I..."
          maxLength={500}
          className="min-w-0 flex-1 rounded-full border border-line px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          aria-label="Send"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-white disabled:opacity-50"
        >
          <Send size={16} aria-hidden="true" />
        </button>
      </form>

      {shareRequest && (
        <div className="mt-3 border-t border-line pt-3">
          <ShareButton request={shareRequest} disabled={busy || messages.length === 0} />
        </div>
      )}
    </section>
  );
}
