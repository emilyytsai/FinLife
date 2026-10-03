// One requestAnimationFrame loop shared by every point cloud on the page. Stops when nothing is subscribed.

type Frame = (seconds: number) => void;

const frames = new Set<Frame>();
let handle = 0;

function loop(now: number) {
  const seconds = now / 1000;
  frames.forEach((frame) => frame(seconds));
  handle = frames.size > 0 ? requestAnimationFrame(loop) : 0;
}

export function onFrame(frame: Frame): () => void {
  frames.add(frame);
  if (!handle) handle = requestAnimationFrame(loop);
  return () => {
    frames.delete(frame);
    if (frames.size === 0 && handle) {
      cancelAnimationFrame(handle);
      handle = 0;
    }
  };
}
