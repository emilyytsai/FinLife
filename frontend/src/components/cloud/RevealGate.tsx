"use client";

import { createContext, useContext } from "react";

// Point clouds wait (drawing nothing) while the gate is closed, then scan in from the bottom up once it opens.
// The app closes it while the landing screen covers the page, so the models' scan-in is seen, not hidden behind it.
// Open by default, so clouds anywhere else (e.g. /library/) draw right away.

export const RevealGate = createContext(true);

export const useRevealOpen = () => useContext(RevealGate);

/** How long the bottom-up scan takes, in seconds. The scene slows it down for things a what-if brings in. */
export const RevealPace = createContext(1.3);

export const useRevealPace = () => useContext(RevealPace);
