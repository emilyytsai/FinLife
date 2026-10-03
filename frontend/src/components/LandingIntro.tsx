"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PointCloud } from "@/components/cloud/PointCloud";
import { textCloud } from "@/components/cloud/textCloud";
import type { Cloud } from "@/lib/pointcloud/models";

/** The intro stays at least this long, so the title finishes scanning in before it fades. */
const MIN_SECONDS = 2.4;
/** How long after the slide starts the page's models begin to scan in. */
const REVEAL_DELAY_MS = 350;

/**
 * The loading/landing screen: "FinLife" as a 3D point cloud in the site's font, "Fin" in navy, scanning in from the
 * bottom up like the other models. Once the app is ready (and the minimum time has passed) it slides up and away;
 * a click skips it.
 */
export function LandingIntro({ ready, onReveal }: { ready: boolean; onReveal: () => void }) {
  const [title, setTitle] = useState<{ cloud: Cloud; accentCount: number } | null>(null);
  const [minDone, setMinDone] = useState(false);
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    let active = true;
    // Sample the title once the page font has loaded, so the points take the real letter shapes.
    document.fonts.ready.then(() => {
      if (!active) return;
      const family = getComputedStyle(document.body).fontFamily;
      setTitle(textCloud(["Fin", "Life"], family));
    });
    const timer = setTimeout(() => setMinDone(true), MIN_SECONDS * 1000);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, []);

  const show = !skipped && !(ready && minDone);

  // Once the screen starts sliding away, let the page's models begin scanning in, a beat later so it reads as one move.
  useEffect(() => {
    if (show) return;
    const timer = setTimeout(onReveal, REVEAL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [show, onReveal]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="intro"
          role="status"
          aria-label="Loading FinLife"
          className="fixed inset-0 z-50 flex cursor-pointer items-center justify-center bg-canvas"
          initial={{ y: 0 }}
          // Leaves like a sheet pulled up and away, revealing the page underneath.
          exit={{ y: "-100%", transition: { duration: 0.9, ease: [0.76, 0, 0.24, 1] } }}
          onClick={() => setSkipped(true)}
        >
          {title && (
            <PointCloud
              cloud={title.cloud}
              accentCount={title.accentCount}
              motion="sway"
              sway={0.09}
              tilt={0.12}
              dotSize={1.35}
              className="h-[min(32vw,240px)] w-[min(88vw,760px)]"
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
