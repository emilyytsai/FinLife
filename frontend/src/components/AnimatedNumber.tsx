"use client";

import { useEffect } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  format: (value: number) => string;
  className?: string;
}

/**
 * Ticks from the previous value to the new one instead of snapping. The in-between frames are only
 * animation; it always comes to rest on the exact value it was given.
 */
export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion();
  const current = useMotionValue(value);
  const text = useTransform(current, format);

  useEffect(() => {
    const controls = animate(current, value, reduceMotion ? { duration: 0 } : { duration: 1.1, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [current, value, reduceMotion]);

  return (
    <motion.span className={className} aria-label={format(value)}>
      {text}
    </motion.span>
  );
}
