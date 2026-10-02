"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export type MarkerTone = "event" | "profile";

export interface MarkerHover {
  x: number;
  y: number;
  text: string;
}

export interface EventMarkerProps {
  /** Point on the line, in chart pixels. Recharts' ReferenceDot fills these in. */
  cx?: number;
  cy?: number;
  icon: (size: number) => ReactNode;
  /** "event" = orange ring on the scenario line; "profile" = deep blue ring on the baseline. */
  tone: MarkerTone;
  label: string;
  tooltip: string;
  /** Position in a same-age stack: 0 sits closest to the line. */
  stackIndex: number;
  /** Seconds to wait so the badge lands as the line draws through this age. */
  delay: number;
  compact: boolean;
  /** False on phones and when the label would run into a neighboring badge. The tooltip still has it. */
  showLabel: boolean;
  /** Put the label left of the badge, for markers at the chart's right edge. */
  labelLeft?: boolean;
  onHover: (hover: MarkerHover | null) => void;
}

const LIFT = 22;
const STACK_GAP = 26;

/** Round life-event badge for the timeline: white circle, colored ring, lucide icon inside. */
export function EventMarker({ cx, cy, icon, tone, label, tooltip, stackIndex, delay, compact, showLabel, labelLeft = false, onHover }: EventMarkerProps) {
  const reduceMotion = useReducedMotion();
  if (cx === undefined || cy === undefined || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;

  const diameter = compact ? 18 : 22;
  const radius = diameter / 2;
  const iconSize = compact ? 11 : 13;
  const ring = tone === "event" ? "var(--accent)" : "var(--primary)";
  const badgeY = cy - LIFT - stackIndex * STACK_GAP;
  const show = () => onHover({ x: cx, y: badgeY - radius, text: tooltip });
  const hide = () => onHover(null);
  const fade = reduceMotion ? { duration: 0 } : { duration: 0.25, delay };

  return (
    <g
      role="img"
      aria-label={tooltip}
      tabIndex={0}
      className="cursor-default outline-none"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onClick={show}
    >
      <title>{tooltip}</title>
      {stackIndex === 0 && (
        <motion.g initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={fade}>
          <line x1={cx} y1={cy} x2={cx} y2={badgeY + radius} stroke={ring} strokeWidth={1.5} strokeOpacity={0.5} />
          <circle cx={cx} cy={cy} r={3} fill={ring} />
        </motion.g>
      )}
      <motion.g
        initial={reduceMotion ? false : { scale: 0, y: -24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 18, delay }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        <circle cx={cx} cy={badgeY} r={radius} fill="var(--surface)" stroke={ring} strokeWidth={2} />
        <g transform={`translate(${cx - iconSize / 2} ${badgeY - iconSize / 2})`} color={ring}>
          {icon(iconSize)}
        </g>
      </motion.g>
      {showLabel && (
        <motion.text
          x={labelLeft ? cx - radius - 4 : cx + radius + 4}
          y={badgeY + 4}
          textAnchor={labelLeft ? "end" : "start"}
          fontSize={11}
          fontWeight={600}
          fill="var(--ink)"
          stroke="var(--canvas)"
          strokeWidth={3}
          paintOrder="stroke"
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={fade}
        >
          {label}
        </motion.text>
      )}
    </g>
  );
}
