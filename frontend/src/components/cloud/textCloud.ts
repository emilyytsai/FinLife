import type { Cloud } from "@/lib/pointcloud/models";

// Turns a word into a 3D point cloud: the browser draws it in the page's font, then the filled pixels are sampled into
// points on a front and back face, with the letter edges brighter (like the other models' edges). Browser-only.

const SAMPLE_PX = 220; // font size used for sampling
const STEP = 4; // sample every few pixels
const DEPTH = 0.07; // half-thickness of the extruded letters, in model units
const NEAR = 0.7; // how far toward the camera the word sits, so its dots render bright

/**
 * Builds a cloud for `parts` drawn side by side as one word. Points for the first part come first, so a renderer can
 * color them separately (PointCloud's accentCount). Returns the cloud and how many points belong to the first part.
 */
export function textCloud(parts: string[], fontFamily: string, weight = 700): { cloud: Cloud; accentCount: number } {
  const font = `${weight} ${SAMPLE_PX}px ${fontFamily}`;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const widths = parts.map((part) => measure.measureText(part).width);
  const width = Math.ceil(widths.reduce((sum, w) => sum + w, 0)) + 20;
  const height = Math.ceil(SAMPLE_PX * 1.3);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.font = font;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";

  const points: number[] = [];
  let accentCount = 0;
  let x = 10;
  parts.forEach((part, index) => {
    ctx.clearRect(0, 0, width, height);
    ctx.fillText(part, x, height / 2);
    const data = ctx.getImageData(0, 0, width, height).data;
    const filled = (px: number, py: number) => px >= 0 && py >= 0 && px < width && py < height && data[(py * width + px) * 4 + 3] > 128;
    for (let py = 0; py < height; py += STEP) {
      for (let px = 0; px < width; px += STEP) {
        if (!filled(px, py)) continue;
        const edge = !filled(px - STEP, py) || !filled(px + STEP, py) || !filled(px, py - STEP) || !filled(px, py + STEP);
        // Model space: x to the right, y up, centered later.
        const mx = px / SAMPLE_PX;
        const my = -py / SAMPLE_PX;
        points.push(mx, my, DEPTH, edge ? 1 : 0.85);
        if (edge || (px / STEP + py / STEP) % 3 === 0) points.push(mx, my, -DEPTH, edge ? 0.85 : 0.5);
        if (edge) points.push(mx, my, 0, 0.6); // a seam between the faces, so the sides read as solid
      }
    }
    if (index === 0) accentCount = points.length / 4;
    x += widths[index];
  });

  return { cloud: centered(new Float32Array(points)), accentCount };
}

/** Centers the cloud and scales it so its width is 2 (the shape fits inside [-1, 1] horizontally). */
function centered(cloud: Cloud): Cloud {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < cloud.length; i += 4) {
    minX = Math.min(minX, cloud[i]);
    maxX = Math.max(maxX, cloud[i]);
    minY = Math.min(minY, cloud[i + 1]);
    maxY = Math.max(maxY, cloud[i + 1]);
  }
  const scale = 2 / Math.max(maxX - minX, 1e-6);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (let i = 0; i < cloud.length; i += 4) {
    cloud[i] = (cloud[i] - cx) * scale;
    cloud[i + 1] = (cloud[i + 1] - cy) * scale;
    // Nudged toward the camera: a flat word facing the viewer would otherwise shade as "middle distance" and look dim.
    cloud[i + 2] = cloud[i + 2] * scale + NEAR;
  }
  return cloud;
}
