// 3D point-cloud models for the LiDAR asset library. Pure geometry: each model is a flat Float32Array of
// [x, y, z, weight] per point, y up, roughly inside a unit cube centered on the origin. Weight (0..1) scales a
// point's brightness, so edges can read stronger than surfaces. No financial data or math here.

export type Cloud = Float32Array;

type Vec = [number, number, number];

/** Small deterministic random numbers, so models are identical on every load. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

class Builder {
  private points: number[] = [];
  constructor(readonly random: () => number) {}

  add(x: number, y: number, z: number, w = 1) {
    this.points.push(x, y, z, w);
  }

  /** Evenly spaced points along a segment. */
  line(a: Vec, b: Vec, step: number, w = 1) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const n = Math.max(1, Math.round(length / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.add(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, w);
    }
  }

  polyline(points: Vec[], step: number, w = 1, closed = false) {
    for (let i = 0; i < points.length - (closed ? 0 : 1); i++) this.line(points[i], points[(i + 1) % points.length], step, w);
  }

  /** Points on an ellipsoid's surface (random directions, so it reads as scanned, not gridded). */
  ellipsoid(c: Vec, r: Vec, n: number, w = 1) {
    for (let i = 0; i < n; i++) {
      const u = this.random() * 2 - 1;
      const theta = this.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      this.add(c[0] + r[0] * s * Math.cos(theta), c[1] + r[1] * u, c[2] + r[2] * s * Math.sin(theta), w);
    }
  }

  /** Points on the upper half of an ellipsoid: a rounded cap. */
  dome(c: Vec, r: Vec, n: number, w = 1) {
    for (let i = 0; i < n; i++) {
      const u = this.random();
      const theta = this.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      this.add(c[0] + r[0] * s * Math.cos(theta), c[1] + r[1] * u, c[2] + r[2] * s * Math.sin(theta), w);
    }
  }

  /** Points on a tapered tube between two points (limbs, torsos). */
  tube(a: Vec, b: Vec, ra: Vec2, rb: Vec2, n: number, w = 1) {
    for (let i = 0; i < n; i++) {
      const t = this.random();
      const theta = this.random() * Math.PI * 2;
      const rx = ra[0] + (rb[0] - ra[0]) * t;
      const rz = ra[1] + (rb[1] - ra[1]) * t;
      this.add(a[0] + (b[0] - a[0]) * t + rx * Math.cos(theta), a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t + rz * Math.sin(theta), w);
    }
  }

  /** A circle in the plane given by two axes. */
  circle(c: Vec, r: number, axisA: Vec, axisB: Vec, step: number, w = 1) {
    const n = Math.max(8, Math.round((Math.PI * 2 * r) / step));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const ca = Math.cos(a) * r;
      const sa = Math.sin(a) * r;
      this.add(c[0] + axisA[0] * ca + axisB[0] * sa, c[1] + axisA[1] * ca + axisB[1] * sa, c[2] + axisA[2] * ca + axisB[2] * sa, w);
    }
  }

  /** The 12 edges of an axis-aligned box. */
  boxEdges(min: Vec, max: Vec, step: number, w = 1) {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const c: Vec[] = [
      [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
      [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
    ];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [a, b] of edges) this.line(c[a], c[b], step, w);
  }

  build(): Cloud {
    return new Float32Array(this.points);
  }
}

type Vec2 = [number, number];

/** Normalize a model to fit inside [-1, 1] on its longest side, centered. */
function normalize(cloud: Cloud): Cloud {
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < cloud.length; i += 4) {
    minX = Math.min(minX, cloud[i]); maxX = Math.max(maxX, cloud[i]);
    minY = Math.min(minY, cloud[i + 1]); maxY = Math.max(maxY, cloud[i + 1]);
    minZ = Math.min(minZ, cloud[i + 2]); maxZ = Math.max(maxZ, cloud[i + 2]);
  }
  const scale = 2 / Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1e-6);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (minZ + maxZ) / 2;
  const out = new Float32Array(cloud.length);
  for (let i = 0; i < cloud.length; i += 4) {
    out[i] = (cloud[i] - cx) * scale;
    out[i + 1] = (cloud[i + 1] - cy) * scale;
    out[i + 2] = (cloud[i + 2] - cz) * scale;
    out[i + 3] = cloud[i + 3];
  }
  return out;
}

// ---------- Tangible assets ----------

/** Approximate surface area of an ellipsoid (Knud Thomsen's formula). */
function ellipsoidArea([a, b, c]: Vec): number {
  const p = 1.6;
  return 4 * Math.PI * (((a * b) ** p + (a * c) ** p + (b * c) ** p) / 3) ** (1 / p);
}

/** Side area of a tapered tube with elliptical ends. */
function tubeArea(a: Vec, b: Vec, ra: Vec2, rb: Vec2): number {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  return Math.PI * (ra[0] + ra[1] + rb[0] + rb[1]) * 0.5 * length;
}

interface MannequinShape {
  /** Half-width from the center to each shoulder joint. */
  shoulder: number;
  /** Head size relative to an adult's. */
  head: number;
  /** Leg length relative to an adult's. */
  legs: number;
  /** Dots per unit of surface area. */
  density: number;
  seed: number;
}

/**
 * A featureless artist's mannequin: an egg-shaped head, a chest, waist and pelvis as separate soft segments, thick
 * limbs, and ball joints at the elbows, hips and knees. Mitten hands and simple feet; no face, hair,
 * fingers, or toes. Dots are spread by surface area so every part reads at the same density. Feet near y = -1.
 */
function mannequin({ shoulder, head, legs, density, seed }: MannequinShape): Cloud {
  const b = new Builder(seeded(seed));
  const ellipsoid = (c: Vec, r: Vec, w = 0.85) => b.ellipsoid(c, r, Math.max(6, Math.round(ellipsoidArea(r) * density)), w);
  const tube = (from: Vec, to: Vec, ra: Vec2, rb: Vec2, w = 0.85) =>
    b.tube(from, to, ra, rb, Math.max(6, Math.round(tubeArea(from, to, ra, rb) * density)), w);
  const joint = (c: Vec, r: number) => ellipsoid(c, [r, r, r], 1);

  // Legs set the hip height; the torso is built up from there.
  const knee = -1 + 0.47 * legs;
  const hip = -1 + 0.94 * legs;
  const up = (y: number) => hip + y;

  for (const s of [-1, 1]) {
    ellipsoid([s * 0.11, -0.97, 0.035], [0.055, 0.032, 0.1]);
    tube([s * 0.11, -0.94, 0], [s * 0.115, knee - 0.03, 0], [0.045, 0.048], [0.06, 0.064]);
    joint([s * 0.115, knee, 0], 0.066);
    tube([s * 0.115, knee + 0.03, 0], [s * 0.118, hip - 0.03, 0], [0.066, 0.07], [0.09, 0.095]);
    joint([s * 0.118, hip - 0.01, 0], 0.088);
  }

  ellipsoid([0, up(0.02), 0], [0.2, 0.12, 0.13]);
  tube([0, up(0.1), 0], [0, up(0.24), 0], [0.17, 0.11], [0.18, 0.115]);
  ellipsoid([0, up(0.41), 0], [shoulder * 0.84, 0.18, 0.125]);
  tube([0, up(0.58), 0], [0, up(0.68), 0], [0.048, 0.048], [0.045, 0.045]);
  ellipsoid([0, up(0.68) + 0.13 * head, 0.005], [0.105 * head, 0.135 * head, 0.118 * head]);

  for (const s of [-1, 1]) {
    // Arms sit just inside the shoulder width, so the frame reads narrow while the chest keeps its size.
    const x = s * (shoulder - 0.015);
    // No shoulder ball: the upper arm runs out of the chest under a rounded cap.
    const cap: Vec = [0.058, 0.045, 0.06];
    // The cap sits well below the top of the chest, for a relaxed, sloping shoulder.
    b.dome([x - s * 0.004, up(0.475), 0], cap, Math.round((ellipsoidArea(cap) / 2) * density), 0.85);
    tube([x, up(0.475), 0], [x + s * 0.085, up(0.22), 0.01], [0.054, 0.056], [0.047, 0.049]);
    joint([x + s * 0.09, up(0.2), 0.012], 0.05);
    tube([x + s * 0.095, up(0.18), 0.015], [x + s * 0.13, up(-0.07), 0.03], [0.046, 0.048], [0.038, 0.04]);
    ellipsoid([x + s * 0.137, up(-0.14), 0.035], [0.034, 0.066, 0.046]);
  }
  return b.build();
}

export const personCloud = (): Cloud => mannequin({ shoulder: 0.235, head: 1, legs: 1, density: 1500, seed: 11 });
export const spouseCloud = (): Cloud => mannequin({ shoulder: 0.215, head: 0.97, legs: 0.97, density: 1500, seed: 23 });
/** Children: a larger head and shorter legs for their height. Rendered smaller by the component. */
export const childCloud = (variant: 1 | 2 = 1): Cloud =>
  mannequin({ shoulder: 0.22, head: 1.3, legs: variant === 1 ? 0.78 : 0.7, density: 1100, seed: 31 + variant });

/** A gabled house: walls scanned in horizontal lines with real openings for the door and windows. */
export function houseCloud(): Cloud {
  const b = new Builder(seeded(5));
  const [x0, x1, z0, z1, y0, y1] = [-0.9, 0.9, -0.6, 0.6, -1, 0.1];
  const openings = [
    { x: [-0.15, 0.15], y: [-1, -0.5] },
    { x: [-0.66, -0.36], y: [-0.48, -0.2] },
    { x: [0.36, 0.66], y: [-0.48, -0.2] },
  ];
  const inOpening = (x: number, y: number) => openings.some((o) => x > o.x[0] && x < o.x[1] && y > o.y[0] && y < o.y[1]);

  // Wall scan lines.
  for (let y = y0; y <= y1 + 1e-6; y += 0.07) {
    for (let x = x0; x <= x1 + 1e-6; x += 0.045) {
      if (!inOpening(x, y)) b.add(x, y, z1, 0.55);
      b.add(x, y, z0, 0.35);
    }
    for (let z = z0; z <= z1 + 1e-6; z += 0.045) {
      b.add(x0, y, z, 0.45);
      b.add(x1, y, z, 0.45);
    }
  }
  b.boxEdges([x0, y0, z0], [x1, y1, z1], 0.025, 1);
  for (const o of openings) {
    b.polyline([[o.x[0], o.y[0], z1], [o.x[0], o.y[1], z1], [o.x[1], o.y[1], z1], [o.x[1], o.y[0], z1]], 0.022, 1, true);
  }

  // Gable roof: two planes from the eaves up to a ridge along x.
  const ridgeY = 0.78;
  for (let t = 0; t <= 1 + 1e-6; t += 0.08) {
    const y = y1 + (ridgeY - y1) * t;
    const z = (z1 + 0.1) * (1 - t);
    for (let x = x0 - 0.1; x <= x1 + 0.1 + 1e-6; x += 0.045) {
      b.add(x, y, z, 0.6);
      b.add(x, y, -z, 0.4);
    }
  }
  b.line([x0 - 0.1, ridgeY, 0], [x1 + 0.1, ridgeY, 0], 0.025, 1);
  for (const x of [x0 - 0.1, x1 + 0.1]) b.polyline([[x, y1, z1 + 0.1], [x, ridgeY, 0], [x, y1, z0 - 0.1]], 0.025, 1);
  b.boxEdges([0.4, 0.35, -0.25], [0.58, 0.95, -0.08], 0.03, 0.8);
  return normalize(b.build());
}

/** A vehicle from a side profile extruded across its width, with wheels. */
function vehicle(profile: Vec2[], wheelR: number, wheelX: number, seed: number): Cloud {
  const b = new Builder(seeded(seed));
  const halfW = 0.42;
  const outline = profile.map(([x, y]) => [x, y] as Vec2);
  for (const z of [-halfW, halfW]) b.polyline(outline.map(([x, y]) => [x, y, z] as Vec), 0.025, 1, true);
  // Surface scan rows across the width, following the top of the profile.
  for (let z = -halfW; z <= halfW + 1e-6; z += 0.07) {
    b.polyline(outline.slice(1, -1).map(([x, y]) => [x, y, z] as Vec), 0.05, 0.4);
  }
  for (const [x, y] of outline) b.line([x, y, -halfW], [x, y, halfW], 0.04, 0.8);
  // Side windows: the cabin inset.
  const cabin = profile.filter(([, y]) => y > 0.02);
  if (cabin.length >= 2) {
    const inset: Vec2[] = cabin.map(([x, y]) => [x * 0.86, y - 0.05]);
    const base = 0.02;
    for (const z of [-halfW - 0.005, halfW + 0.005]) {
      b.polyline([[inset[0][0], base, z], ...inset.map(([x, y]) => [x, y, z] as Vec), [inset[inset.length - 1][0], base, z]], 0.025, 0.9, true);
    }
  }
  const wheelY = Math.min(...profile.map(([, y]) => y));
  for (const x of [-wheelX, wheelX]) {
    for (const z of [-halfW - 0.02, halfW + 0.02]) {
      b.circle([x, wheelY, z], wheelR, [1, 0, 0], [0, 1, 0], 0.025, 1);
      b.circle([x, wheelY, z], wheelR * 0.45, [1, 0, 0], [0, 1, 0], 0.03, 0.7);
    }
  }
  return normalize(b.build());
}

export const sedanCloud = (): Cloud =>
  vehicle([[-1, -0.3], [-1, -0.04], [-0.62, 0.02], [-0.36, 0.3], [0.32, 0.3], [0.6, 0.03], [1, -0.02], [1, -0.3]], 0.17, 0.62, 41);
export const suvCloud = (): Cloud =>
  vehicle([[-1, -0.28], [-1, 0.12], [-0.82, 0.16], [-0.66, 0.5], [0.56, 0.52], [0.76, 0.16], [1, 0.1], [1, -0.28]], 0.21, 0.6, 43);

// ---------- Quantifiable assets ----------

function cardBase(b: Builder) {
  const [w, h, r] = [1, 0.63, 0.08];
  const corners: Vec2[] = [];
  const arc = (cx: number, cy: number, from: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = from + (i / 6) * (Math.PI / 2);
      corners.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  arc(w - r, h - r, 0);
  arc(-w + r, h - r, Math.PI / 2);
  arc(-w + r, -h + r, Math.PI);
  arc(w - r, -h + r, (3 * Math.PI) / 2);
  for (const z of [-0.02, 0.02]) b.polyline(corners.map(([x, y]) => [x, y, z] as Vec), 0.022, 1, true);
  for (let y = -h + 0.1; y <= h - 0.1; y += 0.09) for (let x = -w + 0.1; x <= w - 0.1; x += 0.09) b.add(x, y, 0, 0.12);
  // Chip.
  b.polyline([[-0.75, 0.05, 0.02], [-0.45, 0.05, 0.02], [-0.45, 0.28, 0.02], [-0.75, 0.28, 0.02]], 0.02, 1, true);
  b.line([-0.75, 0.165, 0.02], [-0.45, 0.165, 0.02], 0.03, 0.7);
  // Number groups.
  for (let g = 0; g < 4; g++) for (let i = 0; i < 4; i++) b.add(-0.78 + g * 0.42 + i * 0.07, -0.22, 0.02, 0.9);
  b.line([-0.78, -0.42, 0.02], [-0.2, -0.42, 0.02], 0.035, 0.6);
}

/** Debit card: the card outline, chip, and number groups. */
export function debitCardCloud(): Cloud {
  const b = new Builder(seeded(51));
  cardBase(b);
  b.polyline([[0.55, -0.48, 0.02], [0.85, -0.48, 0.02], [0.85, -0.3, 0.02], [0.55, -0.3, 0.02]], 0.025, 0.7, true);
  return normalize(b.build());
}

/** Credit card: the same card with contactless arcs. */
export function creditCardCloud(): Cloud {
  const b = new Builder(seeded(53));
  cardBase(b);
  for (const r of [0.08, 0.15, 0.22]) {
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 4 + (i / 10) * (Math.PI / 2);
      b.add(0.55 + Math.cos(a) * r, 0.2 + Math.sin(a) * r, 0.02, 1);
    }
  }
  return normalize(b.build());
}

/** Cash: a stack of bills, each a thin scanned slab. */
export function cashStackCloud(): Cloud {
  const b = new Builder(seeded(57));
  for (let i = 0; i < 7; i++) {
    const y = -0.5 + i * 0.13;
    const dx = (b.random() - 0.5) * 0.08;
    b.boxEdges([-0.9 + dx, y, -0.45], [0.9 + dx, y + 0.05, 0.45], 0.03, 0.9);
    for (let x = -0.85; x <= 0.85; x += 0.1) b.add(x + dx, y + 0.05, 0, 0.35);
  }
  return normalize(b.build());
}

/** 401(k): a network sphere of nodes joined to their nearest neighbors. */
export function networkSphereCloud(): Cloud {
  const b = new Builder(seeded(61));
  const count = 46;
  const nodes: Vec[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    nodes.push([Math.cos(golden * i) * r * 0.9, y * 0.9, Math.sin(golden * i) * r * 0.9]);
  }
  for (const node of nodes) b.ellipsoid(node, [0.035, 0.035, 0.035], 10, 1);
  nodes.forEach((node, i) => {
    const nearest = nodes
      .map((other, j) => ({ j, d: Math.hypot(other[0] - node[0], other[1] - node[1], other[2] - node[2]) }))
      .filter(({ j }) => j > i)
      .sort((a, c) => a.d - c.d)
      .slice(0, 3);
    for (const { j } of nearest) b.line(node, nodes[j], 0.045, 0.45);
  });
  b.ellipsoid([0, 0, 0], [0.22, 0.22, 0.22], 60, 0.6);
  return normalize(b.build());
}

/** Savings: a dense, structured lattice cube with bright edges. */
export function savingsCubeCloud(): Cloud {
  const b = new Builder(seeded(67));
  const n = 7;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) b.add(-0.7 + (i / (n - 1)) * 1.4, -0.7 + (j / (n - 1)) * 1.4, -0.7 + (k / (n - 1)) * 1.4, 0.5);
  b.boxEdges([-0.7, -0.7, -0.7], [0.7, 0.7, 0.7], 0.03, 1);
  return normalize(b.build());
}

/** Stock portfolio: a rippling surface chart. The shape is decorative, not market data. */
export function waveChartCloud(): Cloud {
  const b = new Builder(seeded(71));
  for (let zi = 0; zi <= 12; zi++) {
    const z = -0.6 + zi * 0.1;
    for (let xi = 0; xi <= 40; xi++) {
      const x = -1 + xi * 0.05;
      const y = 0.22 * Math.sin(x * 3.2 + z * 2) + 0.12 * Math.sin(x * 7.5 - z) + x * 0.18;
      b.add(x, y, z, zi === 6 ? 1 : 0.45);
    }
  }
  return normalize(b.build());
}

/** Other investments: floating market nodes of different sizes, tethered to a center. */
export function marketNodesCloud(): Cloud {
  const b = new Builder(seeded(73));
  const nodes: [Vec, number][] = [
    [[0.6, 0.4, 0.2], 0.16],
    [[-0.55, 0.5, -0.3], 0.12],
    [[-0.4, -0.45, 0.4], 0.18],
    [[0.5, -0.5, -0.4], 0.1],
    [[0.05, 0.75, 0.35], 0.08],
    [[-0.8, 0, 0.1], 0.09],
  ];
  b.ellipsoid([0, 0, 0], [0.12, 0.12, 0.12], 70, 1);
  for (const [c, r] of nodes) {
    b.ellipsoid(c, [r, r, r], Math.round(900 * r * r) + 20, 0.9);
    b.line([0, 0, 0], c, 0.06, 0.35);
  }
  return normalize(b.build());
}
