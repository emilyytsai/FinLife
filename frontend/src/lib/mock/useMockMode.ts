import { useSyncExternalStore } from "react";

// demo branch: the mock household (Maya, her husband, the condo, two cars, and the kid scenario) is ON by default.
// Add ?mock=off to the URL to use the real engine instead. Off during the static prerender.

const subscribe = () => () => {};

export function useMockMode(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get("mock") !== "off",
    () => false,
  );
}
