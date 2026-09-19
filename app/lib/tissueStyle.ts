/**
 * How the tissue is drawn — the ONE definition both renderers read.
 *
 * The Canvas2D path in `components/StromaCanvas.tsx` and the WebGL2 path in
 * `lib/tissueGl.ts` have to put the same image on the screen, so neither owns a
 * table: stroke weights, alphas, the LOD figures, the palettes and the
 * projection all live here. Moved out of the component verbatim, comments and
 * all, when the second renderer arrived.
 *
 * Pure: no canvas, no React, no time.
 */

import { BANDS, STYLES } from "@/app/lib/tree";

export const VIOLA = "96, 57, 255";
export const CARBON = "5, 5, 5";
export const VIOLA_SOLID = "#6039ff";

/** Skip an edge whose projected size is under this many pixels. */
export const LOD_PX = 1.4;

/**
 * One heartbeat over a unit phase: a main contraction at 0 and a smaller second
 * one just behind it — the lub-dub — then rest. Tabled once, because it is read
 * per POINT while the organ beats, and read with linear interpolation: the
 * nearest entry would step the contraction across the radius and put a visible
 * kink on every long strand wherever the index changed.
 */
const BEAT_N = 256;
const BEAT = new Float32Array(BEAT_N);
{
  const bump = (u: number, c: number, w: number) => {
    let d = u - c;
    d -= Math.round(d); // wrap, so the bump at 0 is whole on both sides of the seam
    return Math.exp(-(d * d) / (w * w));
  };
  for (let i = 0; i < BEAT_N; i++) {
    const u = i / BEAT_N;
    BEAT[i] = bump(u, 0, 0.09) + 0.55 * bump(u, 0.16, 0.07);
  }
}
export const beat = (u: number) => {
  const f = (u - Math.floor(u)) * BEAT_N;
  const i = f | 0;
  const t = f - i;
  return BEAT[i] * (1 - t) + BEAT[(i + 1) % BEAT_N] * t;
};

/** The organ's contraction, applied to every world point before projection.
 *  `inv` is 1 / the organ's radius, so `lag` is in cycles centre-to-rim. */
export type Pulse = { x: number; y: number; inv: number; amp: number; phase: number; lag: number };

/** Stroke weight in SCREEN pixels, by style bucket. The gap between 0-2 and 3
 *  is the point: development lines are thick, the connective weft is a
 *  hairline. */
export const WIDTH = [
  2.4,  // LEAD
  1.5,  // MID
  1.15, // OUTER
  1.05, // WEFT
  3.0, 3.0, 3.0,            // CORE  x3
  1.2, 1.2, 1.2, 1.2,       // SHELL x4
  1.1,  // LINK
  1.8, 1.8,                 // GANGLION x2
  1.35, // TENDRIL
  1.15, 1.15,               // HALO x2 — the tentacles around a node's centre
];
/**
 * Alpha by style bucket, before the depth band multiplies it.
 *
 * These are budgeted against the fact that violet is rgb(96, 57, 255): the blue
 * channel is ALREADY at 255, so it clips first, at a summed alpha of 1.0. Red
 * follows at 2.66 and green at 4.47 — a long, usable glow ramp rather than a
 * hard clip. A node's core (3 buckets) plus its shell (4) peaks around 2.0,
 * which lands on a bright lilac. At the 0.5-0.6 I first reached for it would
 * have summed past 3.4 and blown out to white.
 */
export const ALPHA = [
  0.85, // LEAD
  0.55, // MID
  0.31, // OUTER
  0.2,  // WEFT
  // Everything below overlaps at the node's centre, and `lighter` sums it. The
  // nucleus alone is 17x covered, so its three buckets each saturate over the
  // whole bead; add the core passing through and the shell over the top and the
  // middle stacks about ten buckets deep. Budgeted so the peak lands near 3 —
  // a glowing pink-white — rather than past 4.47, where green clips too and it
  // goes flat white.
  0.24, 0.24, 0.24,         // CORE  x3
  0.2, 0.2, 0.2, 0.2,       // SHELL x4
  0.2,  // LINK
  0.3, 0.3,                 // GANGLION x2
  0.24, // TENDRIL
  0.28, 0.28,               // HALO x2
];
/** LOD multiplier by style. A table, not a `style >= N` threshold: inserting a
 *  style would silently reclassify everything on the wrong side of it. The core
 *  gets a gentler figure than the shell it anchors, so a node stays legible in
 *  the final zoom-out after its fine orbits have been culled. */
export const LOD_MUL = [1, 1, 1, 1, 0.8, 0.8, 0.8, 2.2, 2.2, 2.2, 2.2, 1.4, 1.6, 1.6, 2.0, 9, 9];
/** Atmospheric depth, by band: far, middle, near. This — not the geometry — is
 *  what gives the tissue volume while the mouse is still, because an orthographic
 *  projection at yaw 0 discards z entirely. The 3D geometry earns its keep by
 *  making the parallax agree with the shading: what is brighter also moves more. */
export const BAND_W = [0.85, 1.0, 1.15];
export const BAND_A = [0.78, 1.0, 1.12];
/**
 * Smallest stroke, in DEVICE pixels. The artifact this fixes — a hairline
 * breaking into a bead chain on near-black — is a device-pixel sampling
 * artifact, so the threshold belongs in device pixels and dpr has to appear in
 * the formula. Expressed in CSS pixels it would be wrong in both directions: at
 * dpr 2 it would double the fill area of most of the weave to fix a problem
 * that barely exists there, and at dpr 1 it would be barely enough.
 */
export const MIN_DEVICE_W = 1.2;
/** Below this projected deviation, a polyline and its smoothed curve differ by
 *  less than a pixel, so smoothing is pure stroker cost. Sub-pixel at the switch
 *  point, which is what makes it safe to flip mid-scroll. */
export const SMOOTH_PX = 0.15;
/** Band-major, so the far band strokes first. Only matters on the violet panel,
 *  where `source-over` makes paint order visible; on carbon `lighter` is
 *  commutative and order cannot read at all. */
export const NBUCKET = STYLES * BANDS;
/** Derived, never hand-copied: it drives the cull padding, and a stale literal
 *  would pop strokes at the viewport edge. */
export const MAX_WIDTH = Math.max(Math.max(...WIDTH) * Math.max(...BAND_W), MIN_DEVICE_W);

// Nothing is painted at a node's centre: no dot, no ring, no mass. What reads as
// a node is the halo of tentacles and the bundles converging on it — the tangle
// itself, and nothing dropped on top of it.
export type Palette = {
  /** `gain` is the beat's flush — a multiplier applied before each palette's own
   *  cap, so a flush can never push a bucket past what it is budgeted for. */
  lit: (style: number, band: number, gain: number) => string;
  op: GlobalCompositeOperation;
};

/** On carbon the tissue glows: additive violet over near-black. */
export const ON_CARBON: Palette = {
  lit: (st, b, g) => `rgba(${VIOLA}, ${Math.min(1, ALPHA[st] * BAND_A[b] * g).toFixed(3)})`,
  op: "lighter",
};

/**
 * Over the violet panel it inverts: the same tissue, drawn in carbon.
 *
 * `source-over` MULTIPLIES rather than adds — n stacked buckets leave
 * `prod(1 - alpha_i)` of the ground showing. A single global `+0.1` lift with a
 * 0.62 cap is fine for a lone hairline and catastrophic for a node, where seven
 * buckets overlap: it would leave 3% of the violet, a solid black blob where the
 * knot should read as dense ink. So the lift and the cap are per style, and the
 * fat ones get no lift and a hard 0.18 ceiling.
 */
export const V_LIFT = [0.1, 0.1, 0.1, 0.12, 0, 0, 0, 0, 0, 0, 0, 0.05, 0, 0, 0.03, 0.05, 0.05];
export const V_CAP = [0.62, 0.5, 0.42, 0.38, 0.16, 0.16, 0.16, 0.18, 0.18, 0.18, 0.18, 0.24, 0.18, 0.18, 0.2, 0.2, 0.2];

// Every table here is indexed by style, and an out-of-range read fails SILENTLY:
// the spec says a non-finite `lineWidth` is ignored, and so is an unparseable
// `strokeStyle` — the bucket would simply stroke with the previous bucket's
// width and colour. No throw, no warning, a plausible and wrong image. Declared
// after V_CAP because a `const` cannot be read before its own declaration.
if (
  WIDTH.length !== STYLES ||
  ALPHA.length !== STYLES ||
  LOD_MUL.length !== STYLES ||
  V_LIFT.length !== STYLES ||
  V_CAP.length !== STYLES
) {
  throw new Error(`StromaCanvas: style tables must all have ${STYLES} entries`);
}

export const ON_VIOLA: Palette = {
  lit: (st, b, g) =>
    `rgba(${CARBON}, ${Math.min(V_CAP[st], ALPHA[st] * BAND_A[b] * g + V_LIFT[st]).toFixed(3)})`,
  op: "source-over",
};

/**
 * The same two alphas as NUMBERS, for the renderer that has no `strokeStyle` to
 * parse. Rounded to three places exactly as the strings above are: the GL path
 * is diffed against the Canvas2D one, and a fourth decimal the canvas never saw
 * would show up as a systematic error over every stacked bucket.
 */
export const litAlpha = (st: number, b: number, g: number) =>
  Number(Math.min(1, ALPHA[st] * BAND_A[b] * g).toFixed(3));
export const inkAlpha = (st: number, b: number, g: number) =>
  Number(Math.min(V_CAP[st], ALPHA[st] * BAND_A[b] * g + V_LIFT[st]).toFixed(3));

/** The same two colours as unit RGB, for the same reader. */
export const VIOLA_RGB = [96 / 255, 57 / 255, 255 / 255] as const;
export const CARBON_RGB = [5 / 255, 5 / 255, 5 / 255] as const;

export type Frame = { x: number; y: number; logS: number; focus: number };
export type Camera = Frame & { yaw: number; pitch: number };

/**
 * World → screen, orthographic, rotated about the camera's focus point.
 *
 *     rx = x - cam.x ;  ry = y - cam.y ;  rz = z
 *     x1 =  rx·cosYaw + rz·sinYaw
 *     z1 = -rx·sinYaw + rz·cosYaw
 *     y1 =  ry·cosPitch - z1·sinPitch
 *     sx = W/2 + x1·scale ;  sy = H·focus + y1·scale
 *
 * ORTHOGRAPHIC on purpose. Points at different z still shear sideways by
 * `z·sinYaw`, which *is* the parallax; and because the map stays affine, a point
 * lerped in world space and then projected equals the projection lerped in
 * screen space — which is what lets the growing tip interpolate correctly. A
 * perspective divide would break that, would give the LEAST parallax at the
 * focus point (exactly where the reader is looking), and would make both the
 * interval culling and `revealCamera`'s fit non-linear.
 *
 * This struct is the single definition. Every consumer goes through `px`/`py`,
 * so no two of them can drift apart.
 */
export type Proj = {
  cx: number; cy: number; scale: number;
  cyaw: number; syaw: number; cpit: number; spit: number;
  W2: number; Hf: number;
};

export const mkProj = (c: Camera, W: number, H: number): Proj => ({
  cx: c.x,
  cy: c.y,
  scale: Math.exp(c.logS),
  cyaw: Math.cos(c.yaw),
  syaw: Math.sin(c.yaw),
  cpit: Math.cos(c.pitch),
  spit: Math.sin(c.pitch),
  W2: W / 2,
  Hf: H * c.focus,
});

export const px = (p: Proj, x: number, z: number) =>
  p.W2 + ((x - p.cx) * p.cyaw + z * p.syaw) * p.scale;

export const py = (p: Proj, x: number, y: number, z: number) =>
  p.Hf +
  ((y - p.cy) * p.cpit - (-(x - p.cx) * p.syaw + z * p.cyaw) * p.spit) * p.scale;
