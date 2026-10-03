"use client";

import { motion } from "framer-motion";

const GLOW = "drop-shadow(0 0 10px rgba(255, 255, 255, 0.35))";
const TAGLINE ="See where your money is headed, then ask “what if.”".split(" ");

/**
 * The title and tagline. "FinLife" resolves into place on load (blurred and loosely spaced, then sharp and tight, like
 * the point clouds scanning in), then a faint light band sweeps across it now and then, echoing the LiDAR scanner.
 * The tagline's words fade up one after another once the title has landed.
 */
export function BrandHeader() {
  return (
    <header className="mx-auto flex w-full max-w-5xl flex-wrap items-baseline gap-x-3 gap-y-1 px-4 pt-4 sm:px-6">
      <motion.h1
        className="brand-sheen text-xl font-semibold tracking-tight"
        // The glow lives in the animated filter too, so the blur-in doesn't replace it.
        initial={{ opacity: 0, filter: `blur(8px) ${GLOW}`, letterSpacing: "0.35em" }}
        animate={{ opacity: 1, filter: `blur(0px) ${GLOW}`, letterSpacing: "-0.025em" }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      >
        FinLife
      </motion.h1>
      <p className="text-sm text-muted">
        {TAGLINE.map((word, i) => (
          <motion.span
            key={i}
            className="inline-block whitespace-pre"
            initial={{ opacity: 0, y: 6, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 0.5, delay: 0.7 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
          >
            {i < TAGLINE.length - 1 ? `${word} ` : word}
          </motion.span>
        ))}
      </p>
    </header>
  );
}
