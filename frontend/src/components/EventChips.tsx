"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { EventIcon } from "@/components/EventIcon";
import { eventLabel } from "@/lib/eventMeta";
import type { LifeEvent } from "@/lib/types";

interface EventChipsProps {
  events: LifeEvent[];
  onRemove?: (event: LifeEvent) => void;
}

/** Active "what if" events as chips, each with the same icon as its chart badge. */
export function EventChips({ events, onRemove }: EventChipsProps) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Your what-ifs">
      <AnimatePresence initial={false}>
        {events.map((event) => (
          <motion.li
            key={event.id ?? `${event.type}-${event.age}`}
            layout
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.15 } }}
            className="flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 py-1 pl-2 pr-1 text-sm"
          >
            <EventIcon event={event} size={16} className="shrink-0 text-accent" />
            <span>{eventLabel(event)}</span>
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(event)}
                aria-label={`Remove: ${eventLabel(event)}`}
                className="rounded-full p-0.5 text-muted hover:bg-accent/20 hover:text-ink"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
