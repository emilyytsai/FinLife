import type { LifeEvent } from "./types";

/** Give every event a stable id (React keys, chips, undo). Events the API creates arrive without one. */
export function withIds(events: LifeEvent[]): LifeEvent[] {
  return events.map((event) => (event.id ? event : { ...event, id: crypto.randomUUID() }));
}
