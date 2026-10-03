"use client";

import { useSyncExternalStore, type CSSProperties } from "react";
import { Moon, Sun } from "lucide-react";

// Light or dark mode, stored on <html data-theme> and remembered in localStorage. Dark is the default.
// The inline script in layout.tsx applies a saved choice before the first paint, so there's no flash on reload.

export const THEME_KEY = "finlife-theme";
type Theme = "dark" | "light";

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const current = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, current, () => "dark" as Theme);
  const next: Theme = theme === "light" ? "dark" : "light";

  function toggle() {
    if (next === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be blocked; the theme still switches for this visit.
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className="glass-strong fill-btn order-2 ml-auto sm:order-3 flex size-9 shrink-0 items-center justify-center self-center rounded-full text-ink"
      style={{ "--btn-fill": "var(--accent)" } as CSSProperties}
    >
      <span className="circle" aria-hidden="true" />
      {theme === "light" ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
    </button>
  );
}
