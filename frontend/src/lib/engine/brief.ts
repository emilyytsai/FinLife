// The one-page advisor brief. Nothing is stored: the link carries the profile and events, and the brief is
// recomputed from them when it opens, so links never expire.

import type { Brief, LifeEvent, Profile } from "../types";
import { analyze } from "./analysis";
import { label } from "./labels";
import { compare } from "./simulate";

export const DISCLAIMER = "Client-entered data, not verified. For education only. Not financial advice.";
const QUESTIONS = [
  "Which of these goals matters most to you in the next five years?",
  "How stable do you expect your income to be over the next few years?",
  "How would you handle a large unexpected expense today?",
];
const GOAL_TYPES = new Set(["buy_house", "have_child", "new_debt"]);
const TRIED_TYPES = new Set(["job_loss", "set_retirement_pct"]);

interface SharedPlan {
  profile: Profile;
  events: LifeEvent[];
  created_at: string;
}

export function buildBrief(profile: Profile, events: LifeEvent[], createdAt: string, id: string): Brief {
  const plain = events.map(({ id: _id, ...event }) => event as LifeEvent); // eslint-disable-line @typescript-eslint/no-unused-vars
  const result = compare(profile, plain);
  return {
    id,
    created_at: createdAt,
    profile,
    events: plain,
    compare: result,
    analysis: analyze(profile),
    goals: plain.filter((event) => GOAL_TYPES.has(event.type)).map(label),
    tried: plain.filter((event) => TRIED_TYPES.has(event.type)).map(label),
    risks: result.scenario.flags.slice(0, 4).map((flag) => ({ age: flag.age, text: flag.message })),
    questions: [...QUESTIONS],
    disclaimer: DISCLAIMER,
  };
}

/** The brief id is the plan itself, as URL-safe base64 JSON. */
export function encodePlan(profile: Profile, events: LifeEvent[]): string {
  const plan: SharedPlan = {
    profile,
    events: events.map(({ id: _id, ...event }) => event as LifeEvent), // eslint-disable-line @typescript-eslint/no-unused-vars
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(plan));
  let binary = "";
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** The plan inside a brief id, or null if the link is damaged. */
export function decodePlan(id: string): SharedPlan | null {
  try {
    const base64 = id.replace(/-/g, "+").replace(/_/g, "/");
    const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
    const plan = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))) as SharedPlan;
    if (!plan?.profile?.assumptions || !Array.isArray(plan.events) || typeof plan.created_at !== "string") return null;
    return plan;
  } catch {
    return null;
  }
}
