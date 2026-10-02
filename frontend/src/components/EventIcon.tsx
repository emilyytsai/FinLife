import { createElement, type SVGProps } from "react";
import { eventIcon } from "@/lib/eventMeta";
import type { LifeEvent } from "@/lib/types";

type EventIconProps = Omit<SVGProps<SVGSVGElement>, "ref"> & { event: LifeEvent; size?: number };

/** The event's lucide icon, shared by chart badges and chips. Job loss gets a red slash. */
export function EventIcon({ event, size = 16, ...rest }: EventIconProps) {
  // createElement: eventIcon returns a module-level icon component, not one made during render.
  return createElement(
    eventIcon(event),
    { size, "aria-hidden": true, focusable: false, ...rest },
    event.type === "job_loss" ? <line x1="3" y1="3" x2="21" y2="21" stroke="var(--alert)" strokeWidth={2.5} /> : null,
  );
}
