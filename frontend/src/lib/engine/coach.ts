// The offline what-if coach. It turns a question into life events with simple pattern matching (no AI calls),
// then the engine computes every number. Replies are built only from engine output, like the backend's template.

import { money } from "../format";
import type { Analysis, ChatResponse, LifeEvent, Profile } from "../types";
import { label } from "./labels";
import { compare } from "./simulate";
import { eventFits } from "./validate";

const MAX_EVENTS = 10;

const HELP_REPLY =
  "I can run what-ifs about buying a home, having a child, losing a job, changing your 401(k), or taking on a loan. " +
  'Try something like "What if I buy a $300k house at 30?"';
const ADVICE_REPLY =
  "I can't recommend investments. A licensed advisor can help with that. I can show how a life change would affect your plan instead.";

type Intent = "buy_house" | "have_child" | "job_loss" | "set_retirement_pct" | "new_debt";

const INTENTS: [Intent, RegExp][] = [
  ["set_retirement_pct", /401\s*\(?k\)?|retirement (?:contribution|savings rate)|contribute|contribution/],
  ["job_loss", /lose (?:my |our |the )?job|laid off|lay ?off|get fired|fired|unemploy|job loss|out of work|between jobs/],
  ["have_child", /\b(?:child|children|kid|kids|baby|babies|son|daughter|pregnan)/],
  ["buy_house", /\b(?:house|home|condo|townhouse|apartment|property|place)\b/],
  ["new_debt", /\b(?:loan|borrow|debt|finance|car|truck|wedding|boat|motorcycle)\b/],
];

/** One chat turn: the reply and the full event list after it. */
export function runCoach(
  profile: Profile,
  events: LifeEvent[],
  question: string,
  analysis: Analysis,
): Pick<ChatResponse, "reply" | "events" | "status"> {
  const text = question.trim().toLowerCase();

  const suggested = analysis.suggested_scenarios.find((s) => s.prompt.toLowerCase() === text);
  if (suggested) return withEvents(profile, events, [suggested.event], []);

  if (/\b(?:stock|stocks|fund|funds|etf|crypto|bitcoin|invest in|index fund|bonds?|which account)\b/.test(text)) {
    return { reply: ADVICE_REPLY, events, status: "ok" };
  }
  if (/\b(?:start over|reset|clear (?:it|everything|all)|remove (?:everything|all))\b/.test(text)) {
    return { reply: summaryReply(profile, []), events: [], status: "ok" };
  }

  const removing = /\b(?:remove|undo|cancel|delete|drop|forget|never ?mind|don't|do not|without|instead of)\b/.test(text);
  const added: LifeEvent[] = [];
  const removedTypes: Intent[] = [];
  const problems: string[] = [];

  for (const clause of splitClauses(text)) {
    const intent = INTENTS.find(([, pattern]) => pattern.test(clause))?.[0];
    if (!intent) continue;
    if (removing) {
      removedTypes.push(intent);
      continue;
    }
    const event = parseEvent(intent, clause, profile, analysis);
    if (eventFits(profile, event)) added.push(event);
    else problems.push(`${label(event)} is outside your plan, which runs from ${profile.age} to ${profile.retire_age - 1}.`);
  }

  if (added.length === 0 && removedTypes.length === 0) {
    return { reply: problems.join(" ") || HELP_REPLY, events, status: "ok" };
  }
  return withEvents(profile, events, added, removedTypes, problems);
}

function withEvents(
  profile: Profile,
  events: LifeEvent[],
  added: LifeEvent[],
  removedTypes: Intent[],
  problems: string[] = [],
): Pick<ChatResponse, "reply" | "events" | "status"> {
  let next = events.filter((event) => !removedTypes.includes(event.type));
  const kept: LifeEvent[] = [];
  for (const event of added) {
    // Only one home purchase, and one 401(k) change per age: a new one replaces the old.
    next = next.filter(
      (old) =>
        !(event.type === "buy_house" && old.type === "buy_house") &&
        !(event.type === "set_retirement_pct" && old.type === "set_retirement_pct" && old.age === event.age),
    );
    if (next.length >= MAX_EVENTS) {
      problems.push(`You can test up to ${MAX_EVENTS} life events at once.`);
      break;
    }
    next.push(event);
    kept.push(event);
  }
  const changed = [
    ...kept.map((event) => `Added: ${label(event)}.`),
    ...removedTypes.length > 0 && kept.length === 0 ? ["Removed that from your plan."] : [],
  ];
  return { reply: [...changed, summaryReply(profile, next), ...problems].join(" "), events: next, status: "ok" };
}

/** A plain reply built only from engine output. */
function summaryReply(profile: Profile, events: LifeEvent[]): string {
  const result = compare(profile, events);
  const baseline = result.baseline.summary;
  const scenario = result.scenario.summary;
  const retireAge = profile.retire_age;
  const sentences =
    events.length > 0
      ? [
          `With your changes, your net worth at ${retireAge} would be ${money(scenario.net_worth_at_retire)}, ` +
            `compared with ${money(baseline.net_worth_at_retire)} on your current path.`,
        ]
      : [`On your current path, your net worth at ${retireAge} would be ${money(baseline.net_worth_at_retire)}.`];
  sentences.push(`Your cash is lowest at ${money(scenario.min_cash)} at age ${scenario.min_cash_age}.`);
  const flag = result.scenario.flags[0];
  if (flag) sentences.push(`At ${flag.age}: ${flag.message}.`);
  return sentences.join(" ");
}

/** "buy a house at 28 and lose my job at 31" -> one clause per life event. */
function splitClauses(text: string): string[] {
  return text
    .split(/[,;.!?]|\band then\b|\bthen\b|\balso\b|\band\b(?=\s+(?:i|we|my|have|get|buy|lose|take|raise|lower|set|put|a|an)\b)/)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function parseEvent(intent: Intent, clause: string, profile: Profile, analysis: Analysis): LifeEvent {
  const suggested = analysis.suggested_scenarios.find((s) => s.event.type === intent)?.event;
  const age = parseAge(clause, profile) ?? suggested?.age ?? Math.min(profile.age + 1, profile.retire_age - 1);

  switch (intent) {
    case "buy_house": {
      const defaultPrice = suggested?.type === "buy_house" ? suggested.price : Math.max(50000, profile.income * 6);
      return {
        type: "buy_house",
        age,
        price: Math.max(10000, parseMoney(clause) ?? defaultPrice),
        down_pct: clampRate(parsePercent(clause, /(\d+(?:\.\d+)?)\s*%\s*(?:down|down payment)/), 0.1, 0, 1),
        rate: clampRate(parsePercent(clause, /(\d+(?:\.\d+)?)\s*%\s*(?:rate|interest|mortgage|apr)/), 0.065, 0, 0.2),
        years: clampInt(parseYears(clause), 30, 1, 40),
      };
    }
    case "have_child": {
      const yearsAgo = clause.match(/(\d+|a|one|two|three|four|five|six|seven|eight|nine|ten)\s+years?\s+ago/);
      const childAge = yearsAgo ? profile.age - wordNumber(yearsAgo[1]) : age;
      return { type: "have_child", age: childAge, annual_cost: Math.min(100000, parseMoney(clause) ?? 15000) };
    }
    case "job_loss": {
      const months = clause.match(/(\d+|a|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+months?/);
      const fullYear = /\b(?:a|one|1)\s+year\b|\bwhole year\b/.test(clause);
      return { type: "job_loss", age, months: clampInt(months ? wordNumber(months[1]) : fullYear ? 12 : null, 6, 1, 12) };
    }
    case "set_retirement_pct": {
      const pct = parsePercent(clause, /(\d+(?:\.\d+)?)\s*%/);
      const by = /\bby\s+\d/.test(clause);
      const lower = /\b(?:lower|reduce|cut|decrease|stop)\b/.test(clause);
      const defaultPct = suggested?.type === "set_retirement_pct" ? suggested.pct : profile.retirement_pct + 0.05;
      let value = pct === null ? (/\bstop\b/.test(clause) ? 0 : defaultPct) : pct;
      if (by && pct !== null) value = profile.retirement_pct + (lower ? -pct : pct);
      return { type: "set_retirement_pct", age, pct: Math.round(clampRate(value, defaultPct, 0, 1) * 1000) / 1000 };
    }
    case "new_debt": {
      const kind = clause.match(/\b(car|truck|wedding|boat|motorcycle|student|personal|medical)\b/)?.[1] ?? "personal";
      const defaultBalance = kind === "car" || kind === "truck" ? 30000 : 15000;
      return {
        type: "new_debt",
        age,
        name: kind,
        balance: Math.min(1000000, Math.max(1, parseMoney(clause) ?? defaultBalance)),
        rate: clampRate(parsePercent(clause, /(\d+(?:\.\d+)?)\s*%/), 0.07, 0, 0.4),
        years: clampInt(parseYears(clause), 5, 1, 30),
      };
    }
  }
}

const WORDS: Record<string, number> = {
  a: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

function wordNumber(word: string): number {
  return WORDS[word] ?? Number(word);
}

function parseAge(clause: string, profile: Profile): number | null {
  const at = clause.match(/\b(?:at|age|aged|when i(?:'m| am| turn)|by the time i(?:'m| am)?|turning)\s+(?:age\s+)?(\d{2})\b(?!\s*%)/);
  if (at) return Number(at[1]);
  const inYears = clause.match(/\bin\s+(\d+|a|one|two|three|four|five|six|seven|eight|nine|ten)\s+years?\b/);
  if (inYears) return profile.age + wordNumber(inYears[1]);
  if (/\bnext year\b/.test(clause)) return profile.age + 1;
  if (/\b(?:now|today|this year|right away)\b/.test(clause)) return profile.age;
  return null;
}

/** "$350k", "350k", "$350,000", "$1.2m", "350 thousand". Plain numbers without $ or a unit are ignored (they're ages). */
function parseMoney(clause: string): number | null {
  const match = clause.match(/\$\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)?\b|(\d[\d,]*(?:\.\d+)?)\s*(k|m|thousand|million)\b/);
  if (!match) return null;
  const value = Number((match[1] ?? match[3]).replace(/,/g, ""));
  const unit = match[2] ?? match[4];
  const scale = unit === "k" || unit === "thousand" ? 1_000 : unit === "m" || unit === "million" ? 1_000_000 : 1;
  return Number.isFinite(value) ? value * scale : null;
}

function parsePercent(clause: string, pattern: RegExp): number | null {
  const match = clause.match(pattern);
  return match ? Number(match[1]) / 100 : null;
}

function parseYears(clause: string): number | null {
  const match = clause.match(/(\d+)[\s-]*(?:years?|yr)\b(?!\s+ago)/);
  return match && !/\bin\s+\d+\s+years?/.test(clause) ? Number(match[1]) : null;
}

function clampRate(value: number | null, fallback: number, min: number, max: number): number {
  return value === null || !Number.isFinite(value) ? fallback : Math.min(max, Math.max(min, value));
}

function clampInt(value: number | null, fallback: number, min: number, max: number): number {
  return value === null || !Number.isFinite(value) ? fallback : Math.min(max, Math.max(min, Math.round(value)));
}
