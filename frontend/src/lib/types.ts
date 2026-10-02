// Mirrors contracts/schema.md exactly. Change only together with the schema and backend/app/models.py.
// The schema's "Event" is called LifeEvent here so it doesn't shadow the DOM's Event type.

export interface Debt {
  name: string;
  balance: number;
  rate: number;
  min_payment: number;
}

export interface Assumptions {
  investment_return: number;
  inflation: number;
  cash_yield: number;
  tax_rate: number;
  home_cost_pct: number;
}

export interface Profile {
  age: number;
  retire_age: number;
  income: number;
  salary_growth: number;
  cash: number;
  monthly_expenses: number;
  monthly_rent: number;
  retirement_balance: number;
  retirement_pct: number;
  employer_match_pct: number;
  debts: Debt[];
  assumptions: Assumptions;
}

interface EventBase {
  /** Made by the frontend (see withIds). The engine ignores it and the API preserves it. */
  id?: string;
  age: number;
}

export interface BuyHouseEvent extends EventBase {
  type: "buy_house";
  price: number;
  down_pct: number;
  rate: number;
  years: number;
}

export interface HaveChildEvent extends EventBase {
  type: "have_child";
  annual_cost: number;
}

export interface JobLossEvent extends EventBase {
  type: "job_loss";
  months: number;
}

export interface SetRetirementPctEvent extends EventBase {
  type: "set_retirement_pct";
  pct: number;
}

export interface NewDebtEvent extends EventBase {
  type: "new_debt";
  name: string;
  balance: number;
  rate: number;
  years: number;
}

export type LifeEvent = BuyHouseEvent | HaveChildEvent | JobLossEvent | SetRetirementPctEvent | NewDebtEvent;
export type EventType = LifeEvent["type"];

export interface YearRow {
  age: number;
  income: number;
  expenses: number;
  cash: number;
  retirement: number;
  home_equity: number;
  debt: number;
  net_worth: number;
}

export type FlagCode = "low_emergency_fund" | "negative_cash";

export interface Flag {
  age: number;
  code: FlagCode;
  message: string;
}

export interface Summary {
  net_worth_at_retire: number;
  retirement_at_retire: number;
  min_cash: number;
  min_cash_age: number;
}

export interface Result {
  years: YearRow[];
  flags: Flag[];
  summary: Summary;
}

/** scenario.summary minus baseline.summary, field by field. */
export type Diff = Summary;

export interface Compare {
  baseline: Result;
  scenario: Result;
  diff: Diff;
}

export type HighlightCode = "emergency_fund" | "savings_rate" | "debt_to_income" | "retirement_pace";
export type Tone = "good" | "watch" | "alert";

export interface Highlight {
  code: HighlightCode;
  tone: Tone;
  text: string;
}

export interface SuggestedScenario {
  prompt: string;
  event: LifeEvent;
}

export interface Analysis {
  savings_rate: number;
  emergency_fund_months: number;
  debt_to_income: number;
  retirement_target: number;
  retirement_projected: number;
  retirement_ratio: number;
  highlights: Highlight[];
  suggested_scenarios: SuggestedScenario[];
}

export interface DemoProfile {
  id: string;
  name: string;
  blurb: string;
  profile: Profile;
}

export interface HealthResponse {
  ok: boolean;
  stub_engine: boolean;
  stub_ai: boolean;
}

export interface AnalyzeResponse {
  analysis: Analysis;
  baseline: Result;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  session_id: string;
  profile: Profile;
  events: LifeEvent[];
  messages: Message[];
}

export type ShareRequest = ChatRequest;

export type ChatStatus = "ok" | "blocked" | "fallback" | "stub";

export interface ChatResponse {
  reply: string;
  events: LifeEvent[];
  compare: Compare;
  suggestions: string[];
  status: ChatStatus;
}

export interface ShareResponse {
  brief_id: string;
  url: string;
}

export interface Risk {
  age: number;
  text: string;
}

export interface Brief {
  id: string;
  created_at: string;
  profile: Profile;
  events: LifeEvent[];
  compare: Compare;
  analysis: Analysis;
  goals: string[];
  tried: string[];
  risks: Risk[];
  questions: string[];
  disclaimer: string;
}

export interface FieldError {
  field: string;
  message: string;
}
