"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, analyze, chat, compare, getProfiles } from "./api";
import { withIds } from "./events";
import { MOCK_PERSONA, MOCK_SCENARIOS, matchScenario, mockProject, type MockScenario, type MockYear } from "./mock/household";
import { useMockMode } from "./mock/useMockMode";
import { useSessionId } from "./useSessionId";
import type { Analysis, ChatStatus, Compare, DemoProfile, FieldError, LifeEvent, Message, Profile, Result, ShareRequest } from "./types";

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
  /** Age of the earliest event the last question added, so the scene can travel there. */
  const [landingAge, setLandingAge] = useState<number | null>(null);
  /** Mock mode (on by default on the demo branch; ?mock=off turns it off): a browser-side household projection, not the engine. */
  const mock = useMockMode();
  const [mockYears, setMockYears] = useState<Record<number, MockYear> | null>(null);
  /** The hard-coded scenario on screen (mock mode), or null for the base household. */
  const [mockScenario, setMockScenario] = useState<MockScenario | null>(null);
  const mockScenarioRef = useRef<MockScenario | null>(null);
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
    setLandingAge(null);
    mockScenarioRef.current = null;
    setMockScenario(null);
  }

  // Mock mode's only persona is the mock household; nothing is fetched.
  const fetchProfiles = () => (mock ? Promise.resolve([MOCK_PERSONA]) : getProfiles());

  function loadProfiles() {
    setProfilesLoading(true);
    setError(null);
    fetchProfiles()
      .then((list) => {
        setProfiles(list);
        if (list.length > 0) choosePersona(list[0]);
      })
      .catch((err: unknown) => setError(friendly(err)))
      .finally(() => setProfilesLoading(false));
  }

  useEffect(() => {
    let active = true;
    const load = mock ? Promise.resolve([MOCK_PERSONA]) : getProfiles();
    load
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
  }, [mock]);

  // Re-run the health check (and the scenario, if any) shortly after the profile stops changing.
  useEffect(() => {
    if (!profile || mock) return;
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
  }, [profile, mock]);

  // Mock mode: numbers from the browser-side projection, for the base household or one hard-coded scenario.
  // Event handlers call this in the same update as setEvents, so the scene sees the whole trade-off (e.g. the daughter
  // in, the condo and SUV out) as one change and can pace it.
  function applyMock(current: Profile, chosen: MockScenario | null) {
    const base = mockProject(current);
    setBaseline(base.compare.baseline);
    setAnalysis(null);
    if (chosen) {
      const effective = chosen.profile(current);
      const projected = mockProject(effective, chosen.household);
      setScenario({ baseline: base.compare.baseline, scenario: projected.compare.baseline, diff: ZERO_DIFF });
      setMockYears(projected.years);
      setChartProfile(effective);
    } else {
      setScenario(null);
      setMockYears(base.years);
      setChartProfile(current);
    }
  }

  // Profile edits (and the first load) re-run the mock projection.
  useEffect(() => {
    if (!mock || !profile) return;
    const timer = setTimeout(() => applyMock(profile, mockScenarioRef.current), 0);
    return () => clearTimeout(timer);
  }, [mock, profile]);

  async function sendMessage(text: string): Promise<boolean> {
    const content = text.trim();
    if (!profile || !content || chatPending) return false;
    if (mock) {
      // Only the hard-coded scenarios are wired up: a typed question switches to the one it matches.
      const chosen = matchScenario(content);
      if (!chosen) {
        setError("This demo is set up for the questions below for now. Pick one, or ask about a house or a kid.");
        return false;
      }
      setError(null);
      if (chosen.id === mockScenarioRef.current?.id) return true;
      const added = withIds(chosen.events(profile));
      mockScenarioRef.current = chosen;
      setMockScenario(chosen);
      setEvents(added);
      applyMock(profile, chosen);
      markFresh(added);
      setLandingAge(profile.age); // every scenario starts today (a child from 5 years ago is already 5)
      return true;
    }
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
      const added = nextEvents.filter((next) => !events.some((old) => old.id === next.id));
      markFresh(added);
      // Never before today: a child the user already has starts in the past, where the plan has no numbers.
      if (added.length > 0) setLandingAge(Math.max(profile.age, Math.min(...added.map((event) => event.age))));
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
    if (mock) {
      resetScenario(); // a mock scenario is all or nothing
      return;
    }
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

  /** Back to the starting point: no what-ifs. */
  function resetScenario() {
    if (!profile) return;
    compareSeq.current++;
    setEvents([]);
    setScenario(null);
    setNoChange(false);
    setLandingAge(null);
    if (mock) {
      mockScenarioRef.current = null;
      setMockScenario(null);
      applyMock(profile, null);
    }
  }

  // What the chart draws: the scenario when there are events, otherwise the baseline twice.
  const chartCompare: Compare | null =
    events.length > 0 && scenario ? scenario : baseline ? { baseline, scenario: baseline, diff: ZERO_DIFF } : null;

  const usedTypes = new Set(events.map((event) => event.type));
  const suggestions = mock
    ? MOCK_SCENARIOS.filter((option) => option.id !== mockScenario?.id).map((option) => option.prompt)
    : (chatSuggestions ?? (analysis?.suggested_scenarios ?? []).filter((s) => !usedTypes.has(s.event.type)).map((s) => s.prompt));

  // The question behind the scenario on screen, shown above the scene: the mock scenario's prompt, or the last question asked.
  const lastQuestion = [...messages].reverse().find((entry) => entry.role === "user")?.content ?? null;
  const scenarioPrompt = mock ? (mockScenario?.prompt ?? null) : events.length > 0 ? lastQuestion : null;

  const shareRequest: ShareRequest | null = profile ? { session_id: sessionId, profile, events, messages: toMessages(messages) } : null;

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
    landingAge,
    mock,
    mockYears: mock ? mockYears : null,
    scenarioPrompt,
    resetScenario,
    loadProfiles,
    choosePersona,
    setProfile,
    sendMessage,
    removeEvent,
    dismissError: () => setError(null),
  };
}
