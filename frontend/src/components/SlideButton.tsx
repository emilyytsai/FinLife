"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { ArrowRight } from "lucide-react";

interface SlideButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  /** The color the circle fills the button with on hover. Defaults to the theme's primary. */
  fill?: string;
  /** Text and arrow color on top of the fill. Defaults to the page background, the opposite of primary. */
  onFill?: string;
}

/**
 * A button with the sliding-arrow, expanding-circle hover: at rest it keeps its own look (glass, border, colors) with
 * an arrow on the right; on hover a circle grows from the center to fill it with `fill`, the text flips to `onFill`,
 * the right arrow slides out while a second slides in from the left, and the label shifts across.
 * Arrows use currentColor, so they always match the text. Styles: .slide-btn in globals.css.
 */
export function SlideButton({ children, fill, onFill, className = "", style, ...rest }: SlideButtonProps) {
  const colors = { ...(fill ? { "--btn-fill": fill } : {}), ...(onFill ? { "--btn-on-fill": onFill } : {}) } as CSSProperties;
  return (
    <button {...rest} className={`slide-btn ${className}`} style={{ ...colors, ...style }}>
      <ArrowRight className="arr-2" aria-hidden="true" />
      <span className="slide-text">{children}</span>
      <span className="circle" aria-hidden="true" />
      <ArrowRight className="arr-1" aria-hidden="true" />
    </button>
  );
}
