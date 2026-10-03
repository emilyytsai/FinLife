"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface AnimatedPlaceholderProps {
  /** Lines to cycle through. */
  texts: string[];
  /** False shows the first line, fully typed and still (e.g. while a question is running). */
  cycling?: boolean;
  className?: string;
}

type Phase = "typing" | "holding" | "erasing";

/** Typing pace: a little uneven, like a person. Erasing is quicker; the hold gives time to read. */
const TYPE_MIN_MS = 55;
const TYPE_JITTER_MS = 45;
const ERASE_MS = 32;
const HOLD_MS = 2500;
/** With reduced motion: whole lines, swapped on this interval. */
const SWAP_MS = 3500;

/**
 * A typewriter placeholder: types each line character by character behind a blinking cursor, holds it, backspaces it,
 * and moves on. Unmounting resets it, so it starts fresh each time it reappears. Purely visual: hidden from screen readers.
 */
export function AnimatedPlaceholder({ texts, cycling = true, className }: AnimatedPlaceholderProps) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [length, setLength] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const text = texts[index % texts.length] ?? "";
  const still = !cycling || reduceMotion;

  useEffect(() => {
    if (!cycling) return;
    if (reduceMotion) {
      const timer = setTimeout(() => setIndex((i) => (i + 1) % texts.length), SWAP_MS);
      return () => clearTimeout(timer);
    }
    let delay: number;
    let step: () => void;
    if (phase === "typing") {
      delay = TYPE_MIN_MS + Math.random() * TYPE_JITTER_MS;
      step = () => (length < text.length ? setLength(length + 1) : setPhase("holding"));
    } else if (phase === "holding") {
      delay = HOLD_MS;
      step = () => setPhase("erasing");
    } else {
      delay = ERASE_MS;
      step = () => {
        if (length > 0) {
          setLength(length - 1);
        } else {
          setIndex((i) => (i + 1) % texts.length);
          setPhase("typing");
        }
      };
    }
    const timer = setTimeout(step, delay);
    return () => clearTimeout(timer);
  }, [cycling, reduceMotion, phase, length, text.length, texts.length, index]);

  return (
    <span aria-hidden="true" className={`pointer-events-none block overflow-hidden whitespace-pre ${className ?? ""}`}>
      {still ? text : text.slice(0, length)}
      {!still && <span className="caret-blink ml-px inline-block h-[1.15em] w-px translate-y-[0.2em] bg-current" />}
    </span>
  );
}
