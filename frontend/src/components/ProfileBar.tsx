"use client";

import { SlidersHorizontal } from "lucide-react";
import { Pictogram } from "@/components/Pictogram";
import { money, pct } from "@/lib/format";
import type { DemoProfile, Profile } from "@/lib/types";

interface ProfileBarProps {
  profiles: DemoProfile[];
  personaId: string;
  profile: Profile;
  hasErrors: boolean;
  onPersona: (persona: DemoProfile) => void;
  onEdit: () => void;
}

/** Compact stand-in for the profile form: who this is, a few key facts, and a button to open the full form. */
export function ProfileBar({ profiles, personaId, profile, hasErrors, onPersona, onEdit }: ProfileBarProps) {
  const persona = profiles.find((p) => p.id === personaId);
  const facts = [
    `Age ${profile.age}`,
    `${money(profile.income)}/yr`,
    `${money(profile.cash)} cash`,
    `401(k) ${pct(profile.retirement_pct)}`,
  ];

  return (
    <section aria-label="Profile" className="glass flex flex-wrap items-center gap-3 rounded-card px-4 py-3">
      <Pictogram name="user" size={30} className="shrink-0 text-ink" />
      <div className="min-w-0 flex-1">
        {profiles.length > 1 ? (
          <>
            <label htmlFor="persona-bar" className="sr-only">
              Demo persona (fictional)
            </label>
            <select
              id="persona-bar"
              value={personaId}
              onChange={(event) => {
                const next = profiles.find((p) => p.id === event.target.value);
                if (next) onPersona(next);
              }}
              className="max-w-full rounded-md bg-transparent font-semibold outline-none focus:ring-2 focus:ring-primary/30"
            >
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <p className="font-semibold">{persona?.name ?? "Your profile"}</p>
        )}
        <p className="truncate text-xs text-muted">Demo persona · {facts.join(" · ")}</p>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className="glass-strong relative flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink"
      >
        <SlidersHorizontal size={14} aria-hidden="true" />
        Edit details
        {hasErrors && (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-alert" aria-label="Some details need a fix" />
        )}
      </button>
    </section>
  );
}
