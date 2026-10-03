import { useSyncExternalStore } from "react";

// Mock mode for local UI testing: on only when the URL has ?mock=household. Off during the static prerender.

const subscribe = () => () => {};

export function useMockMode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get("mock") === "household",
    () => false,
  );
}
