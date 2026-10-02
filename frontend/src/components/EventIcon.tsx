import type { SVGProps } from "react";
import { Pictogram } from "@/components/Pictogram";
import { eventPictogram } from "@/lib/eventMeta";
import type { LifeEvent } from "@/lib/types";

type EventIconProps = Omit<SVGProps<SVGSVGElement>, "ref" | "name"> & { event: LifeEvent; size?: number };

/** The event's solid pictogram, shared by chart markers and chips. Job loss gets a red slash. */
export function EventIcon({ event, size = 16, ...rest }: EventIconProps) {
  return <Pictogram name={eventPictogram(event)} size={size} slash={event.type === "job_loss"} {...rest} />;
}
