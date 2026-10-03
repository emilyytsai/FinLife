import type { ReactNode, SVGProps } from "react";

// Solid, ISO-style pictograms on a 24x24 grid. Cut-outs (doors, windows, stripes) use fill-rule evenodd;
// small details on top use the surface color. Original drawings, no brand marks.

export type PictogramName =
  | "user"
  | "child"
  | "palm"
  | "house"
  | "building"
  | "baby"
  | "briefcase"
  | "piggy"
  | "car"
  | "card";

type PictogramProps = Omit<SVGProps<SVGSVGElement>, "ref" | "name"> & { name: PictogramName; size?: number; slash?: boolean };

const HOLE = "var(--surface)";

const SHAPES: Record<PictogramName, ReactNode> = {
  // Full-body standing figure: head, torso, arms apart from the body, two legs.
  user: (
    <>
      <circle cx="12" cy="3" r="2.6" />
      <path d="M9.4 6.2h5.2a2.6 2.6 0 0 1 2.6 2.6V14a1 1 0 0 1-2 0V9.2h-.8V22a1.1 1.1 0 0 1-2.2 0v-6.6h-.4V22a1.1 1.1 0 0 1-2.2 0V9.2h-.8V14a1 1 0 0 1-2 0V8.8a2.6 2.6 0 0 1 2.6-2.6z" />
    </>
  ),
  // Same baseline as "user", about two-thirds the height, so a family reads as one row of figures.
  child: (
    <>
      <circle cx="12" cy="10.6" r="1.9" />
      <path d="M10.6 13h2.8a1.6 1.6 0 0 1 1.6 1.6v3.8a.55.55 0 0 1-1.1 0V15h-.5v7.4a.65.65 0 0 1-1.3 0v-3.8h-.2v3.8a.65.65 0 0 1-1.3 0V15h-.5v3.4a.55.55 0 0 1-1.1 0v-3.8a1.6 1.6 0 0 1 1.6-1.6z" />
    </>
  ),
  // Apartment tower with a rooftop, windows, an awning, and a door, for renting.
  building: (
    <>
      <path d="M8 .8h8v1.6H8z" />
      <path
        fillRule="evenodd"
        d="M4.5 3.2A1.2 1.2 0 0 1 5.7 2h12.6a1.2 1.2 0 0 1 1.2 1.2V22h-15zM7.2 5h2.6v2.4H7.2zM10.7 5h2.6v2.4h-2.6zM14.2 5h2.6v2.4h-2.6zM7.2 9.2h2.6v2.4H7.2zM10.7 9.2h2.6v2.4h-2.6zM14.2 9.2h2.6v2.4h-2.6zM7.2 13.4h2.6v2.4H7.2zM14.2 13.4h2.6v2.4h-2.6zM10.4 22v-3.8h3.2V22z"
      />
      <path d="M2.5 22h19v1.4h-19z" />
      <path d="M9.6 16.6h4.8l.8 1.2H8.8z" fill={HOLE} />
    </>
  ),
  palm: (
    <>
      <path d="M10.6 10c1.6 3.9 1.9 7.9 1 12.2h3.2c.8-4.4.3-8.5-1.4-12.2z" />
      <path d="M12.5 9.5C9.5 4.8 4.8 4 1.5 7.8c1.5-.3 3.2-.2 4.8.5-1.5.6-2.7 1.8-3.5 3.8 3-2.8 6.3-3.6 9.7-2.6z" />
      <path d="M12.5 9.5c3-4.7 7.7-5.5 11-1.7-1.5-.3-3.2-.2-4.8.5 1.5.6 2.7 1.8 3.5 3.8-3-2.8-6.3-3.6-9.7-2.6z" />
      <path d="M12.5 9.5c-.8-3.4.5-6.6 3.9-8.4-.2 2.8-1.3 5.7-3.9 8.4z" />
      <path d="M12.5 9.5C11 6 8.5 3.8 5 3.6c2.6 1.4 5 3.4 7.5 5.9z" />
      <circle cx="11.3" cy="10.9" r="1.2" />
      <circle cx="13.7" cy="11.1" r="1.2" />
      <path d="M4 23.5a8 2.8 0 0 1 16 0z" />
    </>
  ),
  house: (
    <>
      <path d="M16 3.2h3v5.3l-3-2.6z" />
      <path
        fillRule="evenodd"
        d="M12 1.8 1.2 11.2h3V22h15.6V11.2h3zM10 22v-6.5h4V22zM6.5 13.2h2.6v2.6H6.5zM14.9 13.2h2.6v2.6h-2.6z"
      />
      <path d="M1.5 22h21v1.4h-21z" />
    </>
  ),
  baby: (
    <>
      <path d="M11 3a8 8 0 0 0-8 8h8z" />
      <path d="M2.5 12h18.5a5 5 0 0 1-5 5H7.5a5 5 0 0 1-5-5z" />
      <path d="M19.4 12.5V5.6A1.6 1.6 0 0 1 21 4h2.3v2.4h-1.5v6.1z" />
      <circle cx="7" cy="20.3" r="2.4" />
      <circle cx="16.5" cy="20.3" r="2.4" />
    </>
  ),
  briefcase: (
    <>
      <path d="M8.3 6.5V4.6a2.2 2.2 0 0 1 2.2-2.2h3a2.2 2.2 0 0 1 2.2 2.2v1.9h-2.2V4.6h-3v1.9z" />
      <path
        fillRule="evenodd"
        d="M4.5 6.5h15A2.5 2.5 0 0 1 22 9v10a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 19V9a2.5 2.5 0 0 1 2.5-2.5zM2 12.6h20v1.3H2z"
      />
      <rect x="10.3" y="11.6" width="3.4" height="3.3" rx=".6" />
    </>
  ),
  piggy: (
    <>
      <ellipse cx="11.5" cy="13.2" rx="8.3" ry="6.6" />
      <path d="M18.6 10.8h3.2a1.2 1.2 0 0 1 1.2 1.2v2.6a1.2 1.2 0 0 1-1.2 1.2h-3.2z" />
      <path d="M5.8 17.4h3.2v4.4H5.8zM14 17.4h3.2v4.4H14z" />
      <path d="M3.6 12.2 1 10.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="8.8" y="8.4" width="5.4" height="1.5" rx=".75" fill={HOLE} />
      <circle cx="16.4" cy="11.4" r="1" fill={HOLE} />
    </>
  ),
  car: (
    <>
      <path
        fillRule="evenodd"
        d="M1.5 16.3v-3.4a1.6 1.6 0 0 1 1.3-1.6l3.1-.6 2.6-3.7a2.2 2.2 0 0 1 1.8-.9h6.1a2.2 2.2 0 0 1 1.7.8l3 3.7h.7a2.2 2.2 0 0 1 2.2 2.2v3.5a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1zM9.8 8.3h2.6v2.8H7.9zM13.8 8.3h2.3l2.2 2.8h-4.5z"
      />
      <circle cx="6.8" cy="17.6" r="2.7" />
      <circle cx="17.2" cy="17.6" r="2.7" />
      <circle cx="6.8" cy="17.6" r="1" fill={HOLE} />
      <circle cx="17.2" cy="17.6" r="1" fill={HOLE} />
    </>
  ),
  card: (
    <path
      fillRule="evenodd"
      d="M4 4.5h16A2.5 2.5 0 0 1 22.5 7v10a2.5 2.5 0 0 1-2.5 2.5H4A2.5 2.5 0 0 1 1.5 17V7A2.5 2.5 0 0 1 4 4.5zM1.5 8.2h21v2.7h-21zM4.5 14.2h5.5v2.2H4.5z"
    />
  ),
};

/**
 * A filled pictogram. `slash` adds the red "no" bar used for job loss.
 * In SVG charts, wrap it in a group with a surface-colored stroke to get a halo (see EventMarker).
 */
export function Pictogram({ name, size = 24, slash = false, ...rest }: PictogramProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" {...rest}>
      {SHAPES[name]}
      {slash && (
        <>
          <path d="M3 3 21 21" stroke={HOLE} strokeWidth="5.5" strokeLinecap="round" />
          <path d="M3 3 21 21" stroke="var(--alert)" strokeWidth="2.8" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
