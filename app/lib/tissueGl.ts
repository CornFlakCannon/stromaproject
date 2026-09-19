/**
 * The tissue, drawn by the GPU.
 *
 * Why this exists. The Canvas2D path costs by the PRIMITIVE: measured on a
 * desktop, the JavaScript between the first path command and the last `stroke()`
 * is 1–2.5 ms, and the other ~30 ms of a slow frame is the browser stroking
 * 8–15 thousand curves. Nothing ever leaves the frame during the descent (see
 * VIS_STEPS in StromaCanvas.tsx), so that count only grows, and from the fourth
 * panel on it does not fit in 16 ms. Here the geometry is uploaded ONCE and a
 * frame is a handful of uniforms, so growth stops costing anything.
 *
 * What has to survive the move is one rule of Canvas2D (see STYLE in tree.ts):
 * a `stroke()` fills the UNION of its path once, and only separate strokes
 * composite against each other. Naive additive line rendering would sum every
 * crossing inside a bucket and blow each node out to white. So a frame is two
 * kinds of pass:
 *
 *   1. COVERAGE. Buckets are drawn four at a time into one RGBA8 texture, one
 *      bucket per channel (`colorMask`), blended with MAX — which IS the union:
 *      exact wherever either strand is solid, and between the consecutive
 *      capsules of one strand, where it doubles as the round join.
 *   2. COMPOSITE. A full-screen pass turns those four coverages into colour,
 *      and this is the only place the two palettes differ — additive violet on
 *      carbon, carbon ink over the violet flood inside the panel's band, the
 *      two regions picked by scissor. Coverage is palette-independent, so the
 *      geometry is rasterised once however the panel cuts the screen.
 *
 * The composition is mathematically the Canvas one: saturating adds commute
 * with a single clamped sum, and since every bucket inks the panel in the SAME
 * carbon, `source-over` reduces to `prod(1 - a·cov)` and its order stops
 * mattering. The anti-aliasing is area coverage, as Skia's is, but it is not
 * bit-identical and cannot be: measured with `?diff` (lib/tissueBench.ts) the
 * mean error is under half a level in 255 and the integrated light within 0.4%.
 *
 * No React, no scroll state: the component hands over a frame and this paints.
 */

import { BANDS, STYLES, type Organism } from "@/app/lib/tree";
import {
  BAND_W,
  CARBON_RGB,
  LOD_MUL,
  LOD_PX,
  MAX_WIDTH,
  MIN_DEVICE_W,
  NBUCKET,
  SMOOTH_PX,
  VIOLA_RGB,
  WIDTH,
  inkAlpha,
  litAlpha,
  mkProj,
  type Camera,
  type Pulse,
} from "@/app/lib/tissueStyle";

/** Floats per instance: P[i-1], P[i], P[i+1], (t0 t1 c0 c1), (i nseg sag extent). */
const STRIDE = 17;
const BYTES = STRIDE * 4;
/** Most chords one quadratic piece is ever cut into. The aside zoom on a hi-dpi
 *  screen asks for ~24; past this the shader clamps and the curve is a hair
 *  coarser, which is the right way round to fail. */
const NMAX = 32;
/** Flattening tolerance in DEVICE pixels. A piece cut into n chords is off by
 *  exactly `deviation / n²`, so this is the largest error a curve ever shows.
 *  Measured, not guessed: tightening it from 0.15 to 0.06 moved the diff
 *  against Canvas by nothing, so what is left there is not flattening. */
const TOL = 0.1;

export type TissueFrame = {
  s: number;
  cl: number;
  pulse: Pulse | null;
  /** The beat's alpha flush, already evaluated — see PULSE_GLOW. */
  gain: number;
  cam: Camera;
  /** CSS size and the dpr the backing store was sized with. */
  W: number;
  H: number;
  dpr: number;
  /** The violet panel's band in DEVICE pixels from the top, already rounded
   *  outward by the caller. Equal when the panel is off screen. */
  topDev: number;
  botDev: number;
};

export type TissueGl = {
  /** Backing-store size, device pixels. */
  resize: (cw: number, ch: number) => void;
  render: (f: TissueFrame) => void;
  dispose: () => void;
  /** True between `webglcontextlost` and `webglcontextrestored`. */
  readonly lost: boolean;
};

type Packed = {
  data: Float32Array;
  /** Per bucket, its edges in draw order: grown edges by `t0`, then closure
   *  edges by `c0` — so what is lit is always a prefix-ish run, never scattered. */
  edges: Int32Array[];
  /** By EDGE index: where its instances start, and how many (= its segments). */
  first: Int32Array;
  count: Int32Array;
};

/**
 * One instance per SEGMENT i ∈ 1..nseg, carrying P[i-1], P[i] and P[i+1] (the
 * last point doubled at the end). Three points are enough for every case the
 * Canvas path distinguishes: the quadratic piece through a midpoint pair, the
 * first piece that starts on P[0] itself, the closing straight, and the growing
 * tip — which is a lerp between two of the three.
 */
export function packOrganism(org: Organism): Packed {
  const n = org.edges.length;
  const byBucket: number[][] = Array.from({ length: NBUCKET }, () => []);
  for (let i = 0; i < n; i++) {
    const e = org.edges[i];
    byBucket[e.band * STYLES + e.style].push(i);
  }
  const closure = (i: number) => org.edges[i].c1 > org.edges[i].c0;
  for (const list of byBucket) {
    list.sort((a, b) => {
      const ca = closure(a);
      const cb = closure(b);
      if (ca !== cb) return ca ? 1 : -1;
      return ca
        ? org.edges[a].c0 - org.edges[b].c0 || a - b
        : org.edges[a].t0 - org.edges[b].t0 || a - b;
    });
  }

  let total = 0;
  for (const e of org.edges) total += e.pts.length / 3 - 1;
  const data = new Float32Array(total * STRIDE);
  const first = new Int32Array(n);
  const count = new Int32Array(n);

  let at = 0;
  for (const list of byBucket) {
    for (const ei of list) {
      const e = org.edges[ei];
      const pts = e.pts;
      const nseg = pts.length / 3 - 1;
      const extent = Math.max(e.maxX - e.minX, e.maxY - e.minY);
      first[ei] = at;
      count[ei] = nseg;
      for (let i = 1; i <= nseg; i++) {
        const o = at * STRIDE;
        const a = (i - 1) * 3;
        const b = i * 3;
        const c = Math.min(i + 1, nseg) * 3;
        data[o] = pts[a]; data[o + 1] = pts[a + 1]; data[o + 2] = pts[a + 2];
        data[o + 3] = pts[b]; data[o + 4] = pts[b + 1]; data[o + 5] = pts[b + 2];
        data[o + 6] = pts[c]; data[o + 7] = pts[c + 1]; data[o + 8] = pts[c + 2];
        data[o + 9] = e.t0; data[o + 10] = e.t1; data[o + 11] = e.c0; data[o + 12] = e.c1;
        data[o + 13] = i; data[o + 14] = nseg; data[o + 15] = e.sag; data[o + 16] = extent;
        at++;
      }
    }
  }
  return { data, edges: byBucket.map((l) => Int32Array.from(l)), first, count };
}

// The growth logic below is the Canvas path's, case for case (drawTree in
// StromaCanvas.tsx): the lit points are q[0..M], with q[M] the lerped tip when
// there is one; piece i runs from mid(q[i-1], q[i]) — q[0] itself for the first
// — to mid(q[i], q[i+1]) with q[i] as control; the last is a straight to q[M].
// Lerp in WORLD, warp, THEN project, for every point the same way, and take the
// midpoints in screen space — exactly what `put` and `q[]` do.
const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_p0;
layout(location=1) in vec3 a_p1;
layout(location=2) in vec3 a_p2;
layout(location=3) in vec4 a_time;
layout(location=4) in vec4 a_meta;
uniform vec4 u_cam;   // cx, cy, scale, dpr
uniform vec4 u_rot;   // cos yaw, sin yaw, cos pitch, sin pitch
uniform vec4 u_view;  // W/2, H·focus (CSS px), canvas w, canvas h (device px)
uniform vec4 u_grow;  // s, cl, lod (world units), half width (device px)
uniform vec4 u_pulse; // centre x, y, 1/radius, amplitude (0 = no beat)
uniform vec4 u_misc;  // beat phase, beat lag, chords drawn per piece, SMOOTH_PX
flat out vec4 v_seg;
flat out float v_hw;

float bump(float u, float c, float w) {
  float d = u - c;
  d -= floor(d + 0.5);
  return exp(-(d * d) / (w * w));
}
float beat(float u) { return bump(u, 0.0, 0.09) + 0.55 * bump(u, 0.16, 0.07); }

vec2 proj(vec3 w) {
  if (u_pulse.w > 0.0) {
    vec2 d = w.xy - u_pulse.xy;
    float rr = sqrt(dot(d, d) + w.z * w.z) * u_pulse.z;
    float k = 1.0 - u_pulse.w * beat(u_misc.x - rr * u_misc.y);
    w = vec3(u_pulse.xy + d * k, w.z * k);
  }
  float rx = w.x - u_cam.x;
  float ry = w.y - u_cam.y;
  float x1 = rx * u_rot.x + w.z * u_rot.y;
  float z1 = -rx * u_rot.y + w.z * u_rot.x;
  float y1 = ry * u_rot.z - z1 * u_rot.w;
  return vec2(u_view.x + x1 * u_cam.z, u_view.y + y1 * u_cam.z) * u_cam.w;
}

vec2 bez(vec2 a, vec2 c, vec2 b, float t) {
  float m = 1.0 - t;
  return a * (m * m) + c * (2.0 * m * t) + b * (t * t);
}

void main() {
  float i = a_meta.x;
  float nseg = a_meta.y;
  bool clo = a_time.w > a_time.z;
  bool dead = a_time.x > u_grow.x || (clo && a_time.z > u_grow.y) || a_meta.w < u_grow.z;

  float span = a_time.y - a_time.x;
  float local = clo
    ? min(1.0, (u_grow.y - a_time.z) / (a_time.w - a_time.z))
    : (span > 0.0 ? min(1.0, (u_grow.x - a_time.x) / span) : 1.0);
  float reach = max(0.0, local) * nseg;
  float whole = floor(reach);
  float frac = reach - whole;
  bool tip = whole < nseg && frac > 0.0;
  float M = whole + (tip ? 1.0 : 0.0);
  // Also the "single point is not a subpath" rule: M < 1 kills every instance.
  dead = dead || i > M;

  vec3 w1 = (tip && i == M) ? mix(a_p0, a_p1, frac) : a_p1;
  vec3 w2 = (tip && i + 1.0 == M) ? mix(a_p1, a_p2, frac) : a_p2;
  vec2 q0 = proj(a_p0);
  vec2 q1 = proj(w1);
  vec2 q2 = proj(w2);

  int k = gl_VertexID / 4;
  int corner = gl_VertexID - k * 4;
  vec2 A;
  vec2 B;
  if (a_meta.z * u_cam.z <= u_misc.w) {
    A = q0; B = q1;
    dead = dead || k > 0;
  } else if (i == M) {
    A = M == 1.0 ? q0 : 0.5 * (q0 + q1);
    B = q1;
    dead = dead || k > 0;
  } else {
    vec2 a = i == 1.0 ? q0 : 0.5 * (q0 + q1);
    vec2 b = 0.5 * (q1 + q2);
    float n = clamp(ceil(sqrt(length(a - 2.0 * q1 + b) / (4.0 * ${TOL.toFixed(3)}))), 1.0, u_misc.z);
    dead = dead || float(k) >= n;
    A = bez(a, q1, b, float(k) / n);
    B = bez(a, q1, b, float(k + 1) / n);
  }

  if (dead) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    return;
  }

  // The capsule's bounding quad: the stroke plus a pixel for the ramp.
  float r = u_grow.w + 1.0;
  vec2 d = B - A;
  float len = length(d);
  d = len > 1e-5 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-d.y, d.x);
  vec2 base = corner < 2 ? A - d * r : B + d * r;
  vec2 pos = base + nrm * (((corner & 1) == 0) ? r : -r);

  v_seg = vec4(A, B);
  v_hw = u_grow.w;
  gl_Position = vec4(pos.x / u_view.z * 2.0 - 1.0, 1.0 - pos.y / u_view.w * 2.0, 0.0, 1.0);
}
`;

// Coverage of one capsule, as AREA — the fraction of the pixel's unit square the
// stroke covers — because that is what Skia computes, and a plain distance ramp
// is measurably wrong against it in both directions: a pixel-wide ramp renders
// diagonals too sharp, one widened to the square's projected span too soft.
// `edge` is the exact box filter of a half-plane whose boundary passes at signed
// distance t from the pixel centre with unit normal g: linear through the
// middle, quadratic where the boundary clips a corner. The stroke is the near
// edge minus the far one — a slab — which also keeps a hairline from being
// over-counted when both of its edges fall inside one pixel.
const FRAG = `#version 300 es
precision highp float;
uniform vec4 u_view;
flat in vec4 v_seg;
flat in float v_hw;
out vec4 o;

float edge(float t, vec2 g) {
  float a = max(abs(g.x), abs(g.y));
  float b = min(abs(g.x), abs(g.y));
  float h1 = 0.5 * (a + b);
  float h2 = 0.5 * (a - b);
  float m = abs(t);
  float c = m <= h2 ? 0.5 + m / a
    : (m < h1 ? 1.0 - (h1 - m) * (h1 - m) / (2.0 * a * max(b, 1e-4)) : 1.0);
  return t >= 0.0 ? c : 1.0 - c;
}

void main() {
  vec2 p = vec2(gl_FragCoord.x, u_view.w - gl_FragCoord.y);
  vec2 pa = p - v_seg.xy;
  vec2 ba = v_seg.zw - v_seg.xy;
  float l2 = dot(ba, ba);
  float h = l2 > 1e-10 ? clamp(dot(pa, ba) / l2, 0.0, 1.0) : 0.0;
  vec2 dv = pa - ba * h;
  float d = length(dv);
  vec2 g = (h > 0.0 && h < 1.0 && l2 > 1e-10)
    ? vec2(-ba.y, ba.x) / sqrt(l2)
    : (d > 1e-4 ? dv / d : vec2(1.0, 0.0));
  float cov = edge(v_hw - d, g) - edge(-v_hw - d, g);
  o = vec4(cov);
}
`;

const COMP_VERT = `#version 300 es
void main() {
  gl_Position = vec4(float((gl_VertexID << 1) & 2) * 2.0 - 1.0, float(gl_VertexID & 2) * 2.0 - 1.0, 0.0, 1.0);
}
`;

// Four buckets' coverage → colour, premultiplied. Mode 0 is `lighter`: the sum
// may pass 1 and the framebuffer clamps it per channel, exactly as a run of
// saturating adds would. Mode 1 is `source-over` in one colour, folded.
const COMP_FRAG = `#version 300 es
precision highp float;
uniform sampler2D u_cov;
uniform vec4 u_alpha;
uniform vec3 u_rgb;
uniform int u_mode;
out vec4 o;
void main() {
  vec4 c = texelFetch(u_cov, ivec2(gl_FragCoord.xy), 0);
  if (u_mode == 0) {
    float s = dot(c, u_alpha);
    o = vec4(u_rgb * s, s);
  } else {
    vec4 t = 1.0 - c * u_alpha;
    float keep = t.x * t.y * t.z * t.w;
    o = vec4(u_rgb * (1.0 - keep), 1.0 - keep);
  }
}
`;

function compile(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const sh = gl.createShader(type);
    if (!sh) throw new Error("tissueGl: createShader failed");
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
      throw new Error(`tissueGl: ${gl.getShaderInfoLog(sh)}`);
    }
    return sh;
  };
  const prog = gl.createProgram();
  if (!prog) throw new Error("tissueGl: createProgram failed");
  const v = make(gl.VERTEX_SHADER, vs);
  const f = make(gl.FRAGMENT_SHADER, fs);
  gl.attachShader(prog, v);
  gl.attachShader(prog, f);
  gl.linkProgram(prog);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error(`tissueGl: ${gl.getProgramInfoLog(prog)}`);
  }
  return prog;
}

/**
 * Null when the device cannot do this WELL — no WebGL2, or only a software
 * rasteriser (`failIfMajorPerformanceCaveat`), which would be slower than the
 * Canvas path it replaces. The caller keeps that path for exactly this.
 *
 * `onChange` fires when the context is lost or comes back, so the caller can
 * swap canvases and repaint.
 */
export function createTissueGl(
  canvas: HTMLCanvasElement,
  org: Organism,
  onChange: () => void,
): TissueGl | null {
  const ctx = canvas.getContext("webgl2", {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    depth: false,
    stencil: false,
    failIfMajorPerformanceCaveat: true,
  });
  if (!ctx) return null;
  const gl: WebGL2RenderingContext = ctx;

  const packed = packOrganism(org);
  let lost = false;

  // Everything the context owns, rebuilt whole when it comes back.
  let res: {
    draw: WebGLProgram;
    comp: WebGLProgram;
    vao: WebGLVertexArrayObject;
    empty: WebGLVertexArrayObject;
    inst: WebGLBuffer;
    index: WebGLBuffer;
    tex: WebGLTexture;
    fbo: WebGLFramebuffer;
    u: Record<string, WebGLUniformLocation | null>;
    cw: number;
    ch: number;
  } | null = null;

  const allocCoverage = (cw: number, ch: number) => {
    if (!res) return;
    gl.bindTexture(gl.TEXTURE_2D, res.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, Math.max(1, cw), Math.max(1, ch), 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    res.cw = cw;
    res.ch = ch;
  };

  const init = () => {
    const draw = compile(gl, VERT, FRAG);
    const comp = compile(gl, COMP_VERT, COMP_FRAG);

    const vao = gl.createVertexArray()!;
    const empty = gl.createVertexArray()!;
    const inst = gl.createBuffer()!;
    const index = gl.createBuffer()!;

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, inst);
    gl.bufferData(gl.ARRAY_BUFFER, packed.data, gl.STATIC_DRAW);
    for (let a = 0; a < 5; a++) {
      gl.enableVertexAttribArray(a);
      gl.vertexAttribDivisor(a, 1);
    }
    // NMAX quads, four corners each; the corner and the chord index are read
    // back out of gl_VertexID, so there is no per-vertex attribute at all.
    const idx = new Uint16Array(NMAX * 6);
    for (let k = 0; k < NMAX; k++) {
      const v = k * 4;
      idx.set([v, v + 1, v + 2, v + 2, v + 1, v + 3], k * 6);
    }
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);

    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer()!;

    const u: Record<string, WebGLUniformLocation | null> = {};
    for (const name of ["u_cam", "u_rot", "u_view", "u_grow", "u_pulse", "u_misc"]) {
      u[name] = gl.getUniformLocation(draw, name);
    }
    for (const name of ["u_cov", "u_alpha", "u_rgb", "u_mode"]) {
      u[name] = gl.getUniformLocation(comp, name);
    }

    res = { draw, comp, vao, empty, inst, index, tex, fbo, u, cw: 0, ch: 0 };
    allocCoverage(canvas.width, canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  };

  const onLost = (e: Event) => {
    // Without this the browser never sends `restored`.
    e.preventDefault();
    lost = true;
    res = null;
    onChange();
  };
  const onRestored = () => {
    try {
      init();
      lost = false;
    } catch {
      lost = true;
    }
    onChange();
  };
  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);

  try {
    init();
  } catch (err) {
    canvas.removeEventListener("webglcontextlost", onLost);
    canvas.removeEventListener("webglcontextrestored", onRestored);
    console.warn(err);
    return null;
  }

  // Per-bucket scratch, reused: the draw path allocates nothing per frame.
  const lo = new Int32Array(NBUCKET);
  const hi = new Int32Array(NBUCKET);
  const sagMax = new Float32Array(NBUCKET);
  const live = new Int32Array(NBUCKET);
  const lit = [0, 0, 0, 0];
  const ink = [0, 0, 0, 0];

  const render = (f: TissueFrame) => {
    const r = res;
    if (!r || lost) return;
    const { W, H, dpr } = f;
    const cw = canvas.width;
    const ch = canvas.height;
    if (r.cw !== cw || r.ch !== ch) allocCoverage(cw, ch);

    const p = mkProj(f.cam, W, H);
    const scale = p.scale;

    // The same interval cull as the Canvas path, over the whole viewport — but
    // here it only NARROWS the instance run each bucket draws. The GPU clips
    // and the shader applies the LOD and growth gates per instance, so being
    // conservative costs vertices and can never cost pixels.
    const pad = (MAX_WIDTH / 2 + 2) / scale;
    const halfW = W / (2 * scale) + pad;
    const up = p.Hf / scale + pad;
    const dn = (H - p.Hf) / scale + pad;
    const lod = LOD_PX / scale;
    const A = p.syaw * p.spit;
    const B = -p.cyaw * p.spit;
    const sPos = p.syaw > 0;
    const aPos = A > 0;
    const bPos = B > 0;

    let nLive = 0;
    for (let b = 0; b < NBUCKET; b++) {
      const list = packed.edges[b];
      let first = -1;
      let last = -1;
      let sag = 0;
      const l = lod * LOD_MUL[b % STYLES];
      for (let m = 0; m < list.length; m++) {
        const ei = list[m];
        const e = org.edges[ei];
        if (e.t0 > f.s) continue;
        if (e.c1 > e.c0 && e.c0 > f.cl) continue;
        const rxLo = e.minX - p.cx;
        const rxHi = e.maxX - p.cx;
        const x1Lo = rxLo * p.cyaw + (sPos ? e.minZ : e.maxZ) * p.syaw;
        const x1Hi = rxHi * p.cyaw + (sPos ? e.maxZ : e.minZ) * p.syaw;
        if (x1Hi < -halfW || x1Lo > halfW) continue;
        const y1Lo = (e.minY - p.cy) * p.cpit + (aPos ? rxLo : rxHi) * A + (bPos ? e.minZ : e.maxZ) * B;
        const y1Hi = (e.maxY - p.cy) * p.cpit + (aPos ? rxHi : rxLo) * A + (bPos ? e.maxZ : e.minZ) * B;
        if (y1Hi < -up || y1Lo > dn) continue;
        if (e.maxX - e.minX < l && e.maxY - e.minY < l) continue;
        if (first < 0) first = ei;
        last = ei;
        if (e.sag > sag) sag = e.sag;
      }
      if (first < 0) continue;
      lo[b] = packed.first[first];
      hi[b] = packed.first[last] + packed.count[last];
      sagMax[b] = sag;
      live[nLive++] = b;
    }

    gl.viewport(0, 0, cw, ch);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.colorMask(true, true, true, true);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    const top = Math.max(0, Math.min(ch, f.topDev));
    const bot = Math.max(top, Math.min(ch, f.botDev));
    if (bot > top) {
      // The panel's flood. Opaque, and scissored in whole device pixels, so the
      // two regions meet on a pixel boundary and there is no seam to blend.
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, ch - bot, cw, bot - top);
      gl.clearColor(VIOLA_RGB[0], VIOLA_RGB[1], VIOLA_RGB[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.SCISSOR_TEST);
    }
    if (nLive === 0) return;

    gl.enable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);

    gl.useProgram(r.draw);
    gl.uniform4f(r.u.u_cam, p.cx, p.cy, scale, dpr);
    gl.uniform4f(r.u.u_rot, p.cyaw, p.syaw, p.cpit, p.spit);
    gl.uniform4f(r.u.u_view, p.W2, p.Hf, cw, ch);
    const pu = f.pulse;
    if (pu) gl.uniform4f(r.u.u_pulse, pu.x, pu.y, pu.inv, pu.amp);
    else gl.uniform4f(r.u.u_pulse, 0, 0, 0, 0);

    for (let g = 0; g < nLive; g += 4) {
      const members = Math.min(4, nLive - g);

      // ---- coverage: up to four buckets, one channel each, MAX = union -------
      gl.bindFramebuffer(gl.FRAMEBUFFER, r.fbo);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.colorMask(true, true, true, true);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.blendEquation(gl.MAX);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(r.draw);
      gl.bindVertexArray(r.vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, r.inst);

      for (let j = 0; j < 4; j++) {
        lit[j] = 0;
        ink[j] = 0;
        if (j >= members) continue;
        const b = live[g + j];
        const st = b % STYLES;
        const bd = (b / STYLES) | 0;
        lit[j] = litAlpha(st, bd, f.gain);
        ink[j] = inkAlpha(st, bd, f.gain);

        // Never below the device-pixel floor — the same figure `lineWidth` gets.
        const hw = (Math.max(WIDTH[st] * BAND_W[bd], MIN_DEVICE_W / dpr) * dpr) / 2;
        const smooth = sagMax[b] * scale > SMOOTH_PX;
        const chords = smooth
          ? Math.max(1, Math.min(NMAX, Math.ceil(Math.sqrt((sagMax[b] * scale * dpr) / TOL)) + 1))
          : 1;
        gl.uniform4f(r.u.u_grow, f.s, f.cl, lod * LOD_MUL[st], hw);
        gl.uniform4f(r.u.u_misc, pu ? pu.phase : 0, pu ? pu.lag : 0, chords, SMOOTH_PX);

        const off = lo[b] * BYTES;
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, BYTES, off);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, BYTES, off + 12);
        gl.vertexAttribPointer(2, 3, gl.FLOAT, false, BYTES, off + 24);
        gl.vertexAttribPointer(3, 4, gl.FLOAT, false, BYTES, off + 36);
        gl.vertexAttribPointer(4, 4, gl.FLOAT, false, BYTES, off + 52);
        gl.colorMask(j === 0, j === 1, j === 2, j === 3);
        gl.drawElementsInstanced(gl.TRIANGLES, chords * 6, gl.UNSIGNED_SHORT, 0, hi[b] - lo[b]);
      }

      // ---- composite: the only place the two palettes differ -----------------
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.colorMask(true, true, true, true);
      gl.bindVertexArray(r.empty);
      gl.useProgram(r.comp);
      gl.bindTexture(gl.TEXTURE_2D, r.tex);
      gl.uniform1i(r.u.u_cov, 0);
      gl.blendEquation(gl.FUNC_ADD);
      gl.enable(gl.SCISSOR_TEST);

      gl.uniform1i(r.u.u_mode, 0);
      gl.uniform4f(r.u.u_alpha, lit[0], lit[1], lit[2], lit[3]);
      gl.uniform3f(r.u.u_rgb, VIOLA_RGB[0], VIOLA_RGB[1], VIOLA_RGB[2]);
      gl.blendFunc(gl.ONE, gl.ONE);
      if (top > 0) {
        gl.scissor(0, ch - top, cw, top);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (bot < ch) {
        gl.scissor(0, 0, cw, ch - bot);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (bot > top) {
        gl.uniform1i(r.u.u_mode, 1);
        gl.uniform4f(r.u.u_alpha, ink[0], ink[1], ink[2], ink[3]);
        gl.uniform3f(r.u.u_rgb, CARBON_RGB[0], CARBON_RGB[1], CARBON_RGB[2]);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.scissor(0, ch - bot, cw, bot - top);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      gl.disable(gl.SCISSOR_TEST);
    }
    gl.bindVertexArray(null);
  };

  return {
    resize: (cw, ch) => {
      if (res && !lost) allocCoverage(cw, ch);
    },
    render,
    dispose: () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      // Resources only — never `loseContext()`. StrictMode remounts on the same
      // canvas, a canvas hands back the same context, and a lost one stays lost.
      const r = res;
      res = null;
      if (!r || gl.isContextLost()) return;
      gl.deleteProgram(r.draw);
      gl.deleteProgram(r.comp);
      gl.deleteVertexArray(r.vao);
      gl.deleteVertexArray(r.empty);
      gl.deleteBuffer(r.inst);
      gl.deleteBuffer(r.index);
      gl.deleteTexture(r.tex);
      gl.deleteFramebuffer(r.fbo);
    },
    get lost() {
      return lost;
    },
  };
}

// Kept honest at build time: a bucket is `band * STYLES + style`, here and in
// the component, and a second band count would silently misfile every edge.
if (NBUCKET !== STYLES * BANDS) throw new Error("tissueGl: bucket layout out of sync");
