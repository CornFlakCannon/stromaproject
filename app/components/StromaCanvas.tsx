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
  STYLES,
  growOrganism,
  nearestNode,
  spineAt,
  type Organism,
  type TreeNode,
} from "@/app/lib/tree";
import {
  LOD_MUL,
  LOD_PX,
  MAX_WIDTH,
  MIN_DEVICE_W,
  BAND_W,
  NBUCKET,
  ON_CARBON,
  ON_VIOLA,
  SMOOTH_PX,
  VIOLA_SOLID,
  WIDTH,
  beat,
  mkProj,
  px,
  py,
  type Camera,
  type Frame,
  type Palette,
  type Pulse,
} from "@/app/lib/tissueStyle";
import { createTissueGl, type TissueGl } from "@/app/lib/tissueGl";

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
/**
 * The governor. Stroking costs by the backing-store pixel, and the devices that
 * cannot keep up are not ones anybody can profile from a desk — so the canvas
 * times its own frames and, when they run long, steps its resolution DOWN a
 * tier. `QUALITY` multiplies the dpr `resize` would otherwise pick, floored at
 * `DPR_FLOOR`; MIN_DEVICE_W is in device pixels, so the hairlines survive every
 * tier and the tissue only gets a little softer.
 *
 * The floor is 1 — one device pixel per CSS pixel — and that is a finding, not
 * caution. Measured on a desktop GPU, a quarter of the pixels bought 3% of the
 * frame: there the cost is the geometry, and dropping under 1 would blur the
 * tissue for nothing. So this only ever acts on hi-dpi screens, which is to say
 * phones — whose GPUs this could NOT be measured on, and where the cost may
 * well be by the pixel — and where 2 → 1.2 is hard to see on the glass.
 *
 * It never steps back up. A device slow enough to trip this once would trip it
 * again, and each change reallocates the backing store — an oscillation would
 * be its own stutter. A display capped at 30Hz trips it as well; a softer
 * background is all that costs.
 *
 * Judged on PAINTED frames only (an idle frame says nothing about the canvas),
 * on a smoothed interval over `SLOW_MS` for `SLOW_FRAMES` frames running, and
 * not before `WARMUP_MS` — the page's own load is slow on every device.
 */
const QUALITY = [1, 0.75, 0.6];
const DPR_FLOOR = 1;
const SLOW_MS = 22;
const SLOW_FRAMES = 30;
const WARMUP_MS = 4000;
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

/** The pull-back framing, plus the organ's radius (half the fitted box's
 *  diagonal, world units) that the beat is measured against. */
type Reveal = Frame & { r: number };

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
  /** The GPU renderer's own canvas — a canvas holds ONE kind of context, so the
   *  two paths cannot share an element. Whichever is not painting is hidden and
   *  its backing store dropped to nothing. */
  const glRef = useRef<HTMLCanvasElement>(null);
  /** Null when the device cannot do WebGL2 well; the Canvas path below is then
   *  the whole renderer, as it always was. See lib/tissueGl.ts. */
  const glr = useRef<TissueGl | null>(null);
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
  /** The governor's state — see QUALITY. `ema` is the smoothed frame interval,
   *  `slow` how many painted frames running it has sat over SLOW_MS. */
  const gov = useRef({ tier: 0, ema: 0, slow: 0 });
  /** `resize` lives in the mount effect; the frame callback reaches it here. */
  const resizeRef = useRef<() => void>(() => {});

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
    /** By EDGE index, not by visible slot: 1 when the edge's box leaves the band
     *  it is being drawn in, so its pieces are worth testing one by one. */
    cut: Uint8Array;
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

  /** Paint the tissue under the given camera and palette, inside the horizontal
   *  band [bandTop, bandBot] of the screen (CSS px). The band only CULLS — the
   *  caller installs the matching clip, which survives the transform set here
   *  because a clip lives in device space once set. */
  const drawTree = (
    ctx: CanvasRenderingContext2D,
    org: Organism,
    s: number,
    cl: number,
    pu: Pulse | null,
    c: Camera,
    pal: Palette,
    bandTop: number,
    bandBot: number,
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
    // The band, not the viewport: screen y = Hf + y1·scale, inverted. An edge
    // wholly outside the band would be built, stroked and then thrown away by the
    // caller's clip — and over the violet panel that was half of every frame.
    const up = (p.Hf - bandTop) / scale + pad;
    const dn = (bandBot - p.Hf) / scale + pad;
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

    // The band WITHOUT the padding: an edge whose box sits inside it has nothing
    // to trim, and is spared the per-piece tests below. That is every edge in the
    // final pull-back, which is the most edges the page ever draws.
    const inW = W / (2 * scale);
    const inUp = (p.Hf - bandTop) / scale;
    const inDn = (bandBot - p.Hf) / scale;

    const { idx, bkt, order, count, start, cursor, cut, q } = sc;
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

      cut[i] = x1Lo < -inW || x1Hi > inW || y1Lo < -inUp || y1Hi > inDn ? 1 : 0;

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

    // The second, finer cull: PIECES of an edge, in screen space. The box test
    // above keeps any strand that touches the band, and a development strand is a
    // whole row long — so with the panel on screen most strands touched both
    // bands and were built and stroked whole in each, to be cut by the clip. A
    // piece whose points all lie beyond the SAME side of the band (grown by the
    // widest stroke) cannot put a pixel inside it, and neither can the round cap
    // that now closes the run at the shared point, which is beyond that side too
    // — so what is left inside the clip is the same picture.
    const m = MAX_WIDTH / 2 + 2;
    const xLo = -m;
    const xHi = W + m;
    const yLo = bandTop - m;
    const yHi = bandBot + m;
    const gone2 = (a: number, b: number) =>
      (q[a] < xLo && q[b] < xLo) ||
      (q[a] > xHi && q[b] > xHi) ||
      (q[a + 1] < yLo && q[b + 1] < yLo) ||
      (q[a + 1] > yHi && q[b + 1] > yHi);
    const gone3 = (a: number, b: number, c: number) =>
      (q[a] < xLo && q[b] < xLo && q[c] < xLo) ||
      (q[a] > xHi && q[b] > xHi && q[c] > xHi) ||
      (q[a + 1] < yLo && q[b + 1] < yLo && q[c + 1] < yLo) ||
      (q[a + 1] > yHi && q[b + 1] > yHi && q[c + 1] > yHi);

    for (let b = 0; b < NBUCKET; b++) {
      const cnt = count[b];
      if (cnt === 0) continue;
      const st = b % STYLES;
      const bd = (b / STYLES) | 0;
      ctx.beginPath();
      const end = start[b] + cnt;
      for (let m = start[b]; m < end; m++) {
        const e = org.edges[order[m]];
        const trim = cut[order[m]] === 1;
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

        // `pen` is whether the path's current point already sits at the start of
        // the piece about to be emitted; a culled piece lifts it.
        let pen = false;
        if (smooth) {
          // Quadratics through the midpoints: G1 by construction, and Canvas
          // flattens them at DEVICE resolution, so they stay smooth at any zoom
          // instead of only at the one the sample count was chosen for. It also
          // retires the round-join blob sitting on every interior vertex.
          //
          // Piece i runs from mid(P[i-1], P[i]) — P[0] itself for the first — to
          // mid(P[i], P[i+1]) with P[i] as its control, so it lies inside the
          // hull of those three points, which is what `gone3` tests.
          for (let i = 1; i < M; i++) {
            const a = i * 2;
            const c = a + 2;
            if (trim && gone3(a - 2, a, c)) {
              pen = false;
              continue;
            }
            if (!pen) {
              if (i === 1) ctx.moveTo(q[0], q[1]);
              else ctx.moveTo((q[a - 2] + q[a]) * 0.5, (q[a - 1] + q[a + 1]) * 0.5);
              pen = true;
            }
            ctx.quadraticCurveTo(q[a], q[a + 1], (q[a] + q[c]) * 0.5, (q[a + 1] + q[c + 1]) * 0.5);
          }
          // The closing straight, from the last midpoint (or P[0], when the edge
          // is a single segment) to the tip.
          const z = M * 2;
          if (!(trim && gone2(z - 2, z))) {
            if (!pen) {
              if (M === 1) ctx.moveTo(q[0], q[1]);
              else ctx.moveTo((q[z - 2] + q[z]) * 0.5, (q[z - 1] + q[z + 1]) * 0.5);
            }
            ctx.lineTo(q[z], q[z + 1]);
          }
        } else {
          for (let i = 1; i <= M; i++) {
            const a = i * 2;
            if (trim && gone2(a - 2, a)) {
              pen = false;
              continue;
            }
            if (!pen) {
              ctx.moveTo(q[a - 2], q[a - 1]);
              pen = true;
            }
            ctx.lineTo(q[a], q[a + 1]);
          }
        }
      }
      // Never below one device pixel, or the stroke breaks into a bead chain on
      // near-black. `lineWidth` is in CSS px here, hence the division.
      ctx.lineWidth = Math.max(WIDTH[st] * BAND_W[bd], MIN_DEVICE_W / dpr);
      ctx.strokeStyle = pal.lit(st, bd, gain);
      ctx.stroke();
    }
  };

  /** One frame: the tissue on carbon, and inverted inside the violet panel
   *  wherever that is on screen — each drawn once, in its own band. */
  const paint = (
    org: Organism,
    s: number,
    cl: number,
    pu: Pulse | null,
    c: Camera,
    rect: DOMRect | null,
    /** The diff harness paints the Canvas path while the GPU one is live. */
    force?: "2d",
  ) => {
    const { w: W, h: H, dpr } = size.current;

    // The violet panel's fill is OPAQUE, so every carbon stroke under it is
    // painted over and thrown away. The frame is therefore split into DISJOINT
    // horizontal bands — carbon above the panel, the panel, carbon below — and
    // the tissue is drawn once per band, culled to it. This used to be a full
    // carbon pass plus a full violet pass whenever the panel was on screen: twice
    // the strokes through exactly the transition where the panel slides in, and
    // on wide viewports (where the panel parks a little short of covering the
    // screen) twice at rest as well.
    //
    // The panel spans the viewport's full width — it is a ScrollShell panel — so
    // the bands are rows and there is no carbon to draw beside it.
    //
    // Rounded outward twice. First to whole CSS pixels, or a hairline of carbon
    // shows along the panel's edge — the panel rests a fraction of a pixel off
    // the top, and what is under that fraction is this canvas. Then to DEVICE
    // pixels: at a fractional dpr a whole CSS pixel is not a whole device one,
    // the edge would anti-alias, and the two clips meeting there would leave a
    // seam of half-covered pixels.
    let top = H;
    let bot = H;
    if (rect && rect.bottom > 0 && rect.top < H && rect.width > 0) {
      top = clamp(Math.floor(Math.floor(rect.top) * dpr) / dpr, 0, H);
      bot = clamp(Math.ceil(Math.ceil(rect.bottom) * dpr) / dpr, 0, H);
    }

    // The GPU path takes the same frame and the same band, in the device pixels
    // the rounding above already landed on. Everything below is the fallback.
    const g = glr.current;
    if (g && !g.lost && force !== "2d") {
      g.render({
        s, cl, pulse: pu, cam: c, W, H, dpr,
        gain: pu ? 1 + PULSE_GLOW * beat(pu.phase) : 1,
        topDev: Math.round(top * dpr),
        botDev: Math.round(bot * dpr),
      });
      return;
    }

    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;

    const band = (y0: number, y1: number, pal: Palette) => {
      if (y1 <= y0) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y0, W, y1 - y0);
      ctx.clip();
      if (pal === ON_VIOLA) {
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = VIOLA_SOLID;
        ctx.fillRect(0, y0, W, y1 - y0);
      } else {
        ctx.clearRect(0, y0, W, y1 - y0);
      }
      drawTree(ctx, org, s, cl, pu, c, pal, y0, y1);
      ctx.restore();
    };

    band(0, top, ON_CARBON);
    band(top, bot, ON_VIOLA);
    band(bot, H, ON_CARBON);
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
      cut: new Uint8Array(n),
      // +1 for the growing tip, which is appended as an ordinary last vertex.
      q: new Float64Array((longest + 1) * 2),
    };

    const resize = () => {
      // Cap harder on wide screens: the fill cost is per pixel, and the tissue is
      // hairlines on near-black where the extra density buys almost nothing.
      const W = canvas.clientWidth;
      const H = canvas.clientHeight;
      if (W === 0 || H === 0) return;
      const native = Math.min(W > 1600 ? 1.5 : 2, window.devicePixelRatio || 1);
      // The governor's tier on top — never below the floor, and never ABOVE what
      // the device asked for when that is already under it (a zoomed-out browser).
      const dpr = Math.max(Math.min(native, DPR_FLOOR), native * QUALITY[gov.current.tier]);
      size.current = { w: W, h: H, dpr };
      // One backing store, not two: the idle canvas keeps its CSS box (it is what
      // `clientWidth` and the ResizeObserver read) and holds no pixels.
      const g = glr.current;
      const onGl = !!g && !g.lost;
      const cw = Math.round(W * dpr);
      const ch = Math.round(H * dpr);
      const glCanvas = glRef.current;
      if (glCanvas) {
        glCanvas.width = onGl ? cw : 0;
        glCanvas.height = onGl ? ch : 0;
        glCanvas.style.visibility = onGl ? "visible" : "hidden";
        if (onGl) g.resize(cw, ch);
      }
      canvas.width = onGl ? 0 : cw;
      canvas.height = onGl ? 0 : ch;
      canvas.style.visibility = onGl ? "hidden" : "visible";

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

    // The GPU renderer, unless the URL asks for the Canvas one (`?renderer=2d`,
    // for A/B and for the bench). Read off `location`, not `useSearchParams`,
    // which would want a Suspense boundary under the static export. A context
    // lost or restored lands here as a resize: it swaps the canvases and
    // repaints, and the dead band is reset so the next frame cannot be skipped.
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("renderer") !== "2d" && glRef.current) {
      glr.current = createTissueGl(glRef.current, org, () => resizeRef.current());
    }

    resize();
    resizeRef.current = resize;

    // The instruments — `?bench`, `?diff`, see lib/tissueBench.ts. A dynamic
    // import behind the query string, so no reader ever downloads them.
    const scroller = wrap.current?.parentElement;
    if ((qs.has("bench") || qs.has("diff")) && glRef.current && scroller) {
      const canvasGl = glRef.current;
      void import("@/app/lib/tissueBench").then((m) =>
        m.attach(
          {
            org,
            canvas2d: canvas,
            canvasGl,
            scroller,
            onGl: () => !!glr.current && !glr.current.lost,
            size: () => size.current,
            descent: (at) => {
              const p = spineAt(org, at);
              return {
                x: p.x * LATERAL,
                y: p.y,
                logS: Math.log(size.current.h / (VIS_STEPS * p.step)),
                focus: FOCUS_Y,
                yaw: 0,
                pitch: 0,
              };
            },
            reveal: (at) => ({ ...revealCamera(org, at), yaw: 0, pitch: 0 }),
            paint: (at, cl, pu, c, rect, force) => paint(org, at, cl, pu, c, rect, force),
          },
          { bench: qs.has("bench"), diff: qs.has("diff") },
        ),
      );
    }
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
      glr.current?.dispose();
      glr.current = null;
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

    // Raw for the governor, clamped for the eases: a backgrounded tab must not
    // lurch the camera, but it must not be averaged into the frame time either.
    const elapsed = lastTime.current ? state.time - lastTime.current : 0;
    const dt = Math.min(64, elapsed);
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

    // The governor — see QUALITY. `resize` paints once on its own, without the
    // panel's rect; harmless, because the paint below lands in this same frame
    // and is what reaches the screen.
    const g = gov.current;
    // Over half a second is a tab coming back, not a frame. Under that a sample
    // is clamped rather than dropped: a device crawling at 8fps has to be able
    // to trip this, and one hitch must not.
    if (
      g.tier < QUALITY.length - 1 &&
      // Already at the floor: a step would reallocate the canvas at the same size.
      size.current.dpr > DPR_FLOOR &&
      state.time > WARMUP_MS &&
      elapsed > 0 &&
      elapsed < 500
    ) {
      const ms = Math.min(100, elapsed);
      g.ema = g.ema === 0 ? ms : g.ema + (ms - g.ema) * 0.1;
      g.slow = g.ema > SLOW_MS ? g.slow + 1 : 0;
      if (g.slow >= SLOW_FRAMES) {
        g.tier++;
        g.ema = 0;
        g.slow = 0;
        resizeRef.current();
      }
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
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <canvas ref={glRef} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
