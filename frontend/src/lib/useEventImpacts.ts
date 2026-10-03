"use client";

import { useEffect, useRef, useState } from "react";
import { compare } from "./api";
import type { Compare, LifeEvent, Profile } from "./types";

const DELAY_MS = 400;

function impactKey(profile: Profile, event: LifeEvent): string {
  // The id is left out (JSON.stringify drops undefined), so the same event under a new id reuses the result.
  return JSON.stringify([profile, { ...event, id: undefined }]);
}

/**
 * Each event's effect on its own: the engine's compare(profile, [event]). Keyed by event id.
 * Results are cached by (profile, event), so editing one event doesn't refetch the others.
 * A failed request just leaves that card without impact numbers.
 */
export function useEventImpacts(profile: Profile | null, events: LifeEvent[]): Record<string, Compare> {
  const [cache, setCache] = useState<Record<string, Compare>>({});
  const inFlight = useRef(new Set<string>());

  useEffect(() => {
    if (!profile || events.length === 0) return;
    const timer = setTimeout(() => {
      for (const event of events) {
        const key = impactKey(profile, event);
        if (cache[key] || inFlight.current.has(key)) continue;
        inFlight.current.add(key);
        compare(profile, [event])
          .then((result) => setCache((prev) => ({ ...prev, [key]: result })))
          .catch(() => undefined)
          .finally(() => inFlight.current.delete(key));
      }
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [profile, events, cache]);

  const impacts: Record<string, Compare> = {};
  if (profile) {
    for (const event of events) {
      const found = cache[impactKey(profile, event)];
      if (found && event.id) impacts[event.id] = found;
    }
  }
  return impacts;
}
