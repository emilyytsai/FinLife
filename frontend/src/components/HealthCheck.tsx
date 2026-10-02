import { CircleAlert, CircleCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import type { Analysis, Tone } from "@/lib/types";

const TONES: Record<Tone, { icon: LucideIcon; className: string; label: string }> = {
  good: { icon: CircleCheck, className: "text-good", label: "Looks good" },
  watch: { icon: CircleAlert, className: "text-watch", label: "Keep an eye on" },
  alert: { icon: TriangleAlert, className: "text-alert", label: "Needs attention" },
};

/** The four engine highlights for today's profile. Text comes straight from the engine. */
export function HealthCheck({ analysis }: { analysis: Analysis }) {
  return (
    <section className="rounded-card bg-surface p-4 shadow-soft sm:p-5" aria-labelledby="health-heading">
      <h2 id="health-heading" className="font-semibold">
        Health check
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
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
    </section>
  );
}
