"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Pictogram } from "@/components/Pictogram";
import type { Assumptions, Debt, DemoProfile, FieldError, Profile } from "@/lib/types";

type Kind = "money" | "percent" | "age";

type ProfileNumberKey = {
  [K in keyof Profile]: Profile[K] extends number ? K : never;
}[keyof Profile];

const MAIN_FIELDS: { key: ProfileNumberKey; label: string; kind: Kind; hint?: string }[] = [
  { key: "age", label: "Age", kind: "age" },
  { key: "retire_age", label: "Retire at", kind: "age" },
  { key: "income", label: "Yearly income", kind: "money", hint: "Before taxes" },
  { key: "cash", label: "Cash today", kind: "money", hint: "Checking plus savings" },
  { key: "monthly_expenses", label: "Monthly living costs", kind: "money", hint: "Not counting rent or debt" },
  { key: "monthly_rent", label: "Monthly rent", kind: "money" },
  { key: "retirement_balance", label: "401(k) balance", kind: "money" },
  { key: "retirement_pct", label: "401(k) contribution", kind: "percent", hint: "Share of income" },
  { key: "employer_match_pct", label: "Employer match up to", kind: "percent" },
  { key: "salary_growth", label: "Yearly raise", kind: "percent" },
];

const ASSUMPTION_FIELDS: { key: keyof Assumptions; label: string }[] = [
  { key: "investment_return", label: "Investment return" },
  { key: "inflation", label: "Inflation" },
  { key: "cash_yield", label: "Cash yield" },
  { key: "tax_rate", label: "Tax rate" },
  { key: "home_cost_pct", label: "Home costs (yearly)" },
];

const NEW_DEBT: Debt = { name: "loan", balance: 0, rate: 0, min_payment: 0 };
const MAX_DEBTS = 5;

function toDisplay(value: number, kind: Kind): string {
  return kind === "percent" ? String(Math.round(value * 1000) / 10) : String(value);
}

function parse(text: string, kind: Kind): number | null {
  const cleaned = text.replace(/[$,%\s]/g, "");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return kind === "percent" ? value / 100 : value;
}

interface NumberFieldProps {
  id: string;
  label: string;
  kind: Kind;
  value: number;
  onChange: (value: number) => void;
  error?: string;
  hint?: string;
}

/** Keeps the typed text while it's mid-edit ("", "0.") and commits only valid numbers. */
function NumberField({ id, label, kind, value, onChange, error, hint }: NumberFieldProps) {
  const [draft, setDraft] = useState(() => toDisplay(value, kind));
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-muted">
        {label}
      </label>
      <div
        className={`mt-1 flex items-center rounded-lg border bg-surface px-2.5 focus-within:ring-2 focus-within:ring-primary/30 ${error ? "border-alert" : "border-line"}`}
      >
        {kind === "money" && <span className="text-sm text-muted">$</span>}
        <input
          id={id}
          inputMode="decimal"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value);
            const parsed = parse(event.target.value, kind);
            if (parsed !== null) onChange(parsed);
          }}
          onBlur={() => setDraft(toDisplay(value, kind))}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-full min-w-0 bg-transparent py-1.5 pl-1 text-sm outline-none"
        />
        {kind === "percent" && <span className="text-sm text-muted">%</span>}
      </div>
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-xs text-alert">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-muted">{hint}</p>
      )}
    </div>
  );
}

interface ProfilePanelProps {
  profiles: DemoProfile[];
  personaId: string;
  profile: Profile;
  fieldErrors: FieldError[];
  onPersona: (persona: DemoProfile) => void;
  onChange: (profile: Profile) => void;
}

export function ProfilePanel({ profiles, personaId, profile, fieldErrors, onPersona, onChange }: ProfilePanelProps) {
  const persona = profiles.find((p) => p.id === personaId);
  const errorFor = (path: string) => fieldErrors.find((e) => e.field === `profile.${path}`)?.message;
  const known = (field: string) =>
    MAIN_FIELDS.some((f) => field === `profile.${f.key}`) ||
    ASSUMPTION_FIELDS.some((f) => field === `profile.assumptions.${f.key}`) ||
    field.startsWith("profile.debts.");
  const otherErrors = fieldErrors.filter((e) => !known(e.field));

  const setDebts = (debts: Debt[]) => onChange({ ...profile, debts });
  const updateDebt = (index: number, patch: Partial<Debt>) =>
    setDebts(profile.debts.map((debt, i) => (i === index ? { ...debt, ...patch } : debt)));

  return (
    <section className="rounded-card bg-surface p-4 shadow-soft" aria-labelledby="profile-heading">
      <div className="flex items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center text-ink">
          <Pictogram name="user" size={28} />
        </span>
        <div className="min-w-0">
          <h2 id="profile-heading" className="font-semibold">
            {persona ? `${persona.name}'s profile` : "Your profile"}
          </h2>
          {persona && <p className="truncate text-xs text-muted">{persona.blurb}</p>}
        </div>
      </div>

      {profiles.length > 1 && (
        <div className="mt-4">
          <label htmlFor="persona" className="block text-xs font-medium text-muted">
            Demo persona (fictional)
          </label>
          <select
            id="persona"
            value={personaId}
            onChange={(event) => {
              const next = profiles.find((p) => p.id === event.target.value);
              if (next) onPersona(next);
            }}
            className="mt-1 w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm"
          >
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}: {p.blurb}
              </option>
            ))}
          </select>
        </div>
      )}

      {otherErrors.length > 0 && (
        <ul role="alert" className="mt-3 space-y-1 text-xs text-alert">
          {otherErrors.map((e) => (
            <li key={e.field}>{e.message}</li>
          ))}
        </ul>
      )}

      {/* key={personaId} resets every field's draft text when the persona changes. */}
      <div key={personaId} className="mt-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {MAIN_FIELDS.map((field) => (
            <NumberField
              key={field.key}
              id={`field-${field.key}`}
              label={field.label}
              kind={field.kind}
              value={profile[field.key]}
              hint={field.hint}
              error={errorFor(field.key)}
              onChange={(value) => onChange({ ...profile, [field.key]: value })}
            />
          ))}
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">Debts</legend>
          {profile.debts.length === 0 && <p className="mt-1 text-xs text-muted">No debts.</p>}
          <ul className="mt-2 space-y-3">
            {profile.debts.map((debt, index) => (
              // Length in the key remounts the rows after a removal so no field keeps a shifted draft.
              <li key={`${index}-${profile.debts.length}`} className="rounded-lg border border-line p-2.5">
                <div className="flex items-center gap-2">
                  <label htmlFor={`debt-${index}-name`} className="sr-only">
                    Debt name
                  </label>
                  <input
                    id={`debt-${index}-name`}
                    value={debt.name}
                    maxLength={40}
                    onChange={(event) => updateDebt(index, { name: event.target.value })}
                    className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setDebts(profile.debts.filter((_, i) => i !== index))}
                    aria-label={`Remove ${debt.name}`}
                    className="rounded-md p-1 text-muted hover:bg-canvas hover:text-alert"
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  <NumberField
                    id={`debt-${index}-balance`}
                    label="Balance"
                    kind="money"
                    value={debt.balance}
                    error={errorFor(`debts.${index}.balance`)}
                    onChange={(balance) => updateDebt(index, { balance })}
                  />
                  <NumberField
                    id={`debt-${index}-rate`}
                    label="Rate"
                    kind="percent"
                    value={debt.rate}
                    error={errorFor(`debts.${index}.rate`)}
                    onChange={(rate) => updateDebt(index, { rate })}
                  />
                  <NumberField
                    id={`debt-${index}-payment`}
                    label="Monthly"
                    kind="money"
                    value={debt.min_payment}
                    error={errorFor(`debts.${index}.min_payment`)}
                    onChange={(min_payment) => updateDebt(index, { min_payment })}
                  />
                </div>
              </li>
            ))}
          </ul>
          {profile.debts.length < MAX_DEBTS && (
            <button
              type="button"
              onClick={() => setDebts([...profile.debts, NEW_DEBT])}
              className="mt-2 flex items-center gap-1 text-sm font-medium text-primary"
            >
              <Plus size={14} aria-hidden="true" />
              Add a debt
            </button>
          )}
        </fieldset>

        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold">Assumptions</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {ASSUMPTION_FIELDS.map((field) => (
              <NumberField
                key={field.key}
                id={`field-${field.key}`}
                label={field.label}
                kind="percent"
                value={profile.assumptions[field.key]}
                error={errorFor(`assumptions.${field.key}`)}
                onChange={(value) => onChange({ ...profile, assumptions: { ...profile.assumptions, [field.key]: value } })}
              />
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
