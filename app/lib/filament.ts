import { rng } from "./tree";

const TAU = Math.PI * 2;

/** The centre and base radius of the ring, in the 0-100 viewBox. The SVG hangs
 *  22% out of the avatar's box on every side (see CastStrip), so the face
 *  itself ends at radius ~35 here: the threads wander from just inside that
 *  edge to well outside it, over the photograph and off it again. */
const CX = 50;
const R = 38;

/** FNV-1a. A name is the seed, so a member keeps their ring across renders and
 *  across server and client — the same reason the organism is grown from a
 *  constant seed and not from Math.random. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The filament round a cast member's face: a few threads that circle the
 * avatar the way the halo tentacles circle a node of the tissue (`tangleAt`
 * in tree.ts). Same recipe in two dimensions — each thread runs a little more
 * than a full turn with its ends left free, and its radius is not a circle but
 * a slow random walk, which is what makes it read as a thread rather than as a
 * drawn ring. Smoothed through the midpoints with quadratics, exactly as the
 * canvas strokes the weave, so there is no corner anywhere.
 *
 * Pure: strings in, strings out, no DOM. Rendered by a server component.
 */
export function filamentPaths(seed: string, threads = 3): string[] {
  const rnd = rng(hash(seed));
  const out: string[] = [];
  for (let t = 0; t < threads; t++) {
    const turns = 1.3 + rnd() * 0.6;
    const start = rnd() * TAU;
    // Every thread slightly elliptical along its own axis, so three of them
    // do not stack into one fat line.
    const squash = 0.9 + rnd() * 0.12;
    const tilt = rnd() * TAU;
    const n = Math.round(14 * turns) + 6;
    const pts: number[] = [];
    let walk = rnd();
    for (let i = 0; i <= n; i++) {
      walk = Math.min(1, Math.max(0, walk + (rnd() - 0.5) * 0.3));
      const th = start + (i / n) * TAU * turns;
      const r = R * (0.82 + 0.28 * walk);
      const ax = Math.cos(th) * r;
      const ay = Math.sin(th) * r * squash;
      pts.push(
        CX + ax * Math.cos(tilt) - ay * Math.sin(tilt),
        CX + ax * Math.sin(tilt) + ay * Math.cos(tilt),
      );
    }
    let d = `M${pts[0].toFixed(1)} ${pts[1].toFixed(1)}`;
    for (let i = 1; i < n; i++) {
      const a = i * 2;
      const mx = (pts[a] + pts[a + 2]) / 2;
      const my = (pts[a + 1] + pts[a + 3]) / 2;
      d += `Q${pts[a].toFixed(1)} ${pts[a + 1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
    }
    d += `L${pts[n * 2].toFixed(1)} ${pts[n * 2 + 1].toFixed(1)}`;
    out.push(d);
  }
  return out;
}
