import type {
  AnalyzeResponse,
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

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
const TIMEOUT_MS = 45_000;

export class ApiError extends Error {
  /** HTTP status, or 0 when the request never got a response (offline, timeout). */
  readonly status: number;
  /** Field errors from a 422, e.g. {field: "profile.retire_age", message: "..."}. */
  readonly fieldErrors: FieldError[];
  /** True when the response carried X-FinLife-Stub: 1. */
  readonly stub: boolean;

  constructor(status: number, message: string, fieldErrors: FieldError[] = [], stub = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.stub = stub;
  }
}

type RequestOptions = { method?: "GET" | "POST"; body?: unknown };

async function request<T>(path: string, { method = "GET", body }: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetch(`${API_URL}${path}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(
        0,
        controller.signal.aborted
          ? "This is taking longer than usual. Try again in a few seconds."
          : "Can't reach FinLife right now. Check your connection and try again.",
      );
    }
    const stub = response.headers.get("X-FinLife-Stub") === "1";
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) throw toApiError(response.status, data, stub);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

function toApiError(status: number, data: unknown, stub: boolean): ApiError {
  const body = (data ?? {}) as { error?: unknown; errors?: FieldError[] };
  if (status === 422) {
    return new ApiError(422, "Some details need a fix.", Array.isArray(body.errors) ? body.errors : [], stub);
  }
  if (typeof body.error === "string") return new ApiError(status, body.error, [], stub);
  if (status === 503) return new ApiError(503, "The coach is busy. Try again in a few seconds.", [], stub);
  return new ApiError(status, "Something went wrong. Try again.", [], stub);
}

export const getHealth = () => request<HealthResponse>("/health");

export const getProfiles = () => request<DemoProfile[]>("/profiles");

export const analyze = (profile: Profile) => request<AnalyzeResponse>("/analyze", { method: "POST", body: { profile } });

export const simulate = (profile: Profile, events: LifeEvent[]) =>
  request<Result>("/simulate", { method: "POST", body: { profile, events } });

export const compare = (profile: Profile, events: LifeEvent[]) =>
  request<Compare>("/compare", { method: "POST", body: { profile, events } });

export const chat = (body: ChatRequest) => request<ChatResponse>("/chat", { method: "POST", body });

export const share = (body: ShareRequest) => request<ShareResponse>("/share", { method: "POST", body });

export const getBrief = (id: string) => request<Brief>(`/brief/${encodeURIComponent(id)}`);
