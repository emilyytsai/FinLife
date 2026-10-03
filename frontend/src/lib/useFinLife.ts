"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, analyze, chat, compare, getProfiles } from "./api";
import { withIds } from "./events";
import { useSessionId } from "./useSessionId";
import type {
  Analysis,
  ChatStatus,
  Compare,
  DemoProfile,
  FieldError,
  LifeEvent,
  Message,
  Profile,
  Result,
  ShareRequest,
} from "./types";

export interface ChatEntry extends Message {
  /** Set on assistant replies. */
  status?: ChatStatus;
}

const ZERO_DIFF = { net_worth_at_retire: 0, retirement_at_retire: 0, min_cash: 0, min_cash_age: 0 };
const REFRESH_DELAY_MS = 400;
const FRESH_MS = 2500;

function friendly(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Try again.";
}

/** Same events, ignoring ids (the API keeps existing ids; new events arrive without one). */
function sameEvents(a: LifeEvent[], b: LifeEvent[]): boolean {
  const strip = (list: LifeEvent[]) => JSON.stringify(list.map((event) => ({ ...event, id: undefined })));
  return strip(a) === strip(b);
}

function toMessages(entries: ChatEntry[]): Message[] {
  return entries.map(({ role, content }) => ({ role, content }));
}

/** All client state for the main page: profile, events, chat, and the engine results behind the chart. */
export function useFinLife() {
  const sessionId = useSessionId();
  const [profiles, setProfiles] = useState<DemoProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(true);
  const [personaId, setPersonaId] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null);
  /** The profile behind the numbers on screen. Lags `profile` while an edit is invalid or in flight. */
  const [chartProfile, setChartProfile] = useState<Profile | null>(null);
  const [events, setEvents] = useState<LifeEvent[]>([]);
  const [messages, setMessages] = useState<ChatEntry[]>([]);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [baseline, setBaseline] = useState<Result | null>(null);
  const [scenario, setScenario] = useState<Compare | null>(null);
  const [chatSuggestions, setChatSuggestions] = useState<string[] | null>(null);
  const [chartPending, setChartPending] = useState(false);
  const [chatPending, setChatPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  /** Ids of events the last chat turn added, for a short celebration in the UI. */
  const [freshIds, setFreshIds] = useState<string[]>([]);
  /** True when the last question didn't change the scenario. The reply text itself is never shown. */
  const [noChange, setNoChange] = useState(false);
  const freshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Late responses must not overwrite newer ones.
  const analyzeSeq = useRef(0);
  const compareSeq = useRef(0);
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  function markFresh(added: LifeEvent[]) {
    const ids = added.flatMap((event) => (event.id ? [event.id] : []));
    if (ids.length === 0) return;
    if (freshTimer.current) clearTimeout(freshTimer.current);
    setFreshIds(ids);
    freshTimer.current = setTimeout(() => setFreshIds([]), FRESH_MS);
  }

  function choosePersona(persona: DemoProfile) {
    compareSeq.current++;
    setPersonaId(persona.id);
    setProfile(persona.profile);
    setEvents([]);
    setMessages([]);
    setScenario(null);
    setChatSuggestions(null);
    setFieldErrors([]);
    setNoChange(false);
  }

  function loadProfiles() {
    setProfilesLoading(true);
    setError(null);
    getProfiles()
      .then((list) => {
        setProfiles(list);
        if (list.length > 0) choosePersona(list[0]);
      })
      .catch((err: unknown) => setError(friendly(err)))
      .finally(() => setProfilesLoading(false));
  }

  useEffect(() => {
    let active = true;
    getProfiles()
      .then((list) => {
        if (!active) return;
        setProfiles(list);
        if (list.length > 0) choosePersona(list[0]);
      })
      .catch((err: unknown) => active && setError(friendly(err)))
      .finally(() => active && setProfilesLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // Re-run the health check (and the scenario, if any) shortly after the profile stops changing.
  useEffect(() => {
    if (!profile) return;
    const timer = setTimeout(async () => {
      const seq = ++analyzeSeq.current;
      const cmpSeq = ++compareSeq.current;
      const current = eventsRef.current;
      setChartPending(true);
      try {
        const [analyzed, compared] = await Promise.all([
          analyze(profile),
          current.length > 0 ? compare(profile, current) : Promise.resolve(null),
        ]);
        if (seq !== analyzeSeq.current) return;
        setAnalysis(analyzed.analysis);
        setBaseline(analyzed.baseline);
        setChartProfile(profile);
        if (cmpSeq === compareSeq.current) setScenario(compared);
        setFieldErrors([]);
      } catch (err) {
        if (seq !== analyzeSeq.current) return;
        if (err instanceof ApiError && err.status === 422) setFieldErrors(err.fieldErrors);
        else setError(friendly(err));
      } finally {
        if (seq === analyzeSeq.current) setChartPending(false);
      }
    }, REFRESH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [profile]);

  async function sendMessage(text: string): Promise<boolean> {
    const content = text.trim();
    if (!profile || !content || chatPending) return false;
    const before = messages;
    const history: ChatEntry[] = [...before, { role: "user", content }];
    setMessages(history);
    setChatPending(true);
    setNoChange(false);
    setError(null);
    try {
      const response = await chat({ session_id: sessionId, profile, events, messages: toMessages(history) });
      compareSeq.current++;
      setMessages([...history, { role: "assistant", content: response.reply, status: response.status }]);
      const nextEvents = withIds(response.events);
      setEvents(nextEvents);
      markFresh(nextEvents.filter((next) => !events.some((old) => old.id === next.id)));
      setNoChange(sameEvents(events, nextEvents));
      setScenario(response.events.length > 0 ? response.compare : null);
      setChartProfile(profile);
      setChatSuggestions(response.suggestions);
      return true;
    } catch (err) {
      setMessages(before);
      setError(friendly(err));
      return false;
    } finally {
      setChatPending(false);
    }
  }

  async function removeEvent(event: LifeEvent) {
    if (!profile) return;
    const next = events.filter((other) => other.id !== event.id);
    const seq = ++compareSeq.current;
    setEvents(next);
    if (next.length === 0) {
      setScenario(null);
      return;
    }
    setChartPending(true);
    try {
      const compared = await compare(profile, next);
      if (seq === compareSeq.current) {
        setScenario(compared);
        setChartProfile(profile);
      }
    } catch (err) {
      setError(friendly(err));
    } finally {
      if (seq === compareSeq.current) setChartPending(false);
    }
  }

  // What the chart draws: the scenario when there are events, otherwise the baseline twice.
  const chartCompare: Compare | null =
    events.length > 0 && scenario
      ? scenario
      : baseline
        ? { baseline, scenario: baseline, diff: ZERO_DIFF }
        : null;

  const usedTypes = new Set(events.map((event) => event.type));
  const suggestions =
    chatSuggestions ??
    (analysis?.suggested_scenarios ?? []).filter((s) => !usedTypes.has(s.event.type)).map((s) => s.prompt);

  const shareRequest: ShareRequest | null = profile
    ? { session_id: sessionId, profile, events, messages: toMessages(messages) }
    : null;

  return {
    profiles,
    profilesLoading,
    personaId,
    profile,
    events,
    messages,
    analysis,
    chartProfile,
    chartCompare,
    suggestions,
    shareRequest,
    chartPending,
    chatPending,
    error,
    fieldErrors,
    freshIds,
    noChange,
    loadProfiles,
    choosePersona,
    setProfile,
    sendMessage,
    removeEvent,
    dismissError: () => setError(null),
  };
}
