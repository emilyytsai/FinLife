import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Analysis, Tone } from "@/lib/types";

const TONES: Record<Tone, { icon: LucideIcon; className: string; label: string }> = {
  good: { icon: CircleCheck, className: "text-good", label: "Looks good" },
  watch: { icon: CircleAlert, className: "text-watch", label: "Keep an eye on" },
  alert: { icon: TriangleAlert, className: "text-alert", label: "Needs attention" },
};

/** The health check: the four engine highlights for today's profile. Text comes straight from the engine. */
export function HealthHighlights({ analysis }: { analysis: Analysis }) {
  return (
    <ul className="space-y-2" aria-label="Health check">
      {analysis.highlights.map((highlight) => {
        const tone = TONES[highlight.tone];
        const Icon = tone.icon;
        return (
          <li key={highlight.code} className="flex gap-2 text-sm">
            <Icon size={18} className={`mt-0.5 shrink-0 ${tone.className}`} aria-label={tone.label} />
            <span>{highlight.text}</span>
          </li>
        );
      })}
    </ul>
  );
}
