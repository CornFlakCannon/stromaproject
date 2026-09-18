"use client";

import { useEffect, useRef } from "react";
import {
  easeInOutCubic,
  readIndexMax,
  readIndexPos,
  sectionIndices,
  smoothLerp,
  smoothstep,
  useScrollFrame,
  useScrollStore,
} from "@/app/scrollkit";
import { ASIDE } from "@/app/lib/aside";
import {
  BANDS,
  STYLES,
  growOrganism,
  nearestNode,
  spineAt,
  type Organism,
  type TreeNode,
} from "@/app/lib/tree";

const VIOLA = "96, 57, 255";
const CARBON = "5, 5, 5";
const VIOLA_SOLID = "#6039ff";

/** How many rail steps fit the viewport height. The weave's steps lengthen with
 *  depth, so holding this constant *is* the progressive zoom-out — the camera
 *  pulls back exactly as fast as the tissue widens. */
const VIS_STEPS = 1.75;
/** Where the lit row sits: lower third, so what has been woven is above it and
 *  what is coming is below. */
const FOCUS_Y = 0.66;
/** How much of the rail's sideways swing the camera follows. Lower this — and
 *  only this — if the background reads as too restless behind the type. */
const LATERAL = 1;
/** Camera half-life (ms). Shorter than it used to be because `s` is now eased
 *  first and the two filters compose (see S_HALF_LIFE). */
const CAM_HALF_LIFE = 90;
/** Half-life (ms) of the GROWTH parameter.
 *
 *  This is the one that stops the front jumping. `s` arrives raw all the way
 *  from `e.deltaY`: `integrateIndexPos` sums the frame's accumulator with no
 *  ease, the wheel is clamped only per EVENT, and a panel budget is ~2600
 *  units — so one trackpad frame can move `s` by 0.19 in a single step.
 *
 *  Easing `s` and then easing the camera off it puts two exponential filters in
 *  series. That is not a filter with half-life h1+h2; it is second-order, and it
 *  starts from ZERO velocity instead of the discontinuous jerk you get today.
 *  That soft onset is the thing you actually feel. */
const S_HALF_LIFE = 120;
/** Half-life (ms) of the mouse tilt — longer than the camera, so it reads as
 *  inertia rather than as an elastic band. */
const TILT_HALF_LIFE = 260;
/** How far sideways the camera goes looking when a lateral panel takes the
 *  screen, as a fraction of the viewport's width in world units at the current
 *  zoom. It picks the destination; the node found there is what it lands on. */
const ASIDE_PAN = 0.85;
/** How much closer the camera gets to that node, as a log-scale multiplier —
 *  the card is see-through, so this is what the reader sees behind the text. */
const ASIDE_ZOOM = Math.log(2.4);
/** Half-life (ms) of that move. Deliberately long: this ramp then passes through
 *  the camera's own ease, and the two filters in series are what give the drift a
 *  soft onset instead of a lurch — the same second-order shape S_HALF_LIFE
 *  describes above, wanted here for the same reason. It is paced to the card's
 *  slide, not to the wheel. */
const ASIDE_HALF_LIFE = 300;
/** Where in the last panel the camera starts letting go and pulls back. */
const REVEAL_FROM = 0.35;
/**
 * The closure — see the closure block in tree.ts. Once the pull-back is this far
 * along (fraction of the reveal blend), a 0→1 clock starts and the closure edges
 * grow along it: the nodes link up, then the membrane zips round the outside.
 *
 * A TIMED linear ramp, not a smoother: the edges' windows index into this clock,
 * so it has to be uniform in time or the stagger baked into them would bunch up
 * (the same reason the jump tween is timed, see JUMP_MS0). Scrolling back away
 * from the reveal runs it backwards, three times faster, and the links withdraw
 * tip-first — no ghost of the closed shape is ever left behind.
 */
const CLOSE_AT = 0.9;
const CLOSE_MS = 2600;
/**
 * The beat. Once sealed, the organ contracts periodically toward its centre.
 *
 * `PULSE_AMP` is the maximum radial contraction as a fraction of a point's
 * distance from the centre, so it is a few percent of the organ's size — the
 * "small" in small contractions. `PULSE_LAG` is how many cycles of phase the rim
 * trails the centre by: a uniform contraction would be indistinguishable from
 * the camera breathing, and the lag is what turns it into a wave moving through
 * tissue. `PULSE_GLOW` flushes the alpha on the beat; it is applied per stroke
 * call (~51 of them), so it costs nothing.
 */
const PULSE_PERIOD_MS = 2400;
const PULSE_AMP = 0.035;
const PULSE_LAG = 0.3;
const PULSE_GLOW = 0.12;
/**
 * How long the background takes to TRAVEL to a jumped-to panel.
 *
 * A navbar destination or an arrow key repositions every section at once, and
 * the background used to cut with it — the one thing that reads as a glitch
 * rather than as motion. It tweens instead, growing (or retracting) the tissue
 * through every row in between over `MS0 + MS_PER_ROW · rows`, capped.
 *
 * Timed rather than a longer smoothing half-life because `smoothLerp` is
 * asymptotic: with the tail snap at 1e-3, a seven-row gap would crawl for about
 * five seconds before it landed.
 */
const JUMP_MS0 = 250;
const JUMP_MS_PER_ROW = 130;
const JUMP_MS_MAX = 1400;
/** Skip an edge whose projected size is under this many pixels. */
const LOD_PX = 1.4;
/** Mouse tilt limits (radians): ~7° of yaw, ~4° of pitch.
 *
 *  Orthographic parallax is LINEAR in z, so the macro/micro ratio is fixed by
 *  the z amplitudes and the angle cannot change it — raising the angle scales
 *  both. The weave therefore keeps its lane depth small (`laneDepth` in
 *  tree.ts) and spends the angle here, which puts the motion on the braid and
 *  the coils rather than sliding the whole background behind the type. */
const YAW_MAX = 0.5;
const PITCH_MAX = 0.4;

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

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
const beat = (u: number) => {
  const f = (u - Math.floor(u)) * BEAT_N;
  const i = f | 0;
  const t = f - i;
  return BEAT[i] * (1 - t) + BEAT[(i + 1) % BEAT_N] * t;
};

/** The organ's contraction, applied to every world point before projection.
 *  `inv` is 1 / the organ's radius, so `lag` is in cycles centre-to-rim. */
type Pulse = { x: number; y: number; inv: number; amp: number; phase: number; lag: number };

/** Stroke weight in SCREEN pixels, by style bucket. The gap between 0-2 and 3
 *  is the point: development lines are thick, the connective weft is a
 *  hairline. */
const WIDTH = [
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
const ALPHA = [
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
const LOD_MUL = [1, 1, 1, 1, 0.8, 0.8, 0.8, 2.2, 2.2, 2.2, 2.2, 1.4, 1.6, 1.6, 2.0, 9, 9];
/** Atmospheric depth, by band: far, middle, near. This — not the geometry — is
 *  what gives the tissue volume while the mouse is still, because an orthographic
 *  projection at yaw 0 discards z entirely. The 3D geometry earns its keep by
 *  making the parallax agree with the shading: what is brighter also moves more. */
const BAND_W = [0.85, 1.0, 1.15];
const BAND_A = [0.78, 1.0, 1.12];
/**
 * Smallest stroke, in DEVICE pixels. The artifact this fixes — a hairline
 * breaking into a bead chain on near-black — is a device-pixel sampling
 * artifact, so the threshold belongs in device pixels and dpr has to appear in
 * the formula. Expressed in CSS pixels it would be wrong in both directions: at
 * dpr 2 it would double the fill area of most of the weave to fix a problem
 * that barely exists there, and at dpr 1 it would be barely enough.
 */
const MIN_DEVICE_W = 1.2;
/** Below this projected deviation, a polyline and its smoothed curve differ by
 *  less than a pixel, so smoothing is pure stroker cost. Sub-pixel at the switch
 *  point, which is what makes it safe to flip mid-scroll. */
const SMOOTH_PX = 0.15;
/** Band-major, so the far band strokes first. Only matters on the violet panel,
 *  where `source-over` makes paint order visible; on carbon `lighter` is
 *  commutative and order cannot read at all. */
const NBUCKET = STYLES * BANDS;
/** Derived, never hand-copied: it drives the cull padding, and a stale literal
 *  would pop strokes at the viewport edge. */
const MAX_WIDTH = Math.max(Math.max(...WIDTH) * Math.max(...BAND_W), MIN_DEVICE_W);

// Nothing is painted at a node's centre: no dot, no ring, no mass. What reads as
// a node is the halo of tentacles and the bundles converging on it — the tangle
// itself, and nothing dropped on top of it.
type Palette = {
  /** `gain` is the beat's flush — a multiplier applied before each palette's own
   *  cap, so a flush can never push a bucket past what it is budgeted for. */
  lit: (style: number, band: number, gain: number) => string;
  op: GlobalCompositeOperation;
};

/** On carbon the tissue glows: additive violet over near-black. */
const ON_CARBON: Palette = {
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
const V_LIFT = [0.1, 0.1, 0.1, 0.12, 0, 0, 0, 0, 0, 0, 0, 0.05, 0, 0, 0.03, 0.05, 0.05];
const V_CAP = [0.62, 0.5, 0.42, 0.38, 0.16, 0.16, 0.16, 0.18, 0.18, 0.18, 0.18, 0.24, 0.18, 0.18, 0.2, 0.2, 0.2];

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

const ON_VIOLA: Palette = {
  lit: (st, b, g) =>
    `rgba(${CARBON}, ${Math.min(V_CAP[st], ALPHA[st] * BAND_A[b] * g + V_LIFT[st]).toFixed(3)})`,
  op: "source-over",
};

type Frame = { x: number; y: number; logS: number; focus: number };
type Camera = Frame & { yaw: number; pitch: number };
/** The pull-back framing, plus the organ's radius (half the fitted box's
 *  diagonal, world units) that the beat is measured against. */
type Reveal = Frame & { r: number };

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
type Proj = {
  cx: number; cy: number; scale: number;
  cyaw: number; syaw: number; cpit: number; spit: number;
  W2: number; Hf: number;
};

const mkProj = (c: Camera, W: number, H: number): Proj => ({
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

const px = (p: Proj, x: number, z: number) =>
  p.W2 + ((x - p.cx) * p.cyaw + z * p.syaw) * p.scale;

const py = (p: Proj, x: number, y: number, z: number) =>
  p.Hf +
  ((y - p.cy) * p.cpit - (-(x - p.cx) * p.syaw + z * p.cyaw) * p.spit) * p.scale;

/**
 * The tissue, seen from inside it.
 *
 * Several braided strands come down out of the dark above the first panel, and
 * the camera descends one row of tangles per panel, keeping the row that is
 * currently lighting in the lower third of the screen. What has been woven
 * stays lit and slides off the sides; what has NOT been reached is not drawn at
 * all — there is no ghost route ahead of the front, the weave advances into
 * empty space. On the last panel the camera lets go and pulls back until the
 * whole tissue is in frame — and then the nodes link up across it, a membrane
 * seals the outline, and the closed organ beats with small periodic
 * contractions (see CLOSE_AT and PULSE_AMP).
 *
 * Driven by real reading position, never by a clock: the descent *is* the
 * scrollbar. Nothing here ever calls setState — the frame callback mutates refs
 * and paints, as the engine requires.
 *
 * Mounted as a direct child of <ScrollShell>. The wrapper is `fixed`, so the
 * `min-h-[100dvh]` the shell stamps onto every direct child is inert and no
 * panel's offsetTop moves.
 */
export default function StromaCanvas() {
  const wrap = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const store = useScrollStore();

  const organism = useRef<Organism | null>(null);
  const invertEl = useRef<HTMLElement | null>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const cam = useRef<Camera>({ x: 0, y: 0, logS: 0, focus: FOCUS_Y, yaw: 0, pitch: 0 });
  const primed = useRef(false);
  const wasSettling = useRef(false);
  const lastTime = useRef(0);
  /** What the last painted frame was painted from, for the dead band. */
  const painted = useRef({ x: 0, y: 0, logS: 0, focus: 0, yaw: 0, pitch: 0, s: -1, cl: -1, rect: -1e9 });
  const still = useRef(false); // prefers-reduced-motion: paint once, hold
  /** Last descent parameter painted, so a resize repaints where the reader is. */
  const lastS = useRef(0);
  /** The eased growth parameter. */
  const sShown = useRef(0);
  /** The jump tween in flight, if any — see JUMP_MS0. */
  const jump = useRef<{ from: number; to: number; t: number; ms: number } | null>(null);
  /** Mouse position, normalised to [-1, 1] from the viewport centre. */
  const tilt = useRef({ x: 0, y: 0 });

  // One smoother each, not a fresh closure per frame: smoothLerp is a factory.
  const ease = useRef(smoothLerp(CAM_HALF_LIFE));
  const easeS = useRef(smoothLerp(S_HALF_LIFE));
  const easeTilt = useRef(smoothLerp(TILT_HALF_LIFE));
  const easeAside = useRef(smoothLerp(ASIDE_HALF_LIFE));
  /** How far along the move to a lateral panel we are, 0 → 1. */
  const asideShown = useRef(0);
  /** The node the manifesto card is looking at, chosen once when it opens.
   *  Choosing it per frame would let the camera drift from one node to the next
   *  as it travelled, which reads as a wobble rather than as an approach. */
  const asideNode = useRef<TreeNode | null>(null);
  const wasAside = useRef(false);

  /** Counting-sort scratch: the visible edges, grouped by bucket in ONE pass.
   *  Rescanning the visible list once per bucket would cost 18 × |visible| × 2
   *  passes per frame — the batching win would pay for itself and no more. */
  const sort = useRef<{
    idx: Int32Array;
    bkt: Int32Array;
    order: Int32Array;
    count: Int32Array;
    start: Int32Array;
    /** Reused across frames — `start.slice()` was the only per-frame allocation
     *  in the draw path, and it ran twice per frame over the violet panel. */
    cursor: Int32Array;
    /** One edge's points, already projected to screen. Lets the growing tip be
     *  appended as an ordinary last vertex instead of a special case. */
    q: Float64Array;
  } | null>(null);

  /** `revealCamera` scans every edge; on the last panel that is every frame. */
  const revealMemo = useRef({ s: -1e9, w: 0, h: 0, cam: null as Reveal | null });
  /** The closure clock, 0 → 1 — see CLOSE_AT. */
  const closeShown = useRef(0);
  /** The beat's phase, in cycles. Advanced only while the organ is actually
   *  beating, so a beat always starts from rest rather than mid-contraction. */
  const pulsePhase = useRef(0);
  /** The framing the beat contracts toward. Kept after the reader leaves the
   *  last panel, so a beat in progress fades out instead of switching off. */
  const organ = useRef<Reveal | null>(null);

  /** Paint the tissue under the given camera and palette. Sets its own transform;
   *  any clip already installed by the caller survives, because a clip lives in
   *  device space once set. */
  const drawTree = (
    ctx: CanvasRenderingContext2D,
    org: Organism,
    s: number,
    cl: number,
    pu: Pulse | null,
    c: Camera,
    pal: Palette,
  ) => {
    const { w: W, h: H, dpr } = size.current;
    const sc = sort.current;
    if (!sc) return;
    const p = mkProj(c, W, H);
    const scale = p.scale;
    const gain = pu ? 1 + PULSE_GLOW * beat(pu.phase) : 1;

    // Screen space: the projection is done per point in JS, so the context
    // transform carries nothing but the device pixel ratio. Line widths are
    // therefore plain screen pixels.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = pal.op;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Camera-relative view bounds, padded by the widest stroke so a hairline
    // whose box is just outside does not vanish while its stroke would show.
    const pad = (MAX_WIDTH / 2 + 2) / scale;
    const halfW = W / (2 * scale) + pad;
    const up = (H * c.focus) / scale + pad;
    const dn = (H * (1 - c.focus)) / scale + pad;
    const lod = LOD_PX / scale;

    // Interval arithmetic on the rotated box, rather than a global z padding.
    // A global pad cannot work: `maxAbsZ` comes from the deepest row and is
    // ~6x the z of the rows actually on screen during the descent, so it would
    // switch culling off. And the cross term below is the part a naive
    // `maxAbsZ·sin` pad misses entirely — because pitch is applied AFTER yaw,
    // the projected Y depends on rx, which is worth ~2px at this viewport.
    const A = p.syaw * p.spit; // rx's contribution to y1
    const B = -p.cyaw * p.spit; // rz's contribution to y1
    const sPos = p.syaw > 0;
    const aPos = A > 0;
    const bPos = B > 0;

    const { idx, bkt, order, count, start, cursor, q } = sc;
    count.fill(0);
    let n = 0;
    for (let i = 0; i < org.edges.length; i++) {
      const e = org.edges[i];
      // Nothing ahead of the front is drawn at all — no ghost pass, no
      // pre-traced route. An unreached edge costs one comparison.
      if (e.t0 > s) continue;
      // A closure edge waits on the second clock as well.
      if (e.c1 > e.c0 && e.c0 > cl) continue;

      const rxLo = e.minX - p.cx;
      const rxHi = e.maxX - p.cx;
      const ryLo = e.minY - p.cy;
      const ryHi = e.maxY - p.cy;
      const rzLo = e.minZ;
      const rzHi = e.maxZ;

      const x1Lo = rxLo * p.cyaw + (sPos ? rzLo : rzHi) * p.syaw;
      const x1Hi = rxHi * p.cyaw + (sPos ? rzHi : rzLo) * p.syaw;
      if (x1Hi < -halfW || x1Lo > halfW) continue;

      const y1Lo = ryLo * p.cpit + (aPos ? rxLo : rxHi) * A + (bPos ? rzLo : rzHi) * B;
      const y1Hi = ryHi * p.cpit + (aPos ? rxHi : rxLo) * A + (bPos ? rzHi : rzLo) * B;
      if (y1Hi < -up || y1Lo > dn) continue;

      // LOD stays on the UNROTATED xy extents, deliberately. The orthographic
      // projection of a ring of radius R always has semi-major axis exactly R,
      // so an edge-on coil can never be dropped by mistake; and a LOD that
      // depended on projected extents would make edges sitting on the threshold
      // flicker as the mouse moves — a pop where there is none today.
      const l = lod * LOD_MUL[e.style];
      if (e.maxX - e.minX < l && e.maxY - e.minY < l) continue;

      const b = e.band * STYLES + e.style;
      idx[n] = i;
      bkt[n] = b;
      n++;
      count[b]++;
    }

    let acc = 0;
    for (let b = 0; b < NBUCKET; b++) {
      start[b] = acc;
      cursor[b] = acc;
      acc += count[b];
    }
    for (let k = 0; k < n; k++) order[cursor[bkt[k]]++] = idx[k];

    // Project one world point into `q`, contracting it toward the organ's centre
    // first if the organ is beating. Warp THEN project, for every point the same
    // way — the growing tip included, so it stays exact. One closure per call,
    // not per edge: the draw path allocates nothing per frame.
    let nq = 0;
    const put = (wx: number, wy: number, wz: number) => {
      if (pu) {
        const dx = wx - pu.x;
        const dy = wy - pu.y;
        const rr = Math.sqrt(dx * dx + dy * dy + wz * wz) * pu.inv;
        const k = 1 - pu.amp * beat(pu.phase - rr * pu.lag);
        wx = pu.x + dx * k;
        wy = pu.y + dy * k;
        wz *= k;
      }
      q[nq++] = px(p, wx, wz);
      q[nq++] = py(p, wx, wy, wz);
    };

    for (let b = 0; b < NBUCKET; b++) {
      const cnt = count[b];
      if (cnt === 0) continue;
      const st = b % STYLES;
      const bd = (b / STYLES) | 0;
      ctx.beginPath();
      const end = start[b] + cnt;
      for (let m = start[b]; m < end; m++) {
        const e = org.edges[order[m]];
        const pts = e.pts;
        const nseg = pts.length / 3 - 1;
        const span = e.t1 - e.t0;
        // A closure edge grows along the closure clock, not along `s`.
        const local = e.c1 > e.c0
          ? Math.min(1, (cl - e.c0) / (e.c1 - e.c0))
          : span > 0 ? Math.min(1, (s - e.t0) / span) : 1;
        const reach = local * nseg;
        const whole = Math.floor(reach);
        const frac = reach - whole;
        // Smoothing only where the polygon would actually show. `sag` is the
        // exact midpoint-quadratic deviation in world units, so this compares
        // the error the curve removes against a fraction of a pixel: at the
        // switch point the two renderings differ by under SMOOTH_PX, which is
        // why it can flip mid-scroll without flicker. Decided per EDGE, not per
        // bucket — smoothing only changes which path commands are issued, and
        // both kinds land in the same beginPath, so there is no batch to split.
        // In the final zoom-out the structural strands go flat while the nodes,
        // which are what you are actually looking at, stay curved.
        const smooth = e.sag * scale > SMOOTH_PX;

        // Project the lit prefix, then append the growing tip as an ordinary
        // LAST VERTEX. Treating the tip as an appendage instead would leave the
        // final elbow a hard corner one frame and a fillet the next, so it would
        // snap sideways by a fraction of a pixel every time the front crossed a
        // sample. As the last vertex the two configurations either side of the
        // increment draw the same geometry — the extra quadratic is degenerate.
        nq = 0;
        for (let k = 0; k <= whole; k++) {
          const o = k * 3;
          put(pts[o], pts[o + 1], pts[o + 2]);
        }
        if (whole < nseg && frac > 0) {
          // Lerp in world and project after: exact, because the projection is
          // affine.
          const o = whole * 3;
          const ax = pts[o], ay = pts[o + 1], az = pts[o + 2];
          put(
            ax + (pts[o + 3] - ax) * frac,
            ay + (pts[o + 4] - ay) * frac,
            az + (pts[o + 5] - az) * frac,
          );
        }

        const M = nq / 2 - 1;
        // A single point is not a subpath. Emitting it anyway would draw a round
        // dot under `lineCap: "round"` at every edge's origin on the frame it
        // lights.
        if (M < 1) continue;

        ctx.moveTo(q[0], q[1]);
        if (smooth) {
          // Quadratics through the midpoints: G1 by construction, and Canvas
          // flattens them at DEVICE resolution, so they stay smooth at any zoom
          // instead of only at the one the sample count was chosen for. It also
          // retires the round-join blob sitting on every interior vertex.
          for (let i = 1; i < M; i++) {
            const a = i * 2;
            const c = a + 2;
            ctx.quadraticCurveTo(q[a], q[a + 1], (q[a] + q[c]) * 0.5, (q[a + 1] + q[c + 1]) * 0.5);
          }
          ctx.lineTo(q[M * 2], q[M * 2 + 1]);
        } else {
          for (let i = 1; i <= M; i++) ctx.lineTo(q[i * 2], q[i * 2 + 1]);
        }
      }
      // Never below one device pixel, or the stroke breaks into a bead chain on
      // near-black. `lineWidth` is in CSS px here, hence the division.
      ctx.lineWidth = Math.max(WIDTH[st] * BAND_W[bd], MIN_DEVICE_W / dpr);
      ctx.strokeStyle = pal.lit(st, bd, gain);
      ctx.stroke();
    }
  };

  /** One frame: the tissue, then the inverted copy inside the violet panel if
   *  any of it is on screen. */
  const paint = (
    org: Organism,
    s: number,
    cl: number,
    pu: Pulse | null,
    c: Camera,
    rect: DOMRect | null,
  ) => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const { w: W, h: H, dpr } = size.current;

    // The violet panel's fill is OPAQUE, so whenever it covers the viewport every
    // carbon stroke underneath is painted over and thrown away; skipping the pass
    // is most of the frame. Measured on a wide viewport this never fires — the
    // panel is `min-h-[100dvh]` and its content fits, so it is exactly one
    // viewport tall and the engine parks it a couple of hundred pixels up. It
    // earns its keep on narrow viewports, where the two columns wrap and the
    // panel grows past the fold. The clear below goes with it: this is only safe
    // when the panel truly covers everything, because there the opaque fillRect
    // is what clears the surface.
    const covers =
      !!rect && rect.top <= 0 && rect.bottom >= H && rect.left <= 0 && rect.right >= W;

    if (!covers) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      drawTree(ctx, org, s, cl, pu, c, ON_CARBON);
    }

    if (rect && rect.bottom > 0 && rect.top < H && rect.width > 0) {
      // Rounded outward, or a hairline of carbon shows along the panel's edge.
      const rx = Math.floor(rect.left);
      const ry = Math.floor(rect.top);
      const rw = Math.ceil(rect.right) - rx;
      const rh = Math.ceil(rect.bottom) - ry;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.clip();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = VIOLA_SOLID;
      ctx.fillRect(rx, ry, rw, rh);
      drawTree(ctx, org, s, cl, pu, c, ON_VIOLA);
      ctx.restore();
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };

  /**
   * The framing that holds the tissue — the last panel's destination, and the
   * only thing reduced motion ever sees.
   *
   * Measured over what is LIT at `s`, not over the organism's own bounds. The
   * weave runs several rows deeper than the page has panels, and with no ghost
   * pass those rows are not drawn at all: framing the full bounds would pull
   * back onto a screenful of empty space with a ribbon in the corner.
   *
   * The bbox stays 2D. Rotation grows the projected extent by under 2%, which
   * the 1.14 margin already covers.
   *
   * Memoised on `s`: this walks every edge, and on the last panel it is called
   * every frame.
   */
  const revealCamera = (org: Organism, s: number): Reveal => {
    const { w: W, h: H } = size.current;
    const memo = revealMemo.current;
    if (memo.cam && memo.w === W && memo.h === H && Math.abs(memo.s - s) < 0.01) {
      return memo.cam;
    }
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const e of org.edges) {
      if (e.t0 > s) continue;
      if (e.minX < x0) x0 = e.minX;
      if (e.minY < y0) y0 = e.minY;
      if (e.maxX > x1) x1 = e.maxX;
      if (e.maxY > y1) y1 = e.maxY;
    }
    if (x0 > x1) {
      x0 = org.minX;
      y0 = org.minY;
      x1 = org.maxX;
      y1 = org.maxY;
    }
    const bw = (x1 - x0) * 1.14 || 1;
    const bh = (y1 - y0) * 1.14 || 1;
    const out: Reveal = {
      x: (x0 + x1) / 2,
      y: (y0 + y1) / 2,
      logS: Math.log(Math.min(W / bw, H / bh)),
      focus: 0.5,
      r: Math.hypot(bw, bh) / 2,
    };
    revealMemo.current = { s, w: W, h: H, cam: out };
    return out;
  };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const org = growOrganism();
    organism.current = org;
    still.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const n = org.edges.length;
    let longest = 0;
    for (const e of org.edges) {
      const c = e.pts.length / 3;
      if (c > longest) longest = c;
    }
    sort.current = {
      idx: new Int32Array(n),
      bkt: new Int32Array(n),
      order: new Int32Array(n),
      count: new Int32Array(NBUCKET),
      start: new Int32Array(NBUCKET),
      cursor: new Int32Array(NBUCKET),
      // +1 for the growing tip, which is appended as an ordinary last vertex.
      q: new Float64Array((longest + 1) * 2),
    };

    const resize = () => {
      // Cap harder on wide screens: the fill cost is per pixel, and the tissue is
      // hairlines on near-black where the extra density buys almost nothing.
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (W === 0 || H === 0) return;
      const dpr = Math.min(W > 1600 ? 1.5 : 2, window.devicePixelRatio || 1);
      size.current = { w: W, h: H, dpr };
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);

      painted.current = { x: 0, y: 0, logS: 0, focus: 0, yaw: 0, pitch: 0, s: -1, cl: -1, rect: -1e9 };
      revealMemo.current = { s: -1e9, w: 0, h: 0, cam: null };

      if (still.current) {
        // Reduced motion: the whole tissue, fully lit and fully sealed, once.
        // No beat, no tilt.
        const lit = org.spineEdge.length + 2;
        const r = revealCamera(org, lit);
        cam.current = { x: r.x, y: r.y, logS: r.logS, focus: r.focus, yaw: 0, pitch: 0 };
        paint(org, lit, 1, null, cam.current, null);
        return;
      }

      if (!primed.current) {
        // Prime the camera from geometry alone — no store read, which would
        // return zeros here since section effects have not run yet. Without
        // this the first frame paints at the world origin with scale 0, because
        // smoothLerp returns `current` unchanged when dt is 0.
        const p0 = spineAt(org, 0);
        cam.current = {
          x: p0.x * LATERAL,
          y: p0.y,
          logS: Math.log(H / (VIS_STEPS * p0.step)),
          focus: FOCUS_Y,
          yaw: 0,
          pitch: 0,
        };
        primed.current = true;
      }
      paint(org, lastS.current, closeShown.current, null, cam.current, null);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Mouse tilt. Not attached at all under reduced motion — mouse parallax is
    // squarely inside what WCAG 2.3.3 covers, and merely skipping the repaint
    // would still leave the signal live. The listener sits on `window` because
    // the canvas wrapper is pointer-events-none, and it never touches the scroll
    // store: the cursor is this component's business alone.
    const onMove = (e: PointerEvent) => {
      const { w: W, h: H } = size.current;
      if (W === 0 || H === 0) return;
      tilt.current.x = clamp((e.clientX / W) * 2 - 1, -1, 1);
      tilt.current.y = clamp((e.clientY / H) * 2 - 1, -1, 1);
    };
    if (!still.current) {
      window.addEventListener("pointermove", onMove, { passive: true });
    }

    return () => {
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paint/drawTree read refs only
  }, []);

  useScrollFrame((state) => {
    const org = organism.current;
    if (!org || still.current || size.current.w === 0) return;

    // Layout READ first, before any style write this frame, so the two never
    // interleave into a thrash.
    if (!invertEl.current) {
      invertEl.current = document.querySelector<HTMLElement>("[data-organ-invert]");
    }
    const rect = invertEl.current?.getBoundingClientRect() ?? null;

    const indices = sectionIndices(store);
    if (indices.length === 0) return;
    // The ORDINAL, not the raw index: a conditional panel must not silently
    // skip a row.
    const ord = Math.max(0, indices.indexOf(state.sectionIndex));
    const max = readIndexMax(store, state.sectionIndex);
    // Deliberately NOT net of the snap span. Subtracting it would sync the row
    // to the panel landing, but it also freezes the camera for the whole glide
    // — a fifth of every panel — and divides by zero on a section that declares
    // no end. Whole-span instead: row k+1 lights exactly as panel k hands off.
    const q = max > 0 ? clamp(readIndexPos(store, state.sectionIndex) / max, 0, 1) : 0;
    const segs = org.spineEdge.length;
    const sTarget = Math.min(segs, ord + q);

    const dt = lastTime.current ? Math.min(64, state.time - lastTime.current) : 0;
    lastTime.current = state.time;

    // A jump repositions every section at once and teleports sectionIndex; the
    // engine flags those frames with `settle`. Open a TIMED tween on the rising
    // edge and travel there — the growth parameter is continuous, so the tissue
    // grows (or retracts) through every row in between instead of the background
    // cutting out from under the reader.
    const settling = state.settle !== undefined;
    if (settling && !wasSettling.current) {
      const from = sShown.current;
      jump.current = {
        from,
        to: sTarget,
        t: 0,
        ms: Math.min(JUMP_MS_MAX, JUMP_MS0 + JUMP_MS_PER_ROW * Math.abs(sTarget - from)),
      };
    }
    wasSettling.current = settling;
    // A real scroll always wins, the same way it takes a playthrough back in the
    // shell. Safe to test unconditionally: the shell zeroes the frame's delta on
    // the jump frame itself, so this cannot cancel the tween it just opened.
    if (state.accumulator !== 0) jump.current = null;

    // Ease the GROWTH, not just the camera. `s` is smoothed rather than `q`
    // because `s` is continuous and monotone across panels while `q` resets to
    // zero at every hand-off — the same reason useSequenceProgress smooths the
    // cycle count and takes the fraction afterwards.
    const j = jump.current;
    if (j) {
      j.t = Math.min(1, j.t + dt / j.ms);
      // Re-aim each frame: a panel's budget can register a frame after the jump
      // lands, and `sTarget` moves with it.
      j.to = sTarget;
      sShown.current = j.from + (j.to - j.from) * easeInOutCubic(j.t);
      // At t = 1 the value IS sTarget, so handing back to easeS is seamless.
      if (j.t >= 1) jump.current = null;
    } else {
      let next = easeS.current(sShown.current, sTarget, dt);
      // Snap the tail. smoothLerp is asymptotic and the dead band below freezes
      // it ~0.0008 short; the rail's arrivals are EXACT integers, so a permanent
      // `s = k+1 - ε` would leave row k+1 forever a hair short of its own
      // arrival. ScrollShell's glide snaps the same way for the same reason.
      if (Math.abs(sTarget - next) < 1e-3) next = sTarget;
      sShown.current = next;
    }
    const s = sShown.current;

    const { w: W, h: H } = size.current;
    const p = spineAt(org, s);
    let tx = p.x * LATERAL;
    let ty = p.y;
    let tLogS = Math.log(H / (VIS_STEPS * p.step));
    let focus = FOCUS_Y;

    let closing = false;
    if (ord === indices.length - 1) {
      const reveal = smoothstep(clamp((q - REVEAL_FROM) / (1 - REVEAL_FROM), 0, 1));
      const r = revealCamera(org, s);
      tx = lerp(tx, r.x, reveal);
      ty = lerp(ty, r.y, reveal);
      // Log space, or a ten-fold pull-back reads as an acceleration.
      tLogS = lerp(tLogS, r.logS, reveal);
      focus = lerp(FOCUS_Y, r.focus, reveal);
      closing = reveal >= CLOSE_AT;
      organ.current = r;
    }

    // The closure clock: forward once the pull-back is nearly done, backwards
    // (faster) the moment the reader leaves. The organ starts beating as it
    // seals, and the beat's phase only advances while there is a beat, so it
    // always begins from rest.
    const cl = (closeShown.current = clamp(
      closeShown.current + (closing ? dt : -3 * dt) / CLOSE_MS,
      0,
      1,
    ));
    const amp = PULSE_AMP * smoothstep(clamp((cl - 0.6) / 0.4, 0, 1));
    let pulse: Pulse | null = null;
    const o = organ.current;
    if (amp > 1e-4 && o) {
      pulsePhase.current = (pulsePhase.current + dt / PULSE_PERIOD_MS) % 1;
      pulse = {
        x: o.x,
        y: o.y,
        inv: 1 / (o.r || 1),
        amp,
        phase: pulsePhase.current,
        lag: PULSE_LAG,
      };
    }

    // A lateral panel (the manifesto card) has taken the screen. The camera goes
    // with it: sideways, so the tissue behind the card reads as somewhere ELSE in
    // the organism rather than as the same spot dimmed, and then down onto a
    // single node, close enough to be the thing the reader is looking through.
    //
    // The destination is chosen ONCE, on the frame the card opens. Re-choosing it
    // every frame would hand the camera a new nearest node as it travelled, and
    // an approach that keeps changing its mind reads as a wobble. One viewport of
    // pan in world units picks WHERE to look; `nearestNode` decides what is
    // actually there, so the camera lands on tissue instead of on a gap.
    if (ASIDE.open && !wasAside.current) {
      const panWorld = (W / Math.exp(tLogS)) * ASIDE_PAN;
      asideNode.current = nearestNode(org, tx + panWorld, ty, s);
    }
    wasAside.current = ASIDE.open;

    // All of this is added AFTER the reveal lerp, not before: on the last panel
    // that lerp pulls `tx`/`tLogS` toward the pull-back frame and would drag the
    // approach straight back out again. Everything it touches — x, y, logS,
    // focus — is already in the dead band below, so the move repaints the whole
    // way and cannot freeze halfway.
    const aside = (asideShown.current = easeAside.current(
      asideShown.current,
      ASIDE.open ? 1 : 0,
      dt,
    ));
    if (aside > 1e-4) {
      const node = asideNode.current;
      if (node) {
        tx = lerp(tx, node.x, aside);
        ty = lerp(ty, node.y, aside);
      } else {
        // No grown node out there yet — travel anyway rather than sit still.
        tx += aside * (W / Math.exp(tLogS)) * ASIDE_PAN;
      }
      tLogS += aside * ASIDE_ZOOM;
      // Centre it. FOCUS_Y hangs the lit row in the lower third so what is coming
      // stays in view, which is the right bias while reading DOWN the organism
      // and the wrong one when the whole point is one node.
      focus = lerp(focus, 0.5, aside);
    }

    const tYaw = tilt.current.x * YAW_MAX;
    const tPitch = tilt.current.y * PITCH_MAX;

    // No special case for a jump: `s` is tweened above, so `spineAt(s)` moves
    // smoothly and the ordinary 90ms ease follows it with no help.
    const c = cam.current;
    const e = ease.current;
    c.x = e(c.x, tx, dt);
    c.y = e(c.y, ty, dt);
    c.logS = e(c.logS, tLogS, dt);
    c.focus = e(c.focus, focus, dt);
    const et = easeTilt.current;
    c.yaw = et(c.yaw, tYaw, dt);
    c.pitch = et(c.pitch, tPitch, dt);

    const scale = Math.exp(c.logS);
    const rectSig = rect ? Math.round(rect.top) : -1e9;
    const was = painted.current;
    // The dead band is in SCREEN pixels: a world-unit epsilon means nothing
    // across a tenfold zoom range. Yaw and pitch have to be in here, or the
    // rotation freezes the moment scrolling stops — the rAF loop keeps running
    // and this early return is the only thing that stops the paint. A radian of
    // yaw moves a point by `z·scale` screen px; during the descent that is a
    // scale-invariant ~0.457·H, and at the reveal it is maxAbsZ·scale. Neither
    // is right in both regimes, so take the larger and stay conservative:
    // over-repainting costs a frame, under-repainting is a visible freeze.
    const zref = Math.max(0.457 * H, org.maxAbsZ * scale);
    // While the organ beats, every frame is a new frame: the beat is a clock,
    // and the dead band is exactly the thing that would freeze it.
    if (
      !pulse &&
      cl === was.cl &&
      Math.abs(c.x - was.x) * scale < 0.25 &&
      Math.abs(c.y - was.y) * scale < 0.25 &&
      Math.abs(c.logS - was.logS) < 1e-4 &&
      Math.abs(c.focus - was.focus) * H < 0.25 &&
      Math.abs(c.yaw - was.yaw) * zref < 0.25 &&
      Math.abs(c.pitch - was.pitch) * (zref + H * PITCH_MAX) < 0.25 &&
      Math.abs(s - was.s) < 0.0008 &&
      rectSig === was.rect
    ) {
      return;
    }
    painted.current = {
      x: c.x, y: c.y, logS: c.logS, focus: c.focus,
      yaw: c.yaw, pitch: c.pitch, s, cl, rect: rectSig,
    };
    lastS.current = s;

    paint(org, s, cl, pulse, c, rect);
  });

  return (
    <div
      ref={wrap}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-carbon"
    >
      <canvas ref={ref} className="h-full w-full" />
    </div>
  );
}
