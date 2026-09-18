/**
 * The tissue behind the page — a weave descending into the dark.
 *
 * It hangs from the TOP and grows downward, because that is the direction of
 * reading. World space is plain: x to the right, **y increasing downward**,
 * **z toward the viewer**, origin at the first rail cluster.
 *
 * The weave is built on LEVELS × LANES **clusters**. Every cluster is a tangle:
 * a ball of short wandering threads, not a dot. Between one level and the next,
 * clusters are joined by BUNDLES of braided strands — the thick development
 * lines — which cross lanes, so the tissue is interlaced from the first frame
 * rather than being one road with branches. A thin WEFT links clusters sideways
 * and across two levels, which is what makes the mesh dense.
 *
 * Lane 0 is the **rail**: it exists only so the camera has something to follow.
 * It is drawn exactly like its neighbours and is not visually distinguishable.
 * It is pinned to x-offset 0 AND to **z = 0** — the renderer's camera has no z,
 * which is only consistent because the rail lies flat in that plane.
 *
 * Times are measured in RAIL UNITS, not in a normalised 0→1: an edge's `t0`/`t1`
 * are values of the camera parameter `s`. Since `s` is `sectionIndex +
 * progressWithinPanel`, rail cluster *k* lights exactly when panel *k* lands,
 * and no second normalisation has to be kept in sync.
 *
 * Nothing is ever pre-traced: an edge that has not been reached is not drawn at
 * all. The tissue advances into empty space.
 *
 * A second family of edges — the CLOSURE — carries a second clock (`c0`/`c1`)
 * that the renderer only runs after the final pull-back: the nodes link up
 * across the weave and a membrane seals the outline, so the open tissue closes
 * into one organ. See the closure block at the end of `growOrganism`.
 *
 * Pure geometry: no canvas, no React, no time. Deterministic from a seed, so
 * server and client agree and nothing can mismatch on hydration.
 */

const TAU = Math.PI * 2;

export type TreeNode = {
  x: number;
  y: number;
  z: number;
  /** 0 on the rail lane, 1 on a flanking lane. */
  gen: number;
  /** The camera parameter `s` at which this cluster lights. */
  arrival: number;
};

/**
 * Style buckets — the renderer pairs each with a depth band and strokes ONE
 * path per pair.
 *
 * Why the node has SEVEN of them. `stroke()` traces the whole path and fills
 * the tracing ONCE: subpaths that overlap inside a single `beginPath()` are
 * unioned, they do not composite against each other — not under `lighter`, not
 * under anything. So every thread of a tangle sharing one bucket accumulates to
 * a single flat alpha no matter how many of them cross, which is exactly why a
 * ball of twenty threads used to read as a hollow wireframe. Density can only
 * come from stacking SEPARATE buckets, so the core is spread over three styles
 * and the shell over four, and the crossings ramp.
 */
export const STYLE = {
  /** Lead strand of a development bundle — the heaviest line in the weave. */
  LEAD: 0,
  /** Companion strands of a bundle. */
  MID: 1,
  /** Outer strands of a bundle. */
  OUTER: 2,
  /** The thin connective weft. */
  WEFT: 3,
  /** Node core: knots that pass through the centre. Three buckets, so they
   *  stack into a dense middle instead of a flat silhouette. */
  CORE: 4,
  /** Node shell: the fine orbits around the core. Four buckets, same reason. */
  SHELL: 7,
  /** An orbit that leaves its node and wraps a neighbouring one. */
  LINK: 11,
  /** A ganglion: a smaller knot sitting outside the core. Two buckets, so a
   *  ganglion's own crossings still ramp. */
  GANGLION: 12,
  /** A thread that leaves a ganglion and winds around the core's surface. */
  TENDRIL: 14,
  /**
   * The thin tentacles that ring a node's centre. Two buckets — these DO want
   * the soft overlap that the centre itself refuses.
   *
   * There is no NUCLEUS bucket any more, and nothing replaces it: a node's
   * centre is left empty and the halo IS the node. A stroked nucleus could only
   * ever fake a solid — `stroke()` fills the union of a path once, so a ball of
   * strands paints at ONE flat alpha however many of them cross — and zeroing
   * its width does not remove it either, because the renderer floors every
   * stroke at one device pixel. `nucleusR` survives as what the halo is sized
   * against.
   */
  HALO: 15,
} as const;
export const CORE_STYLES = 3;
export const SHELL_STYLES = 4;
export const GANGLION_STYLES = 2;
export const HALO_STYLES = 2;
export const STYLES = 17;
/** Depth bands: 0 far, 1 middle, 2 near. */
export const BANDS = 3;

export type Edge = {
  /** Flat [x0, y0, z0, x1, y1, z1, …] — STRIDE 3 — resampled to CONSTANT arc
   *  length, because the renderer walks the growing tip by segment index and
   *  uneven spacing would make the front stutter inside a single stroke. */
  pts: Float32Array;
  style: number;
  /** Depth band, from mean z relative to the LOCAL step (see `bandOf`). */
  band: number;
  /** Largest midpoint-quadratic deviation along this edge, in WORLD units —
   *  the exact error the renderer's curve smoothing removes. It multiplies by
   *  the camera scale to a screen distance, which is how the renderer decides
   *  per bucket whether smoothing is worth paying for. */
  sag: number;
  /** Lights over [t0, t1] in rail units. */
  t0: number;
  t1: number;
  /**
   * Closure window, in CLOSURE units — the 0→1 clock the renderer runs once the
   * final pull-back has finished. `c1 <= c0` means "not a closure edge": it
   * lights on `s` alone. A closure edge is gated on BOTH clocks: `t0` says its
   * two endpoints have grown, `c0` says the closure has reached it — and its
   * growth along its own length is read off the closure clock, not off `s`.
   */
  c0: number;
  c1: number;
  /** World-space bounds. x/y drive culling and LOD; z drives the cull's shear
   *  correction under camera rotation. */
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
};

export type Organism = {
  nodes: TreeNode[];
  edges: Edge[];
  /** Node ids of the rail clusters, top first. */
  spine: number[];
  /** Edge index of the lead strand leaving rail cluster k. */
  spineEdge: number[];
  /** World length of rail step k — the camera scales off this. */
  spineStep: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Largest |z| anywhere — the renderer's dead band is scaled off it. */
  maxAbsZ: number;
};

/** mulberry32 — small, fast, identical on server and client. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Dense samples per control segment before the arc-length resample. */
const CR_DENSITY = 6;

/**
 * Catmull-Rom through the control points, resampled to constant arc length.
 *
 * This is what removes every hard angle: the generators only ever place control
 * points, and the curve through them is what gets stored. Constant arc length
 * is not cosmetic — the renderer advances the growing tip by segment index, and
 * so does `spineAt`.
 *
 * Arc length is measured in 3D, so screen-space spacing is no longer *exactly*
 * constant once a strand leans out of the view plane. With dz/ds under ~0.25
 * that is a ≤3% tip-speed variation inside one stroke: invisible.
 */
function sampleSpline(ctrl: number[], samples: number, closed = false): Float32Array {
  const m = ctrl.length / 3;
  // A closed loop gets one extra sample so the last coincides with the first and
  // the spacing stays uniform all the way round. Spacing it over `samples - 1`
  // instead would land the final sample back on the start with a zero-length
  // segment in front of it.
  const outN = closed ? samples + 1 : samples;
  const out = new Float32Array(outN * 3);
  if (m < 2) {
    for (let k = 0; k < outN; k++) {
      out[k * 3] = ctrl[0] ?? 0;
      out[k * 3 + 1] = ctrl[1] ?? 0;
      out[k * 3 + 2] = ctrl[2] ?? 0;
    }
    return out;
  }
  // Open: the endpoints are duplicated as phantom controls, so the curve starts
  // and ends exactly on the first and last point — bundles must land on their
  // nodes. Closed: the phantoms WRAP instead. Clamping them on a loop leaves the
  // tangent entering the seam and the tangent leaving it half a control-turn
  // apart, which on the node knots is a ~30 degree corner on every strand.
  // The caller must NOT repeat the first point at the end.
  const at = closed
    ? (i: number, c: number) => ctrl[(((i % m) + m) % m) * 3 + c]
    : (i: number, c: number) => ctrl[(i < 0 ? 0 : i > m - 1 ? m - 1 : i) * 3 + c];

  const segs = closed ? m : m - 1;
  const dense = segs * CR_DENSITY + 1;
  const dx = new Float64Array(dense);
  const dy = new Float64Array(dense);
  const dz = new Float64Array(dense);
  let w = 0;
  for (let seg = 0; seg < segs; seg++) {
    const x0 = at(seg - 1, 0), y0 = at(seg - 1, 1), z0 = at(seg - 1, 2);
    const x1 = at(seg, 0), y1 = at(seg, 1), z1 = at(seg, 2);
    const x2 = at(seg + 1, 0), y2 = at(seg + 1, 1), z2 = at(seg + 1, 2);
    const x3 = at(seg + 2, 0), y3 = at(seg + 2, 1), z3 = at(seg + 2, 2);
    const last = seg === segs - 1 ? CR_DENSITY : CR_DENSITY - 1;
    for (let i = 0; i <= last; i++) {
      const t = i / CR_DENSITY;
      const t2 = t * t;
      const t3 = t2 * t;
      const a0 = -0.5 * t3 + t2 - 0.5 * t;
      const a1 = 1.5 * t3 - 2.5 * t2 + 1;
      const a2 = -1.5 * t3 + 2 * t2 + 0.5 * t;
      const a3 = 0.5 * t3 - 0.5 * t2;
      dx[w] = a0 * x0 + a1 * x1 + a2 * x2 + a3 * x3;
      dy[w] = a0 * y0 + a1 * y1 + a2 * y2 + a3 * y3;
      dz[w] = a0 * z0 + a1 * z1 + a2 * z2 + a3 * z3;
      w++;
    }
  }

  const cum = new Float64Array(dense);
  for (let i = 1; i < dense; i++) {
    const ax = dx[i] - dx[i - 1];
    const ay = dy[i] - dy[i - 1];
    const az = dz[i] - dz[i - 1];
    // sqrt, not a three-argument Math.hypot: hypot is markedly slower in V8 and
    // this runs on every control segment of every edge.
    cum[i] = cum[i - 1] + Math.sqrt(ax * ax + ay * ay + az * az);
  }
  const total = cum[dense - 1];
  if (total <= 1e-9) {
    for (let k = 0; k < outN; k++) {
      out[k * 3] = dx[0];
      out[k * 3 + 1] = dy[0];
      out[k * 3 + 2] = dz[0];
    }
    return out;
  }
  const denom = closed ? samples : samples - 1;
  let j = 1;
  for (let k = 0; k < outN; k++) {
    const target = (k / denom) * total;
    while (j < dense - 1 && cum[j] < target) j++;
    const c0 = cum[j - 1];
    const c1 = cum[j];
    const f = c1 > c0 ? (target - c0) / (c1 - c0) : 0;
    out[k * 3] = dx[j - 1] + (dx[j] - dx[j - 1]) * f;
    out[k * 3 + 1] = dy[j - 1] + (dy[j] - dy[j - 1]) * f;
    out[k * 3 + 2] = dz[j - 1] + (dz[j] - dz[j - 1]) * f;
  }
  return out;
}

/** Samples per stroke. Development strands are long and read close up; weft is
 *  thin. Tangle threads scale with their turn count — see `tangleAt`. */
const DEV_SAMPLES = 44;
const SKIP_SAMPLES = 32;
const WEFT_SAMPLES = 20;

/** Band boundary on z expressed in LOCAL steps — see `bandOf`. */
const BAND_EDGE = 0.08;

/**
 * Depth band from mean z, measured **relative to the local step**, never from
 * absolute z: the weave's depth is proportional to the step, which grows 1.2^k
 * over the descent — a 6× spread. Absolute thresholds would drop the whole top
 * row into the middle band (flat, no atmosphere) and over-split the deep rows.
 */
function bandOf(meanZ: number, step: number): number {
  const u = meanZ / (step || 1);
  return u < -BAND_EDGE ? 0 : u > BAND_EDGE ? 2 : 1;
}

export type GrowOptions = {
  seed?: number;
  /** Rows of clusters. Deliberately more than the page has panels: the reader
   *  stops partway and the tissue keeps going. */
  levels?: number;
  /** Parallel fronts. Lane 0 is the camera rail. */
  lanes?: number;
  /** World length of the first rail step. Everything scales off this. */
  step0?: number;
  /** How much each step lengthens — this is what opens the weave up. */
  growth?: number;
  /** How far the rail swings off vertical (radians). */
  swing?: number;
  /** Lateral offset of a flanking lane, as a fraction of the local step. */
  laneSpread?: number;
  /** Depth offset of a flanking lane, as a fraction of the local step.
   *  Deliberately much smaller than `laneSpread`: the parallax a rotation
   *  produces is linear in z, so a lane depth near the lateral spread would
   *  slide the WHOLE background sideways behind the type — swamping the braid
   *  and coil parallax, which is the part that reads as volume. */
  laneDepth?: number;
  /** How much fatter the node is than its natural step-relative size. THE knob
   *  for node weight: 1 is the old ball, 3 puts the node's diameter at roughly
   *  half the row pitch. Past about 4 the nodes swallow their neighbours and the
   *  weave stops reading as a weave. */
  coreSwell?: number;
  /** Shell orbits around a tangle. */
  threads?: number;
  /** Knots sitting outside the core, each tied to it by winding tendrils. */
  ganglia?: number;
  /** Thin tentacles ringing a node's centre. */
  halo?: number;
  /** How far the halo reaches, as a multiple of the nucleus radius. */
  haloR?: number;
  /**
   * Radius of a node's CENTRE as a fraction of the LOCAL STEP, which is the same
   * thing as a fixed size on screen: the camera holds `scale = H / (VIS_STEPS *
   * step)`, so `f * step` always projects to `f * H / VIS_STEPS` pixels however
   * deep the descent has gone. Nothing is drawn at the centre itself any more,
   * so this reaches the image only through `haloR`: it is THE knob for how wide
   * a node's ring of tentacles opens.
   */
  nucleusR?: number;
  /** Hard ceiling. It truncates in GENERATION order, and tangles are generated
   *  last (deepest rows last), so a ceiling that bites eats exactly what the
   *  final zoom-out shows. Keep headroom. */
  maxEdges?: number;
  /** Length of the strands entering from above the first row. */
  entry?: number;
};

export function growOrganism({
  seed = 0x5730_4d41, // "STROMA", loosely
  levels = 12,
  lanes = 5,
  step0 = 1,
  growth = 1.2,
  swing = 5,
  laneSpread = 0.72,
  laneDepth = 0.15,
  coreSwell = 0,
  threads = 6,
  ganglia = 3,
  nucleusR = 0.078,
  halo = 6,
  haloR = 2.3,
  maxEdges = 4200,
  entry = 1.9,
}: GrowOptions = {}): Organism {
  const rnd = rng(seed);
  const nodes: TreeNode[] = [];
  const edges: Edge[] = [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxAbsZ = 0;

  const pushEdge = (
    pts: Float32Array,
    style: number,
    t0: number,
    t1: number,
    step: number,
  ): number => {
    let eMinX = Infinity, eMinY = Infinity, eMinZ = Infinity;
    let eMaxX = -Infinity, eMaxY = -Infinity, eMaxZ = -Infinity;
    let sumZ = 0;
    const n = pts.length / 3;
    // STRIDE 3. Walking this by 2 would read x, z, y, x, z … and produce bounds
    // that are wrong without ever throwing.
    for (let i = 0; i < n; i++) {
      const x = pts[i * 3];
      const y = pts[i * 3 + 1];
      const z = pts[i * 3 + 2];
      if (x < eMinX) eMinX = x;
      if (x > eMaxX) eMaxX = x;
      if (y < eMinY) eMinY = y;
      if (y > eMaxY) eMaxY = y;
      if (z < eMinZ) eMinZ = z;
      if (z > eMaxZ) eMaxZ = z;
      sumZ += z;
    }
    if (eMinX < minX) minX = eMinX;
    if (eMaxX > maxX) maxX = eMaxX;
    if (eMinY < minY) minY = eMinY;
    if (eMaxY > maxY) maxY = eMaxY;
    const az = Math.max(Math.abs(eMinZ), Math.abs(eMaxZ));
    if (az > maxAbsZ) maxAbsZ = az;

    // The midpoint-quadratic deviation, which is exactly the error the
    // renderer's smoothing removes: |P(i-1) - 2P(i) + P(i+1)| / 8. Computed
    // once here so the renderer can decide per bucket, per frame, whether the
    // curve is worth stroking as curves at the current zoom.
    let sag = 0;
    for (let i = 1; i < n - 1; i++) {
      const a = i * 3;
      const bx = pts[a - 3] - 2 * pts[a] + pts[a + 3];
      const by = pts[a - 2] - 2 * pts[a + 1] + pts[a + 4];
      const bz = pts[a - 1] - 2 * pts[a + 2] + pts[a + 5];
      const d = bx * bx + by * by + bz * bz;
      if (d > sag) sag = d;
    }
    sag = Math.sqrt(sag) / 8;

    edges.push({
      pts,
      style,
      band: bandOf(sumZ / n, step),
      sag,
      t0,
      t1,
      c0: 0,
      c1: 0,
      minX: eMinX, minY: eMinY, minZ: eMinZ,
      maxX: eMaxX, maxY: eMaxY, maxZ: eMaxZ,
    });
    return edges.length - 1;
  };

  /**
   * One strand between two points, in 3D.
   *
   * `bow` is a single lazy arc and `amp`/`ampZ` are the braid: the offset is
   * spread across TWO perpendiculars with a cos/sin pair, so a strand spirals
   * around the bundle axis instead of bowing in a plane — which is what makes a
   * bundle read as rope rather than as ribbon once the camera turns.
   *
   * The perpendiculars are built orthonormal to the axis rather than assumed to
   * be (-dy, dx, 0) and (0, 0, 1): the axis genuinely leaves the view plane when
   * it joins lanes at different depths.
   *
   * Both terms are shaped by sin(πt), so the ends land exactly on the clusters
   * however hard the middle wanders.
   */
  const strand = (
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    style: number,
    t0: number,
    t1: number,
    samples: number,
    bow: number,
    amp: number,
    ampZ: number,
    freq: number,
    phase: number,
    step: number,
  ): number => {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    // Gram-Schmidt against whichever axis the direction is least aligned with.
    const rx = Math.abs(uz) < 0.9 ? 0 : 1;
    const ry = 0;
    const rz = Math.abs(uz) < 0.9 ? 1 : 0;
    let p1x = uy * rz - uz * ry;
    let p1y = uz * rx - ux * rz;
    let p1z = ux * ry - uy * rx;
    const p1n = Math.sqrt(p1x * p1x + p1y * p1y + p1z * p1z) || 1;
    p1x /= p1n; p1y /= p1n; p1z /= p1n;
    const p2x = uy * p1z - uz * p1y;
    const p2y = uz * p1x - ux * p1z;
    const p2z = ux * p1y - uy * p1x;

    const CTRL = 9;
    const ctrl: number[] = [];
    for (let i = 0; i <= CTRL; i++) {
      const t = i / CTRL;
      const env = Math.sin(t * Math.PI);
      const offA = env * (bow + amp * Math.cos(TAU * freq * t + phase));
      const offB = env * ampZ * Math.sin(TAU * freq * t + phase);
      // A little along-track drift, or the members of a bundle read as offset
      // copies of one curve rather than as separate threads.
      const drift = env * (rnd() - 0.5) * 0.05 * len;
      ctrl.push(
        ax + dx * t + p1x * offA + p2x * offB + ux * drift,
        ay + dy * t + p1y * offA + p2y * offB + uy * drift,
        az + dz * t + p1z * offA + p2z * offB + uz * drift,
      );
    }
    return pushEdge(sampleSpline(ctrl, samples), style, t0, t1, step);
  };

  /**
   * A braided bundle: the development line. Returns the edge index of its lead
   * strand, which is what the camera rail is pinned to.
   *
   * EVERY bundle gets a lead at the heaviest weight, the rail's included — if
   * only the rail did, the thickest stroke on screen would trace one continuous
   * descent and the tissue would read as a single road again.
   *
   * `flat` keeps member 0 in the z = 0 plane. The rail bundle needs it: the
   * camera samples that member and has no z of its own, so a member that
   * wandered in depth would swing the camera against the pulse marker, which is
   * drawn on a z = 0 node.
   */
  const bundle = (
    aId: number,
    bId: number,
    members: number,
    spread: number,
    step: number,
    flat = false,
  ): number => {
    const A = nodes[aId];
    const B = nodes[bId];
    const len = Math.sqrt(
      (B.x - A.x) ** 2 + (B.y - A.y) ** 2 + (B.z - A.z) ** 2,
    ) || 1;
    const bow = (rnd() - 0.5) * 0.22 * len;
    const freq = 0.8 + rnd();
    let first = -1;
    for (let m = 0; m < members && edges.length < maxEdges; m++) {
      const style = m === 0 ? 0 : m === 1 ? 1 : 2;
      // The z term is ADDED on top of the in-plane braid, never carved out of
      // it: splitting a fixed amplitude would halve the interlace you actually
      // see at rest, which is the part that works.
      const ampZ = flat && m === 0 ? 0 : 0.16 * len * (0.5 + rnd());
      const e = strand(
        A.x, A.y, A.z,
        B.x, B.y, B.z,
        style,
        // Members arrive staggered, so a bundle weaves itself together instead
        // of snapping into place as one ribbon. Member 0 is never delayed: the
        // rail's lead strand has to span exactly [k, k+1].
        A.arrival + m * 0.04,
        B.arrival + m * 0.05,
        DEV_SAMPLES,
        bow,
        spread * len * (0.55 + rnd() * 0.7),
        ampZ,
        freq,
        (m / members) * TAU + rnd() * 0.5,
        step,
      );
      if (m === 0) first = e;
    }
    return first;
  };

  /** A uniformly random orthonormal frame — used for both the core knots and
   *  the shell coils, so no two nodes share a silhouette. */
  const frame = () => {
    const w = rnd() * 2 - 1;
    const ph = rnd() * TAU;
    const sq = Math.sqrt(Math.max(0, 1 - w * w));
    const e3 = [sq * Math.cos(ph), sq * Math.sin(ph), w];
    const gx = Math.abs(e3[2]) < 0.9 ? 0 : 1;
    const gz = Math.abs(e3[2]) < 0.9 ? 1 : 0;
    let e1 = [e3[1] * gz, e3[2] * gx - e3[0] * gz, -e3[1] * gx];
    const n1 = Math.hypot(e1[0], e1[1], e1[2]) || 1;
    e1 = [e1[0] / n1, e1[1] / n1, e1[2] / n1];
    const e2 = [
      e3[1] * e1[2] - e3[2] * e1[1],
      e3[2] * e1[0] - e3[0] * e1[2],
      e3[0] * e1[1] - e3[1] * e1[0],
    ];
    return [e1, e2, e3];
  };

  /** Core knot parameters — different (p, q, m) so strands never overlay. */
  const KNOTS: readonly (readonly [number, number, number])[] = [
    [3, 1, 2], [2, 2, 3], [3, 2, 2], [5, 1, 3], [4, 1, 2], [2, 3, 3],
  ];
  const KNOT_SAMPLES = 96;
  const KNOT_CTRL = 88;

  /**
   * The unit direction of a rose whose plane precesses:
   *
   *     d(u) = cos(p u)·( cos(q u)·e1 + sin(q u)·e3 ) + sin(p u)·e2
   *
   * `|d| = 1` exactly — the bracket is a unit vector in the e1/e3 plane and e2
   * is orthogonal to both — so there is nothing to normalise and no direction
   * clustering. Paired with a SIGNED radius it gives a knot that passes through
   * its own centre; held at constant radius it gives a curve that winds over a
   * sphere, which is what ties a ganglion to the core.
   */
  const roseDir = (
    u: number, p: number, q: number,
    e1: number[], e2: number[], e3: number[],
    out: number[],
  ) => {
    const cp = Math.cos(p * u), sp = Math.sin(p * u);
    const cq = Math.cos(q * u), sq = Math.sin(q * u);
    out[0] = cp * (cq * e1[0] + sq * e3[0]) + sp * e2[0];
    out[1] = cp * (cq * e1[1] + sq * e3[1]) + sp * e2[1];
    out[2] = cp * (cq * e1[2] + sq * e3[2]) + sp * e2[2];
  };

  /** A closed knot filling a ball of radius R. The radius is SIGNED, which is
   *  the whole point: the strand passes THROUGH the centre 2m times per loop
   *  with non-zero speed. A positive radius with a floor would only wrap a shell
   *  and leave the middle hollow. */
  const roseKnot = (
    cx: number, cy: number, cz: number, R: number,
    p: number, q: number, m: number, psi: number,
    ctrlN: number, samples: number,
    /** 0 keeps the radius SIGNED, so the strand passes through the centre and
     *  fills the ball. A positive floor turns it into a shell that never reaches
     *  the middle — which is what the halo wants, so its tentacles ring the
     *  nucleus instead of crossing it and brightening the one thing that has to
     *  stay flat. Any value above 0 also keeps the speed away from zero, so
     *  there is still no cusp. */
    floor = 0,
  ) => {
    const [e1, e2, e3] = frame();
    const d = [0, 0, 0];
    const ctrl: number[] = [];
    for (let c = 0; c < ctrlN; c++) {
      const u = (c / ctrlN) * TAU;
      roseDir(u, p, q, e1, e2, e3, d);
      const r = R * (floor + (1 - floor) * Math.sin(m * u + psi));
      ctrl.push(cx + d[0] * r, cy + d[1] * r, cz + d[2] * r);
    }
    return sampleSpline(ctrl, samples, true);
  };

  /**
   * A tangle: the node.
   *
   * A fat core knot in the middle, a shell of finer orbits over it, and a few
   * GANGLIA outside — smaller knots of their own, each tied back by tendrils
   * that wind over the core's surface rather than running to it in a straight
   * line.
   */
  const tangleAt = (
    cx: number, cy: number, cz: number,
    R: number,
    nucR: number,
    arrival: number,
    count: number,
    step: number,
  ) => {
    // ---- halo: the thin tentacles ringing the centre ------------------------
    //
    // Nothing occupies the centre — the halo IS the node. `nucR` survives only
    // as the radius these are sized against, and `floor` below is what keeps
    // them clear of the middle rather than crossing it.
    for (let i = 0; i < halo && edges.length < maxEdges; i++) {
      const [pk, qk] = KNOTS[(i + 2) % KNOTS.length];
      const mk = 2 + (i % 2);
      pushEdge(
        roseKnot(
          cx, cy, cz,
          nucR * haloR * (0.7 + rnd() * 0.45),
          // floor 0.86: the innermost the halo can dip is 0.7 of its own radius,
          // and its own radius starts at 1.6 nucleus radii, so the tentacles bottom
          // out just OUTSIDE the ball instead of crossing it.
          pk, qk, mk, rnd() * TAU, 34, 40, 0.86,
        ),
        STYLE.HALO + (i % HALO_STYLES),
        arrival - 0.1 + i * 0.008,
        arrival + 0.16 + i * 0.008,
        step,
      );
    }

    // With `coreSwell` at 0 the outer structure has no size at all, and every
    // curve below would collapse to a single point — which `lineCap: "round"`
    // would still paint, as several hundred dots piled on the node centres.
    if (R < 1e-6) return;

    // ---- core: thick strands through the middle -----------------------------
    for (let i = 0; i < KNOTS.length && edges.length < maxEdges; i++) {
      const [pk, qk, mk] = KNOTS[i];
      // Offset centres slightly, or every strand crosses at one point and burns
      // a hot dot instead of reading as a knot.
      const ox = cx + (rnd() - 0.5) * R * 0.12;
      const oy = cy + (rnd() - 0.5) * R * 0.12;
      const oz = cz + (rnd() - 0.5) * R * 0.12;
      const off = i * 0.008;
      pushEdge(
        roseKnot(ox, oy, oz, R, pk, qk, mk, rnd() * TAU, KNOT_CTRL, KNOT_SAMPLES),
        STYLE.CORE + (i % CORE_STYLES),
        arrival - 0.14 + off,
        arrival + 0.1 + off,
        step,
      );
    }

    // ---- shell: the fine orbits over the core -------------------------------
    for (let i = 0; i < count && edges.length < maxEdges; i++) {
      const turns = 1.3 + rnd() * 1.3;
      const start = rnd() * TAU;
      const [e1, e2, e3] = frame();
      const squash = 0.7 + rnd() * 0.35;
      const ox = cx + (rnd() - 0.5) * R * 0.3;
      const oy = cy + (rnd() - 0.5) * R * 0.3;
      const oz = cz + (rnd() - 0.5) * R * 0.3;
      // Control points and samples both scale with the turn count. These coils
      // turn far more per segment than the long development strands do.
      const n = Math.round(8 * turns) + 4;
      const samples = Math.round(11 * turns) + 10;
      const ctrl: number[] = [];
      // A slow random walk on the radius, not per-point noise: it is what
      // de-regularises the ring so it reads as a thread, not a drawn circle.
      let walk = rnd();
      let drift = 0;
      for (let c = 0; c <= n; c++) {
        walk = Math.min(1, Math.max(0, walk + (rnd() - 0.5) * 0.18));
        drift += (rnd() - 0.5) * R * 0.16;
        const th = start + (c / n) * TAU * turns;
        const a = Math.cos(th) * R * (0.72 + 0.28 * walk);
        const b = Math.sin(th) * R * (0.72 + 0.28 * walk) * squash;
        ctrl.push(
          ox + e1[0] * a + e2[0] * b + e3[0] * drift,
          oy + e1[1] * a + e2[1] * b + e3[1] * drift,
          oz + e1[2] * a + e2[2] * b + e3[2] * drift,
        );
      }
      // The knot starts forming just BEFORE its cluster's nominal arrival, so
      // the front always meets a tangle already under way rather than a bare
      // point — and the very first row is a knot at s = 0, not a dot.
      const off = i * 0.006;
      pushEdge(
        sampleSpline(ctrl, samples),
        STYLE.SHELL + (i % SHELL_STYLES),
        arrival - 0.12 + off,
        arrival + 0.1 + off,
        step,
      );
    }

    // ---- ganglia: smaller knots outside, wound onto the core ----------------
    for (let g = 0; g < ganglia && edges.length < maxEdges; g++) {
      // A direction out of the core, and an orthonormal frame built ON it, so a
      // tendril starting at u = 0 leaves exactly from the ganglion.
      const w = rnd() * 2 - 1;
      const ph = rnd() * TAU;
      const sq = Math.sqrt(Math.max(0, 1 - w * w));
      const gdir = [sq * Math.cos(ph), sq * Math.sin(ph), w];
      const ax = Math.abs(gdir[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
      let t1 = [
        gdir[1] * ax[2] - gdir[2] * ax[1],
        gdir[2] * ax[0] - gdir[0] * ax[2],
        gdir[0] * ax[1] - gdir[1] * ax[0],
      ];
      const n1 = Math.hypot(t1[0], t1[1], t1[2]) || 1;
      t1 = [t1[0] / n1, t1[1] / n1, t1[2] / n1];
      const t2 = [
        gdir[1] * t1[2] - gdir[2] * t1[1],
        gdir[2] * t1[0] - gdir[0] * t1[2],
        gdir[0] * t1[1] - gdir[1] * t1[0],
      ];

      const Rg = R * (0.24 + rnd() * 0.12);
      const dist = R * (1.02 + rnd() * 0.18);
      const gx = cx + gdir[0] * dist;
      const gy = cy + gdir[1] * dist;
      const gz = cz + gdir[2] * dist;
      const off = g * 0.01;

      // The ganglion itself: a small knot of the same family.
      for (let i = 0; i < 2 && edges.length < maxEdges; i++) {
        const [pk, qk, mk] = KNOTS[(g * 2 + i) % KNOTS.length];
        pushEdge(
          roseKnot(gx, gy, gz, Rg, pk, qk, mk, rnd() * TAU, 36, 40),
          STYLE.GANGLION + (i % GANGLION_STYLES),
          arrival - 0.08 + off,
          arrival + 0.14 + off,
          step,
        );
      }

      // Tendrils: constant-radius rose curves over the core's surface, framed on
      // `gdir` so they start at the ganglion and wind away around the core.
      for (let i = 0; i < 2 && edges.length < maxEdges; i++) {
        const p = 1 + i;
        const q = 3 + Math.floor(rnd() * 3);
        const d = [0, 0, 0];
        const ctrl: number[] = [];
        const N = 52;
        for (let c = 0; c < N; c++) {
          const u = (c / N) * TAU;
          roseDir(u, p, q, gdir, t1, t2, d);
          // Ride just clear of the core, easing out to the ganglion at the seam
          // so the two read as one thread.
          const grip = R * (1.03 + 0.05 * Math.sin(q * u));
          const pull = dist - R * 1.03;
          const w2 = Math.cos(u) * 0.5 + 0.5; // 1 at u = 0, the ganglion end
          const r = grip + pull * w2 * w2;
          ctrl.push(cx + d[0] * r, cy + d[1] * r, cz + d[2] * r);
        }
        pushEdge(
          sampleSpline(ctrl, 48, true),
          STYLE.TENDRIL,
          arrival - 0.06 + off,
          arrival + 0.18 + off,
          step,
        );
      }
    }
  };

  /**
   * An orbit that leaves node A's shell, reaches node B, and winds part of the
   * way around it before ending.
   *
   * Deliberately NOT another centre-to-centre line: the weft already joins
   * adjacent lanes and the bundles already join rows, so a straight link would
   * just draw a thinner copy of a line that is already there. What is missing
   * is that every existing connector buries both its ends inside a ball and
   * appears to come from nowhere. This one starts and finishes on the shells.
   */
  const orbitLink = (
    ax: number, ay: number, az: number, ra: number,
    bx: number, by: number, bz: number, rb: number,
    t0: number, step: number,
  ) => {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    // A perpendicular, for the bow out and for winding around B.
    let wx = -uy, wy = ux, wz = 0;
    const wn = Math.hypot(wx, wy, wz) || 1;
    wx /= wn; wy /= wn; wz /= wn;

    const bow = (rnd() - 0.5) * 0.5 * len;
    const ctrl: number[] = [];
    // Leave A's shell, not its centre.
    ctrl.push(ax + ux * ra * 0.9 + wx * ra * 0.3, ay + uy * ra * 0.9 + wy * ra * 0.3, az + uz * ra * 0.9);
    for (let i = 1; i <= 3; i++) {
      const t = i / 4;
      const env = Math.sin(t * Math.PI);
      ctrl.push(ax + dx * t + wx * bow * env, ay + dy * t + wy * bow * env, az + dz * t + wz * bow * env);
    }
    // Land on B's shell and wind around it.
    for (const th of [0, 0.7, 1.5, 2.3]) {
      const c = Math.cos(th), sn = Math.sin(th);
      const r = rb * (th === 0 ? 1 : 1.05);
      ctrl.push(bx - (ux * c + wx * sn) * r, by - (uy * c + wy * sn) * r, bz - (uz * c + wz * sn) * r);
    }
    pushEdge(sampleSpline(ctrl, 30), STYLE.LINK, t0, t0 + 0.4, step);
  };

  // ---- the rail: invisible scaffolding, one row per panel, flat in z --------

  const railX: number[] = [0];
  const railY: number[] = [0];
  const spineStep: number[] = [];
  {
    let len = step0;
    for (let k = 0; k + 1 < levels; k++) {
      // The rail swings from side to side: the reader is meant to feel carried,
      // not lowered down a plumb line.
      const ang = (rnd() - 0.5) * 2 * swing;
      railX.push(railX[k] + Math.sin(ang) * len);
      railY.push(railY[k] + Math.cos(ang) * len);
      spineStep.push(len);
      len *= growth;
    }
  }
  const stepAt = (k: number) => spineStep[Math.min(k, spineStep.length - 1)];
  const dirAt = (k: number) => {
    const a = Math.min(k, levels - 2);
    const dx = railX[a + 1] - railX[a];
    const dy = railY[a + 1] - railY[a];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l] as const;
  };

  // ---- clusters: LEVELS × LANES tangles --------------------------------------

  const cluster: number[][] = [];
  /** Lateral and depth offset of each lane, in units of the local step. Lane 0
   *  is pinned to the rail in both; the others wander from row to row and cross
   *  over each other, which is where the macroscopic interlace comes from. */
  const laneOff: number[] = [];
  const laneZ: number[] = [];
  for (let j = 0; j < lanes; j++) {
    const rank = j === 0 ? 0 : Math.ceil(j / 2) * (j % 2 === 1 ? -1 : 1);
    laneOff.push(rank * laneSpread);
    laneZ.push(j === 0 ? 0 : (rnd() - 0.5) * 2 * laneDepth);
  }
  const laneLimit = ((lanes - 1) / 2) * laneSpread * 1.6;
  const depthLimit = laneDepth * 1.8;

  for (let k = 0; k < levels; k++) {
    const len = stepAt(k);
    const [dx, dy] = dirAt(k);
    const px = -dy;
    const py = dx;
    const row: number[] = [];
    for (let j = 0; j < lanes; j++) {
      if (j > 0) {
        const w = laneOff[j] + (rnd() - 0.5) * 0.9;
        laneOff[j] = w < -laneLimit ? -laneLimit : w > laneLimit ? laneLimit : w;
        const v = laneZ[j] + (rnd() - 0.5) * 0.2;
        laneZ[j] = v < -depthLimit ? -depthLimit : v > depthLimit ? depthLimit : v;
      }
      const mag = laneOff[j] * len;
      const along = (rnd() - 0.5) * 0.24 * len;
      const x = railX[k] + px * mag + dx * along;
      const y = railY[k] + py * mag + dy * along;
      const z = laneZ[j] * len;
      // Lane 0 lands on the whole number: `s` is the panel ordinal, and the
      // camera would drift off the panels if the rail were jittered too.
      const arrival = j === 0 ? k : k + 0.06 + rnd() * 0.3;
      nodes.push({ x, y, z, gen: j === 0 ? 0 : 1, arrival });
      row.push(nodes.length - 1);
    }
    cluster.push(row);
  }

  // ---- development bundles: row k → row k+1, lanes crossing -------------------

  const spine: number[] = [];
  const spineEdge: number[] = [];
  for (let k = 0; k < levels; k++) spine.push(cluster[k][0]);

  for (let k = 0; k + 1 < levels; k++) {
    const len = stepAt(k);
    // The rail bundle first, so its lead strand spans exactly [k, k+1] and
    // stays flat in z.
    spineEdge.push(bundle(cluster[k][0], cluster[k + 1][0], 3, 0.2, len, true));

    for (let j = 0; j < lanes; j++) {
      const targets: number[] = [];
      if (j > 0) targets.push(j); // lane 0's straight run is the rail bundle
      // A crossing connection to another lane: this is what interlaces the
      // fronts, and it is the reason the tissue never reads as one road.
      if (rnd() < 0.8) {
        const t = (j + 1 + Math.floor(rnd() * (lanes - 1))) % lanes;
        targets.push(t);
      }
      for (const t of targets) {
        const members = 2 + Math.floor(rnd() * 3);
        bundle(cluster[k][j], cluster[k + 1][t], members, 0.2, len);
      }
    }
  }

  // ---- weft: the thin connectives --------------------------------------------

  for (let k = 0; k < levels; k++) {
    const len = stepAt(k);
    const row = cluster[k];
    const late = Math.max(...row.map((id) => nodes[id].arrival)) + 0.15;
    for (let j = 0; j + 1 < lanes; j++) {
      const A = nodes[row[j]];
      const B = nodes[row[j + 1]];
      strand(A.x, A.y, A.z, B.x, B.y, B.z, 3, late, late + 0.35, WEFT_SAMPLES,
        (rnd() - 0.5) * 0.5 * len, 0, 0, 1, 0, len);
    }
    if (lanes > 2 && rnd() < 0.45) {
      const A = nodes[row[0]];
      const B = nodes[row[lanes - 1]];
      strand(A.x, A.y, A.z, B.x, B.y, B.z, 3, late + 0.1, late + 0.5, WEFT_SAMPLES,
        (rnd() - 0.5) * 0.9 * len, 0, 0, 1, 0, len);
    }
    // Skip links, two rows down: long lazy curves that tie the mesh together.
    if (k + 2 < levels) {
      for (let j = 0; j < lanes; j++) {
        if (rnd() > 0.4) continue;
        const A = nodes[row[j]];
        const B = nodes[cluster[k + 2][Math.floor(rnd() * lanes)]];
        strand(A.x, A.y, A.z, B.x, B.y, B.z, 3, B.arrival - 0.5, B.arrival + 0.2,
          SKIP_SAMPLES, (rnd() - 0.5) * 0.8 * len, 0, 0, 1, 0, len);
      }
    }
  }

  // ---- the entry: several strands out of the dark, already braided -----------

  {
    const [dx, dy] = dirAt(0);
    const px = -dy;
    const py = dx;
    const len = stepAt(0);
    const count = 9;
    for (let i = 0; i < count; i++) {
      const target = nodes[cluster[0][Math.floor(rnd() * lanes)]];
      const spreadX = (i / (count - 1) - 0.5) * 2 * entry * 0.42;
      const ax = railX[0] + px * spreadX - dx * entry;
      const ay = railY[0] + py * spreadX - dy * entry;
      const az = (rnd() - 0.5) * 2 * laneDepth * entry * 0.5;
      strand(ax, ay, az, target.x, target.y, target.z, i % 3, -1, -0.2, DEV_SAMPLES,
        (rnd() - 0.5) * 0.3 * entry, 0.26 * entry * (0.6 + rnd()),
        0.12 * entry * (0.5 + rnd()), 0.9 + rnd() * 0.8, (i / count) * TAU, len);
    }
  }

  // ---- the tangles, last: they are the bulk, and the ceiling bites here ------

  const radius: number[][] = [];
  for (let k = 0; k < levels; k++) {
    const len = stepAt(k);
    const row: number[] = [];
    for (let j = 0; j < lanes; j++) {
      const nd = nodes[cluster[k][j]];
      // `coreSwell` is the node-weight knob. The density comes from the radius
      // band, the centre jitter and the turn count; this is purely how much of
      // the frame a node takes. At 3 the biggest nodes are about half the row
      // pitch across; past ~4 they swallow their neighbours and the weave stops
      // reading as a weave.
      const R = len * (0.08 + rnd() * 0.1) * coreSwell;
      row.push(R);
      tangleAt(nd.x, nd.y, nd.z, R, len * nucleusR, nd.arrival, threads, len);
    }
    radius.push(row);
  }

  // ---- orbits that leave a node to wrap a neighbouring one -------------------

  for (let k = 0; k < levels; k++) {
    const len = stepAt(k);
    for (let j = 0; j < lanes; j++) {
      const A = nodes[cluster[k][j]];
      const ra = radius[k][j];
      for (let n = 0; n < 2 && edges.length < maxEdges; n++) {
        // Same row next lane, or somewhere on the next row — near enough that
        // the orbit reads as one node's fibre catching another.
        const nextRow = n === 1 && k + 1 < levels;
        const kk = nextRow ? k + 1 : k;
        const jj = nextRow
          ? (j + 1 + Math.floor(rnd() * (lanes - 1))) % lanes
          : (j + 1) % lanes;
        if (kk === k && jj === j) continue;
        const B = nodes[cluster[kk][jj]];
        orbitLink(
          A.x, A.y, A.z, ra,
          B.x, B.y, B.z, radius[kk][jj],
          Math.max(A.arrival, B.arrival) + 0.05,
          len,
        );
      }
    }
  }

  // ---- closure: the links that seal the weave into an organ -------------------
  //
  // Once the final pull-back has finished, every node reaches for others it was
  // never joined to, and a membrane zips around the outside — the open weave
  // closes into one shape. These are ordinary edges drawn by the same loop; what
  // sets them apart is the second clock (`c0`/`c1`), which the renderer only
  // advances after the reveal.
  //
  // Which rows are lit when that happens is a PAGE fact (panels, not levels), so
  // nothing here may assume a depth. Instead the membrane is generated for every
  // truncation depth k — the hull of rows 0..k — and every closure edge is also
  // gated on `t0 = max arrival - 0.1`, so a link to a node that has not grown is
  // never drawn. Whatever row the reader stopped at has its own cap; the caps of
  // shallower depths become interior chords and read as more cross-links.
  //
  // LAST on purpose, after the orbit links: `strand` draws on the shared random
  // stream, so any earlier position would reshuffle every tangle that follows.
  // Here the existing geometry stays byte-identical, and if the ceiling ever
  // bit, the finale is the right thing to lose first.

  const closeAt = (idx: number, c0: number, c1: number) => {
    if (idx < 0) return;
    edges[idx].c0 = c0;
    edges[idx].c1 = c1;
  };
  const rowOf = (id: number) => (id / lanes) | 0; // nodes are pushed row-major
  const seen = new Set<number>();
  const pairKey = (a: number, b: number) =>
    a < b ? a * nodes.length + b : b * nodes.length + a;

  /** 2D convex hull of node ids, counter-clockwise (Andrew's monotone chain). */
  const hullOf = (ids: number[]): number[] => {
    const pts = ids
      .slice()
      .sort((a, b) => nodes[a].x - nodes[b].x || nodes[a].y - nodes[b].y);
    const cross = (o: number, a: number, b: number) =>
      (nodes[a].x - nodes[o].x) * (nodes[b].y - nodes[o].y) -
      (nodes[a].y - nodes[o].y) * (nodes[b].x - nodes[o].x);
    const lower: number[] = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
        lower.pop();
      }
      lower.push(p);
    }
    const upper: number[] = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
        upper.pop();
      }
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  };

  // Membrane: a two-strand braid along each hull segment, bowed OUTWARD so the
  // silhouette swells rather than pinches. It zips shut last, running round the
  // perimeter, so the cross-links below are already there when it closes.
  for (let k = 1; k < levels; k++) {
    const ids: number[] = [];
    for (let r = 0; r <= k; r++) for (const id of cluster[r]) ids.push(id);
    const hull = hullOf(ids);
    if (hull.length < 3) continue;
    let gx = 0;
    let gy = 0;
    for (const id of hull) {
      gx += nodes[id].x;
      gy += nodes[id].y;
    }
    gx /= hull.length;
    gy /= hull.length;
    for (let i = 0; i < hull.length && edges.length < maxEdges; i++) {
      const a = hull[i];
      const b = hull[(i + 1) % hull.length];
      const key = pairKey(a, b);
      if (seen.has(key)) continue;
      seen.add(key);
      const A = nodes[a];
      const B = nodes[b];
      const len = stepAt(Math.max(rowOf(a), rowOf(b)));
      const dx = B.x - A.x;
      const dy = B.y - A.y;
      const seg = Math.hypot(dx, dy) || 1;
      // `strand` bows along (uy, -ux) for an in-plane segment; sign it so the
      // bow points away from the hull's centroid.
      const mx = (A.x + B.x) / 2 - gx;
      const my = (A.y + B.y) / 2 - gy;
      const out = (dy / seg) * mx - (dx / seg) * my >= 0 ? 1 : -1;
      const t0 = Math.max(A.arrival, B.arrival) - 0.1;
      const c0 = 0.4 + 0.42 * (i / hull.length);
      for (let m = 0; m < 2; m++) {
        const e = strand(
          A.x, A.y, A.z,
          B.x, B.y, B.z,
          m === 0 ? STYLE.MID : STYLE.WEFT,
          t0, t0,
          DEV_SAMPLES,
          out * (0.16 + rnd() * 0.1) * seg,
          0.03 * seg * (0.6 + rnd()),
          0.02 * seg * (0.5 + rnd()),
          0.8 + rnd(),
          m * Math.PI + rnd() * 0.4,
          len,
        );
        closeAt(e, c0 + m * 0.02, c0 + m * 0.02 + 0.15);
      }
    }
  }

  // Cross-links: each node reaches two nodes two or three rows away, and half
  // of them one more on their own row — pairs nothing else joins. Staggered at
  // random so the tissue knits itself rather than snapping shut as one.
  for (let k = 0; k < levels; k++) {
    for (let j = 0; j < lanes; j++) {
      const a = cluster[k][j];
      const A = nodes[a];
      const partners: number[] = [];
      for (let n = 0; n < 2; n++) {
        const dir = rnd() < 0.5 ? -1 : 1;
        const dk = 2 + Math.floor(rnd() * 2);
        let kk = k + dir * dk;
        if (kk < 0 || kk >= levels) kk = k - dir * dk;
        if (kk < 0 || kk >= levels) continue;
        partners.push(cluster[kk][Math.floor(rnd() * lanes)]);
      }
      if (rnd() < 0.5) {
        partners.push(cluster[k][(j + 1 + Math.floor(rnd() * (lanes - 1))) % lanes]);
      }
      for (const b of partners) {
        if (edges.length >= maxEdges) break;
        const key = pairKey(a, b);
        if (seen.has(key)) continue;
        seen.add(key);
        const B = nodes[b];
        const len = stepAt(Math.max(k, rowOf(b)));
        const c0 = rnd() * 0.5;
        const e = strand(
          A.x, A.y, A.z,
          B.x, B.y, B.z,
          STYLE.OUTER,
          Math.max(A.arrival, B.arrival) - 0.1,
          Math.max(A.arrival, B.arrival) - 0.1,
          SKIP_SAMPLES,
          (rnd() - 0.5) * 0.6 * len,
          0, 0, 1, 0,
          len,
        );
        closeAt(e, c0, c0 + 0.3);
      }
    }
  }

  return { nodes, edges, spine, spineEdge, spineStep, minX, minY, maxX, maxY, maxAbsZ };
}

/**
 * The nearest node to a point that has already grown there.
 *
 * A query, not a generator — it lives here because it is about the organism's
 * geometry, next to `spineAt` and for the same reason: the camera needs to be
 * able to look at something other than the rail. The manifesto card uses it to
 * settle on an actual node instead of on empty tissue.
 *
 * `maxArrival` is the camera's growth parameter `s`. Nodes past it have not been
 * drawn yet, and zooming into tissue that is not there reads as a bug rather
 * than as a choice, so they are skipped. Squared distance throughout: the
 * ordering is the same and there is no square root to pay for.
 */
export function nearestNode(
  org: Organism,
  x: number,
  y: number,
  maxArrival: number,
): TreeNode | null {
  let best: TreeNode | null = null;
  let bestD = Infinity;
  for (const n of org.nodes) {
    if (n.arrival > maxArrival) continue;
    const dx = n.x - x;
    const dy = n.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  return best;
}

/** A point on the rail at parameter `s`, plus the local step length the camera
 *  scales off. `s` is the float index along `spine`.
 *
 *  STRIDE 3. Reading this with a stride of 2 keeps every index in range — no
 *  NaN, no throw — and silently feeds z into x, drifting the camera off the
 *  rail with nothing to show for it. */
export function spineAt(
  org: Organism,
  s: number,
): { x: number; y: number; step: number } {
  const last = org.spineEdge.length - 1;
  const k = Math.max(0, Math.min(last, Math.floor(s)));
  const f = Math.max(0, Math.min(1, s - k));
  const e = org.edges[org.spineEdge[k]];
  const n = e.pts.length / 3 - 1;
  const g = f * n;
  const i = Math.min(n - 1, Math.floor(g));
  const gf = g - i;
  return {
    x: e.pts[i * 3] + (e.pts[(i + 1) * 3] - e.pts[i * 3]) * gf,
    y: e.pts[i * 3 + 1] + (e.pts[(i + 1) * 3 + 1] - e.pts[i * 3 + 1]) * gf,
    step: org.spineStep[k],
  };
}
