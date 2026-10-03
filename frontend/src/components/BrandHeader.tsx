"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ThemeToggle } from "@/components/ThemeToggle";

/** The tagline alternates between these, sliding from one to the next. */
const TAGLINES = ["What Could’ve Been.", "What Will Be."];
const SWAP_SECONDS = 4;
/** The first line arrives just as the title settles. */
const FIRST_DELAY = 0.7;

/**
 * The title, tagline, and the light/dark toggle. "FinLife" resolves into place on load (blurred and loosely spaced,
 * then sharp and tight, like the point clouds scanning in), then a faint light band sweeps across it now and then,
 * echoing the LiDAR scanner. The tagline loops between "What Could've Been." and "What Will Be.", each sliding up
 * into place as the other slides away.
 */
export function BrandHeader() {
  const [index, setIndex] = useState(0);
  const [cycled, setCycled] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % TAGLINES.length);
      setCycled(true);
    }, SWAP_SECONDS * 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="mx-auto flex w-full max-w-5xl flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-4 sm:px-6">
      {/* The glow sits on a wrapper (themed: none in light mode), so the title's blur-in can't replace it. */}
      <span className="drop-shadow-[0_0_10px_var(--title-glow)]">
        <motion.h1
          className="brand-sheen text-xl font-bold tracking-tight"
          initial={{ opacity: 0, filter: "blur(8px)", letterSpacing: "0.35em" }}
          animate={{ opacity: 1, filter: "blur(0px)", letterSpacing: "-0.025em" }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        >
          FinLife
        </motion.h1>
      </span>
      {/* Phones: title and toggle share the top row, tagline below. Wider: title, tagline, toggle in one row. */}
      <p className="order-3 basis-full text-sm text-muted sm:order-2 sm:basis-auto">
        {/* One grid cell holds an invisible copy of every line, so the slot is as wide as the longest and nothing shifts. */}
        <span className="relative inline-grid overflow-hidden align-bottom">
          {TAGLINES.map((line) => (
            <span key={line} aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-nowrap">
              {line}
            </span>
          ))}
          <AnimatePresence initial={true} mode="popLayout">
            <motion.span
              key={TAGLINES[index]}
              className="col-start-1 row-start-1 whitespace-nowrap"
              initial={{ y: "100%", opacity: 0, filter: "blur(3px)" }}
              animate={{ y: "0%", opacity: 1, filter: "blur(0px)" }}
              exit={{ y: "-100%", opacity: 0, filter: "blur(3px)" }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: cycled ? 0 : FIRST_DELAY }}
            >
              {TAGLINES[index]}
            </motion.span>
          </AnimatePresence>
        </span>
      </p>
      <ThemeToggle />
    </header>
  );
}
