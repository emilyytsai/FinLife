// The FinLife "API", run entirely in the browser. Same functions and shapes as the old FastAPI backend
// (contracts/schema.md), but the engine is local TypeScript: no server, no keys, nothing that can expire.

import { analyze as analyzeProfile } from "./engine/analysis";
import { buildBrief, decodePlan, encodePlan } from "./engine/brief";
import { runCoach } from "./engine/coach";
import profiles from "./engine/profiles.json";
import { compare as compareEvents, simulate as simulateEvents } from "./engine/simulate";
import { eventFits, profileErrors } from "./engine/validate";
import type {
  AnalyzeResponse,
  Analysis,
  Brief,
  ChatRequest,
  ChatResponse,
  Compare,
  DemoProfile,
  FieldError,
  HealthResponse,
  LifeEvent,
  Profile,
  Result,
  ShareRequest,
  ShareResponse,
} from "./types";

export class ApiError extends Error {
  /** HTTP-style status: 422 for invalid input, 404 for a broken brief link. */
  readonly status: number;
  /** Field errors from a 422, e.g. {field: "profile.retire_age", message: "..."}. */
  readonly fieldErrors: FieldError[];
  /** Always false now; kept so callers don't change. */
  readonly stub: boolean;

  constructor(status: number, message: string, fieldErrors: FieldError[] = [], stub = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.stub = stub;
  }
}

/** Run `work` as a promise; any unexpected error becomes the same friendly message the API used to send. */
async function local<T>(work: () => T): Promise<T> {
  try {
    return work();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error(error);
    throw new ApiError(500, "Something went wrong. Try again.");
  }
}

function checkInput(profile: Profile, events: LifeEvent[] = []): void {
  const errors = profileErrors(profile);
  if (errors.length === 0) {
    events.forEach((event, i) => {
      if (!eventFits(profile, event)) {
        const first = event.type === "have_child" ? profile.age - 17 : profile.age;
        errors.push({ field: `events.${i}.age`, message: `Age must be between ${first} and ${profile.retire_age - 1}` });
      }
    });
    if (events.length > 10) errors.push({ field: "events", message: "You can have at most 10 events" });
    if (events.filter((event) => event.type === "buy_house").length > 1) {
      errors.push({ field: "events", message: "Only one home purchase is allowed" });
    }
  }
  if (errors.length > 0) throw new ApiError(422, "Some details need a fix.", errors);
}

/** Up to 2 suggested prompts whose event type isn't already in the plan. */
function suggestionsFor(analysis: Analysis, events: LifeEvent[]): string[] {
  const used = new Set(events.map((event) => event.type));
  return analysis.suggested_scenarios.filter((s) => !used.has(s.event.type)).map((s) => s.prompt).slice(0, 2);
}

export const getHealth = () => local<HealthResponse>(() => ({ ok: true, stub_engine: false, stub_ai: true }));

export const getProfiles = () => local<DemoProfile[]>(() => structuredClone(profiles as DemoProfile[]));

export const analyze = (profile: Profile) =>
  local<AnalyzeResponse>(() => {
    checkInput(profile);
    return { analysis: analyzeProfile(profile), baseline: simulateEvents(profile, []) };
  });

export const simulate = (profile: Profile, events: LifeEvent[]) =>
  local<Result>(() => {
    checkInput(profile, events);
    return simulateEvents(profile, events);
  });

export const compare = (profile: Profile, events: LifeEvent[]) =>
  local<Compare>(() => {
    checkInput(profile, events);
    return compareEvents(profile, events);
  });

export const chat = (body: ChatRequest) =>
  local<ChatResponse>(() => {
    checkInput(body.profile, body.events);
    const analysis = analyzeProfile(body.profile);
    const question = body.messages[body.messages.length - 1]?.content ?? "";
    const turn = runCoach(body.profile, body.events, question, analysis);
    return {
      ...turn,
      compare: compareEvents(body.profile, turn.events),
      suggestions: suggestionsFor(analysis, turn.events),
    };
  });

export const share = (body: ShareRequest) =>
  local<ShareResponse>(() => {
    checkInput(body.profile, body.events);
    const briefId = encodePlan(body.profile, body.events);
    const base = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}`;
    return { brief_id: briefId, url: `${base}/brief/?id=${briefId}` };
  });

export const getBrief = (id: string) =>
  local<Brief>(() => {
    const plan = decodePlan(id);
    if (!plan) throw new ApiError(404, "Brief not found");
    try {
      checkInput(plan.profile, plan.events);
    } catch {
      throw new ApiError(404, "Brief not found");
    }
    return buildBrief(plan.profile, plan.events, plan.created_at, id);
  });
