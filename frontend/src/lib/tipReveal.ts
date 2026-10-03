// One reveal for every hover card and tooltip: a circle that grows out of the edge facing the hovered thing, plus a
// small drift into place, then the text fades in just behind it. Spread these onto framer-motion elements.

// Gentler than the buttons' curve, so the growth is spread across the duration instead of finishing in the first frames.
const EASE = [0.33, 1, 0.68, 1] as const;

/** Where a card sits relative to what's hovered. The circle grows from the side touching it. */
export type TipPlacement = "above" | "above-start" | "above-end" | "below" | "below-start" | "below-end" | "right" | "left";

const ORIGIN: Record<TipPlacement, string> = {
  above: "50% 100%",
  "above-start": "12% 100%",
  "above-end": "88% 100%",
  below: "50% 0%",
  "below-start": "12% 0%",
  "below-end": "88% 0%",
  right: "0% 50%",
  left: "100% 50%",
};

/** Motion props for the card itself: circular reveal from its anchor edge, with a 6px drift away from the anchor.
 * The card is visible at once (no fade), so the circle's edge is what you see sweeping across it. A circle()
 * percentage is of the card's diagonal / √2, so 145% reaches the farthest corner from any edge or corner origin,
 * whatever the card's shape; the clip is then dropped entirely, so a finished card is never cut off. */
export function tipReveal(placement: TipPlacement) {
  const at = ORIGIN[placement];
  const drift = placement.startsWith("above") ? { y: 6 } : placement.startsWith("below") ? { y: -6 } : { x: placement === "right" ? -6 : 6 };
  return {
    initial: { clipPath: `circle(0% at ${at})`, ...drift },
    animate: { clipPath: `circle(145% at ${at})`, x: 0, y: 0, transitionEnd: { clipPath: "none" } },
    exit: { clipPath: `circle(0% at ${at})`, transition: { duration: 0.25, ease: EASE } },
    transition: { duration: 0.6, ease: EASE },
  };
}

/** Motion props for the card's contents: they fade in as the circle opens, so the text is never half-drawn. */
export const tipContent = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.35, delay: 0.15, ease: EASE },
};
