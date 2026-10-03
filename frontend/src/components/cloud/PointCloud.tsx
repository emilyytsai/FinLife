"use client";

import { useEffect, useRef } from "react";
import type { Cloud } from "@/lib/pointcloud/models";
import { onFrame } from "@/lib/pointcloud/ticker";
import { useRevealOpen } from "@/components/cloud/RevealGate";

export type CloudMotion = "spin" | "sway";

interface PointCloudProps {
  cloud: Cloud;
  /** spin: a slow full turn. sway: a gentle back-and-forth around `angle`, so the front stays readable. */
  motion?: CloudMotion;
  /** Resting yaw in radians (sway) or starting yaw (spin). */
  angle?: number;
  /** Radians per second for spin. */
  speed?: number;
  /** Fixed tilt toward the viewer, in radians. */
  tilt?: number;
  /** Shifts the twinkle and bob timing so neighbors don't move in lockstep. */
  phase?: number;
  /** Multiplies the dot size. */
  dotSize?: number;
  /** Scan the model in from the bottom up when it first appears. */
  reveal?: boolean;
  /** Sway half-range in radians (sway motion). Defaults to SWAY. */
  sway?: number;
  /** The first this-many points use the accent palette (--fin-dot-*), e.g. the "Fin" of the title. */
  accentCount?: number;
  className?: string;
}

const CAMERA_DISTANCE = 4;
const REVEAL_SECONDS = 1.3;
/** Sway half-range in radians, and how far models bob up and down (model units). */
const SWAY = 0.5;
const BOB = 0.03;
/** Dot colors from far to near, read from the theme (globals.css: --dot-far/mid/near, or --fin-dot-far/mid/near). */
function themeShades(prefix = "--dot"): string[] {
  const style = getComputedStyle(document.documentElement);
  return ["far", "mid", "near"].map((depth) => style.getPropertyValue(`${prefix}-${depth}`).trim() || "#ffffff");
}

/**
 * A 3D point cloud drawn on a canvas: perspective, depth-shaded dots in the theme's colors that twinkle,
 * hover gently, and turn slowly. One shared animation loop; nothing is drawn while off-screen.
 */
export function PointCloud({
  cloud,
  motion = "spin",
  angle = 0,
  speed = 0.3,
  tilt = 0.18,
  phase = 0,
  dotSize = 1,
  reveal = true,
  sway = SWAY,
  accentCount = 0,
  className,
}: PointCloudProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Closed while the landing screen covers the page: draw nothing yet, so the scan-in happens in view.
  const open = useRevealOpen();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !open) return;

    // Fit: the widest the model gets while turning, and its height.
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 1; i < cloud.length; i += 4) {
      minY = Math.min(minY, cloud[i]);
      maxY = Math.max(maxY, cloud[i]);
    }
    const spanY = Math.max(maxY - minY, 1e-6);
    const midY = (minY + maxY) / 2;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let visible = true;
    let revealStart: number | null = reveal ? null : -Infinity;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let shades = themeShades();
    let accentShades = themeShades("--fin-dot");
    const cosT = Math.cos(tilt);
    const sinT = Math.sin(tilt);

    // Fit: project the model at every pose it can take (the full turn, or the sway range) and measure the outline,
    // perspective included, so nothing is ever cut off at the canvas edge. Measured once, at unit scale.
    const yaws = reduceMotion
      ? [angle]
      : motion === "spin"
        ? Array.from({ length: 24 }, (_, k) => (k / 24) * Math.PI * 2)
        : Array.from({ length: 11 }, (_, k) => angle - sway + (k / 10) * sway * 2);
    let left = Infinity;
    let right = -Infinity;
    let top = -Infinity;
    let bottom = Infinity;
    for (const yaw of yaws) {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      for (let i = 0; i < cloud.length; i += 4) {
        const zr = -cloud[i] * s + cloud[i + 2] * c;
        const yc = cloud[i + 1] - midY;
        const p = CAMERA_DISTANCE / (CAMERA_DISTANCE - (yc * sinT + zr * cosT));
        const px = (cloud[i] * c + cloud[i + 2] * s) * p;
        const py = (yc * cosT - zr * sinT) * p;
        left = Math.min(left, px);
        right = Math.max(right, px);
        top = Math.max(top, py + BOB);
        bottom = Math.min(bottom, py - BOB);
      }
    }
    const offsetX = -(left + right) / 2;
    const offsetY = -(top + bottom) / 2;

    function draw(t: number) {
      if (!ctx || !visible || width === 0) return;
      if (revealStart === null) revealStart = t;
      const shown = reduceMotion ? 1 : Math.min(1, (t - revealStart) / REVEAL_SECONDS);
      const front = minY + shown * spanY;

      const yaw = reduceMotion ? angle : motion === "spin" ? angle + t * speed + phase : angle + Math.sin(t * 0.45 + phase) * sway;
      const cosY = Math.cos(yaw);
      const sinY = Math.sin(yaw);
      const bob = reduceMotion ? 0 : Math.sin(t * 0.9 + phase) * BOB;
      // A small margin leaves room for the dots themselves and their glow.
      const scale = Math.min(width / (right - left), height / (top - bottom)) / 1.06;
      const size = dotSize * dpr;

      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      for (let i = 0, n = 0; i < cloud.length; i += 4, n++) {
        const y = cloud[i + 1];
        if (y > front) continue;
        const x = cloud[i];
        const z = cloud[i + 2];
        const xr = x * cosY + z * sinY;
        const zr = -x * sinY + z * cosY;
        const yc = y - midY;
        const yt = yc * cosT - zr * sinT;
        const zt = yc * sinT + zr * cosT;
        const perspective = CAMERA_DISTANCE / (CAMERA_DISTANCE - zt);
        const sx = (width / 2 + (xr * perspective + offsetX) * scale) * dpr;
        const sy = (height / 2 - (yt * perspective + bob + offsetY) * scale) * dpr;
        const depth = Math.min(1, Math.max(0, (zt + 1) / 2));
        const twinkle = reduceMotion ? 1 : 0.72 + 0.28 * Math.sin(t * (1.2 + (n % 7) * 0.35) + n * 1.7);
        const scanning = shown < 1 && front - y < 0.06;
        ctx.globalAlpha = scanning ? 1 : Math.min(1, (0.2 + 0.8 * depth) * twinkle * (0.35 + 0.65 * cloud[i + 3]));
        ctx.fillStyle = (n < accentCount ? accentShades : shades)[depth < 0.36 ? 0 : depth < 0.62 ? 1 : 2];
        const s = (0.9 + 1.3 * depth) * size;
        ctx.fillRect(sx - s / 2, sy - s / 2, s, s);
      }
      ctx.globalAlpha = 1;
    }

    const resize = new ResizeObserver(([entry]) => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = entry.contentRect.width;
      height = entry.contentRect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      if (reduceMotion) draw(0);
    });
    resize.observe(canvas);
    // Switching between light and dark mode recolors the dots.
    const themeWatch = new MutationObserver(() => {
      shades = themeShades();
      accentShades = themeShades("--fin-dot");
      if (reduceMotion) draw(0);
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const intersect = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    intersect.observe(canvas);

    const stop = reduceMotion ? () => {} : onFrame(draw);
    return () => {
      stop();
      resize.disconnect();
      intersect.disconnect();
      themeWatch.disconnect();
    };
  }, [cloud, motion, angle, speed, tilt, phase, dotSize, reveal, sway, accentCount, open]);

  return <canvas ref={canvasRef} aria-hidden="true" className={`block drop-shadow-[0_0_3px_var(--dot-glow)] ${className ?? ""}`} />;
}
