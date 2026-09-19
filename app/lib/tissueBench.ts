/**
 * The background's two instruments — never loaded unless the URL asks.
 *
 *   ?diff   paints a fixed list of states with BOTH renderers and reports how
 *           far the GPU image is from the Canvas one. This is what "identical
 *           at rest" is measured against, since the two cannot be bit-equal
 *           (see the header of tissueGl.ts).
 *   ?bench  plays the page through every panel the way a reader would — one
 *           wheel click per panel, the pointer moving throughout — and reports
 *           frame intervals per leg. Add `&renderer=2d` for the Canvas figures.
 *
 * Gated on the query string rather than on NODE_ENV, deliberately: the numbers
 * that matter are a PRODUCTION build's, and `next dev` is slower than what
 * ships. It is a dynamic import, so a reader never downloads it.
 *
 * Results land in the console and on `window.__tissue`.
 */

import { spineAt, type Organism } from "@/app/lib/tree";
import type { Camera, Pulse } from "@/app/lib/tissueStyle";

export type BenchApi = {
  org: Organism;
  canvas2d: HTMLCanvasElement;
  canvasGl: HTMLCanvasElement;
  scroller: HTMLElement;
  /** True when the GPU renderer is the one on screen. */
  onGl: () => boolean;
  size: () => { w: number; h: number; dpr: number };
  /** The descent camera at `s`, and the pull-back framing — the component's own
   *  constants, so the states here are ones the page can actually reach. */
  descent: (s: number) => Camera;
  reveal: (s: number) => Camera & { r: number };
  paint: (
    s: number,
    cl: number,
    pu: Pulse | null,
    c: Camera,
    rect: DOMRect | null,
    force?: "2d",
  ) => void;
};

type State = {
  name: string;
  s: number;
  cl: number;
  cam: Camera;
  pulse: Pulse | null;
  rect: DOMRect | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function states(api: BenchApi): State[] {
  const { w: W, h: H } = api.size();
  const segs = api.org.spineEdge.length;
  const tilt = (c: Camera, yaw: number, pitch: number): Camera => ({ ...c, yaw, pitch });
  const out: State[] = [];
  const add = (name: string, s: number, extra: Partial<State> = {}) =>
    out.push({ name, s, cl: 0, cam: api.descent(s), pulse: null, rect: null, ...extra });

  add("s=0.5", 0.5);
  add("s=1", 1);
  // A resting state with partially grown edges: the growing tip has to match.
  add("s=2.37", 2.37);
  add("s=2.37 tilt max", 2.37, { cam: tilt(api.descent(2.37), 0.5, 0.4) });
  add("s=3", 3);
  add("s=3.5 panel mid-slide", 3.5, { rect: new DOMRect(0, Math.round(H * 0.45), W, H) });
  add("s=4 panel parked", 4, { rect: new DOMRect(0, 0, W, H) });
  add("s=4 panel parked tilt", 4, {
    rect: new DOMRect(0, 0, W, H),
    cam: tilt(api.descent(4), -0.5, -0.4),
  });
  add("s=5", 5);

  const sEnd = Math.min(segs, 6);
  const r = api.reveal(sEnd);
  const rc: Camera = { x: r.x, y: r.y, logS: r.logS, focus: r.focus, yaw: 0, pitch: 0 };
  add("reveal cl=0", sEnd, { cam: rc });
  add("reveal cl=0.5", sEnd, { cam: rc, cl: 0.5 });
  add("reveal cl=1", sEnd, { cam: rc, cl: 1 });
  add("reveal cl=1 mid-beat", sEnd, {
    cam: rc,
    cl: 1,
    pulse: { x: r.x, y: r.y, inv: 1 / (r.r || 1), amp: 0.035, phase: 0.05, lag: 0.3 },
  });
  // Touch spineAt so a future change of its signature breaks HERE, loudly,
  // rather than silently leaving `descent` as the only camera under test.
  void spineAt(api.org, 0);
  return out;
}

/** Both canvases flattened onto carbon, the way the wrapper's `bg-carbon` shows
 *  them — premultiplied pixels read back raw would compare alpha, not colour. */
function grab(src: HTMLCanvasElement, cw: number, ch: number): Uint8ClampedArray {
  const scratch = document.createElement("canvas");
  scratch.width = cw;
  scratch.height = ch;
  const ctx = scratch.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "rgb(5, 5, 5)";
  ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(src, 0, 0);
  return ctx.getImageData(0, 0, cw, ch).data;
}

function compare(a: Uint8ClampedArray, b: Uint8ClampedArray, cw: number, ch: number) {
  const n = cw * ch;
  const err = new Float32Array(n);
  const hist = new Uint32Array(256);
  let sum = 0;
  let lumA = 0;
  let lumB = 0;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    const d0 = Math.abs(a[o] - b[o]);
    const d1 = Math.abs(a[o + 1] - b[o + 1]);
    const d2 = Math.abs(a[o + 2] - b[o + 2]);
    const d = Math.max(d0, d1, d2);
    err[i] = d;
    hist[d]++;
    sum += (d0 + d1 + d2) / 3;
    lumA += a[o] + a[o + 1] + a[o + 2];
    lumB += b[o] + b[o + 1] + b[o + 2];
  }
  // p99.9 of the raw per-pixel error, off the histogram.
  let seen = 0;
  let p999 = 255;
  const cut = n * 0.999;
  for (let v = 0; v < 256; v++) {
    seen += hist[v];
    if (seen >= cut) { p999 = v; break; }
  }
  // Max after a 3×3 box blur: what is left once single-pixel anti-aliasing
  // disagreements average out — i.e. an error in WIDTH, ALPHA or POSITION.
  let blurMax = 0;
  let atX = 0;
  let atY = 0;
  for (let y = 1; y < ch - 1; y++) {
    for (let x = 1; x < cw - 1; x++) {
      const i = y * cw + x;
      const v =
        (err[i - cw - 1] + err[i - cw] + err[i - cw + 1] +
          err[i - 1] + err[i] + err[i + 1] +
          err[i + cw - 1] + err[i + cw] + err[i + cw + 1]) / 9;
      if (v > blurMax) {
        blurMax = v;
        atX = x;
        atY = y;
      }
    }
  }
  return {
    mean: +(sum / n).toFixed(3),
    p999,
    blurMax: +blurMax.toFixed(1),
    at: `${atX},${atY}`,
    // The integrated light. Anti-aliasing moves it between neighbours without
    // changing it; a stroke a fraction too wide or too bright changes it.
    lum: +((lumB / (lumA || 1) - 1) * 100).toFixed(2),
  };
}

function zoom(a: Uint8ClampedArray, b: Uint8ClampedArray, cw: number, at: string) {
  const [cx, cy] = at.split(",").map(Number);
  const R = 24;
  const Z = 8;
  const out = document.createElement("canvas");
  out.width = (R * 2 * Z + 8) * 3 - 8;
  out.height = R * 2 * Z;
  out.style.cssText = "position:fixed;left:8px;top:8px;z-index:99999;border:1px solid #fff";
  const ctx = out.getContext("2d")!;
  [a, b].forEach((img, side) => {
    for (let y = 0; y < R * 2; y++) {
      for (let x = 0; x < R * 2; x++) {
        const o = ((cy - R + y) * cw + (cx - R + x)) * 4;
        ctx.fillStyle = `rgb(${img[o] ?? 0}, ${img[o + 1] ?? 0}, ${img[o + 2] ?? 0})`;
        ctx.fillRect(side * (R * 2 * Z + 8) + x * Z, y * Z, Z, Z);
      }
    }
  });
  // Third pane: the error itself, signed — red where the GPU is darker than the
  // Canvas, green where it is brighter — so a shift reads as a red/green pair
  // and a missing stroke as one colour alone.
  for (let y = 0; y < R * 2; y++) {
    for (let x = 0; x < R * 2; x++) {
      const o = ((cy - R + y) * cw + (cx - R + x)) * 4;
      const d = ((b[o + 2] ?? 0) - (a[o + 2] ?? 0)) * 3;
      ctx.fillStyle = d < 0 ? `rgb(${-d}, 0, 0)` : `rgb(0, ${d}, 0)`;
      ctx.fillRect(2 * (R * 2 * Z + 8) + x * Z, y * Z, Z, Z);
    }
  }
  document.body.appendChild(out);
}

async function runDiff(api: BenchApi) {
  if (!api.onGl()) {
    console.warn("tissue diff: the GPU renderer is not active, nothing to compare");
    return;
  }
  const { w: W, h: H, dpr } = api.size();
  const cw = Math.round(W * dpr);
  const ch = Math.round(H * dpr);
  const rows: Record<string, unknown>[] = [];
  // `?diff=<state name>` also pins the worst 48 px of that state to the screen,
  // Canvas | GPU, eight times enlarged — where the number comes from.
  const zoomOn = new URLSearchParams(window.location.search).get("diff");

  for (const st of states(api)) {
    api.paint(st.s, st.cl, st.pulse, st.cam, st.rect);
    // Same task as the render: the drawing buffer is not preserved past it.
    const gl = grab(api.canvasGl, cw, ch);

    // The Canvas path's store is 0×0 while the GPU one is live; lend it one.
    api.canvas2d.width = cw;
    api.canvas2d.height = ch;
    api.paint(st.s, st.cl, st.pulse, st.cam, st.rect, "2d");
    const c2d = grab(api.canvas2d, cw, ch);
    api.canvas2d.width = 0;
    api.canvas2d.height = 0;

    const r = compare(c2d, gl, cw, ch);
    if (zoomOn === st.name) zoom(c2d, gl, cw, r.at);
    const pass = r.mean < 0.5 && r.blurMax < 6 && r.p999 < 24 && Math.abs(r.lum) < 1;
    rows.push({ state: st.name, ...r, pass });
    await sleep(0);
  }
  console.table(rows);
  (window as unknown as { __tissue: unknown }).__tissue = { diff: rows };
}

async function runBench(api: BenchApi) {
  const { w: W, h: H } = api.size();
  const measure = async (ms: number) => {
    const dts: number[] = [];
    let last = performance.now();
    let run = true;
    const tick = (t: number) => {
      dts.push(t - last);
      last = t;
      if (run) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const t0 = performance.now();
    let k = 0;
    while (performance.now() - t0 < ms) {
      k++;
      window.dispatchEvent(
        new PointerEvent("pointermove", {
          clientX: W / 2 + W * 0.42 * Math.sin(k / 9),
          clientY: H / 2 + H * 0.4 * Math.cos(k / 7),
          bubbles: true,
        }),
      );
      await sleep(16);
    }
    run = false;
    await sleep(40);
    const d = dts.slice(2).sort((a, b) => a - b);
    const n = d.length;
    const at = (q: number) => +d[Math.min(n - 1, Math.floor(n * q))].toFixed(1);
    return { frames: n, p50: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1), over17: d.filter((x) => x > 17.5).length };
  };
  const wheel = (dy: number) =>
    api.scroller.dispatchEvent(new WheelEvent("wheel", { deltaY: dy, bubbles: true, cancelable: true }));

  await sleep(4500); // the page's own load is slow on every device
  const rows: Record<string, unknown>[] = [];
  const panels = 5;
  for (let i = 1; i <= panels; i++) {
    const m = measure(2400);
    wheel(100);
    rows.push({ leg: `→ panel ${i}`, ...(await m) });
  }
  rows.push({ leg: "last panel, beating, 10 s", ...(await measure(10000)) });
  for (let i = panels - 1; i >= 0; i--) {
    const m = measure(2400);
    wheel(-100);
    rows.push({ leg: `← panel ${i}`, ...(await m) });
  }
  console.table(rows);
  (window as unknown as { __tissue: unknown }).__tissue = {
    renderer: api.onGl() ? "gl" : "2d",
    bench: rows,
  };
}

export function attach(api: BenchApi, mode: { bench: boolean; diff: boolean }): void {
  // For poking at a state by hand from the console.
  (window as unknown as { __tissueApi: BenchApi }).__tissueApi = api;
  if (mode.diff) void runDiff(api);
  else if (mode.bench) void runBench(api);
}
