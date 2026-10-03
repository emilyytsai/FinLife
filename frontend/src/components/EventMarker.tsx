"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";

export type MarkerTone = "event" | "profile";

export interface MarkerHover {
  x: number;
  y: number;
  text: string;
}

/** Pictogram size in pixels. About 2.5-2.75x the old 13px/11px badge icons. */
export const MARKER_PX = { desktop: 36, phone: 26 } as const;
/** Gap between the line and the bottom of the lowest pictogram. */
export const MARKER_STEM = 8;
/** Space between stacked pictograms at the same age. */
export const MARKER_STACK_GAP = 6;

export interface EventMarkerProps {
  /** Point on the line, in chart pixels. Recharts' ReferenceDot fills these in. */
  cx?: number;
  cy?: number;
  icon: (size: number) => ReactNode;
  /** Stem and dot color: "event" = orange on the scenario line; "profile" = deep blue on the baseline. */
  tone: MarkerTone;
  label: string;
  tooltip: string;
  /** Position in a same-age stack: 0 sits closest to the line. */
  stackIndex: number;
  /** Seconds to wait so the pictogram lands as the line draws through this age. */
  delay: number;
  compact: boolean;
  /** False on phones and when the label would run into a neighboring pictogram. The tooltip still has it. */
  showLabel: boolean;
  /** Put the label left of the pictogram, for markers at the chart's right edge. */
  labelLeft?: boolean;
  onHover: (hover: MarkerHover | null) => void;
}

/** Solid life-event pictogram standing above its point on the timeline. */
export function EventMarker({
  cx,
  cy,
  icon,
  tone,
  label,
  tooltip,
  stackIndex,
  delay,
  compact,
  showLabel,
  labelLeft = false,
  onHover,
}: EventMarkerProps) {
  const reduceMotion = useReducedMotion();
  if (cx === undefined || cy === undefined || !Number.isFinite(cx) || !Number.isFinite(cy)) return null;

  const size = compact ? MARKER_PX.phone : MARKER_PX.desktop;
  const half = size / 2;
  const color = tone === "event" ? "var(--accent)" : "var(--primary)";
  const centerY = cy - MARKER_STEM - half - stackIndex * (size + MARKER_STACK_GAP);
  const show = () => onHover({ x: cx, y: centerY - half, text: tooltip });
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
          <line x1={cx} y1={cy} x2={cx} y2={cy - MARKER_STEM} stroke={color} strokeWidth={2} />
          <circle cx={cx} cy={cy} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={1.5} />
        </motion.g>
      )}
      <motion.g
        initial={reduceMotion ? false : { scale: 0, y: -24, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 18, delay }}
        style={{ transformBox: "fill-box", transformOrigin: "center" }}
      >
        {/* Transparent box so the whole square is hoverable, not just the filled shapes. */}
        <rect x={cx - half} y={centerY - half} width={size} height={size} fill="transparent" />
        {/* The surface-colored stroke, painted under each fill, gives the pictogram a halo over grid lines. */}
        <g
          transform={`translate(${cx - half} ${centerY - half})`}
          color="var(--ink)"
          stroke="var(--surface)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {icon(size)}
        </g>
      </motion.g>
      {showLabel && (
        <motion.text
          x={labelLeft ? cx - half - 4 : cx + half + 4}
          y={centerY + 4}
          textAnchor={labelLeft ? "end" : "start"}
          fontSize={12}
          fontWeight={700}
          fill="var(--ink)"
          stroke="var(--surface)"
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
