/**
 * The post studio's engine: the site's tissue, posed by hand and cut to an
 * Instagram format.
 *
 * Nothing here draws on its own. The geometry is `growOrganism()` — the same
 * organism, same seed, the site grows — and both the preview and the export go
 * through `createTissueGl`, the renderer the page itself uses, so a post is the
 * site's background and not a lookalike. What this adds is a camera you hold
 * instead of one the scroll drives, and a way to render it at a fixed size.
 *
 * WHAT STAYS FIXED AS THE PREVIEW CHANGES SIZE. The renderer measures strokes
 * in CSS pixels, so the picture is defined in a LOGICAL frame — one slide is
 * `BASE_W / thick` pixels wide — and the camera's zoom is relative to that
 * width. The preview renders the same logical frame shrunk into the screen, the
 * export renders it at the format's pixel size; the composition and the weight
 * of the lines against the frame are the same in both, only the sharpness
 * differs.
 *
 * A CAROUSEL is one wide picture, n slides across. Each slide is rendered on
 * its own with the camera's point moved off-centre by `focusX` — exact, because
 * the projection is affine — so no canvas ever has to be n slides wide.
 *
 * No React: the component hands over settings and buttons, this owns the
 * canvas, the gestures and the frame overlay's position.
 */

import { growOrganism, spineAt, type Organism } from "@/app/lib/tree";
import { createTissueGl, type TissueGl } from "@/app/lib/tissueGl";
import { VIOLA_SOLID, type Camera } from "@/app/lib/tissueStyle";

export type Format = { id: string; label: string; ratio: string; w: number; h: number };

/** Instagram's sizes. The 9:16 is the 1440 one rather than 1080 — same shape,
 *  more pixels for Instagram to compress. Every slide of a carousel takes the
 *  first one's crop, so a carousel is just one of these, n times. */
export const FORMATS: readonly Format[] = [
  { id: "storia-9x16", label: "Storia", ratio: "9:16", w: 1440, h: 2560 },
  { id: "post-4x5", label: "Post", ratio: "4:5", w: 1080, h: 1350 },
  { id: "post-3x4", label: "Post", ratio: "3:4", w: 1080, h: 1440 },
  { id: "quadrato-1x1", label: "Quadrato", ratio: "1:1", w: 1080, h: 1080 },
];

export const MAX_SLIDES = 10;

export type Settings = {
  /** Index into FORMATS. */
  format: number;
  /** 1 is a single picture; more cuts one wide picture into a carousel. */
  slides: number;
  /** Carbon ink on the violet flood — the site's violet panel — instead of
   *  violet light on carbon. */
  invert: boolean;
  /** Run the closure: the nodes link up and a membrane seals the outline. */
  sealed: boolean;
  /** How much of the weave has grown, 0 → 1 over the whole organism. */
  growth: number;
  /** Line weight against the frame. 1 is the site on a phone. */
  thick: number;
  /** Opacity of a flat layer of the ground's own colour laid over the tissue,
   *  0 → 1: it pushes the background back so type on top of the post reads. */
  veil: number;
};

export type Framing = "discesa" | "tutto" | "dritto";

export type Studio = {
  set: (s: Settings) => void;
  frame: (how: Framing) => void;
  /** Renders every slide at full size, in order. */
  exportSlides: (onProgress: (i: number, n: number) => void) => Promise<Blob[]>;
  dispose: () => void;
};

/** One slide's logical width at `thick` 1: a phone held upright, which is how
 *  the site is seen on one and how a post is seen. */
const BASE_W = 400;
/** The site's descent framing (StromaCanvas's VIS_STEPS and FOCUS_Y): rail
 *  steps per screen height, and where the lit row sits. */
const VIS_STEPS = 1.75;
const FOCUS_Y = 0.66;
/** ±80°. The pan below divides by the cosines, so a turn of 90° would leave it
 *  nowhere to go — and the tissue is shallow, so past this it is a sliver. */
const TURN_MAX = 1.4;
const ZOOM_MIN = 0.005;
const ZOOM_MAX = 50;
/** Radians per CSS pixel of drag, times the preview's shorter side. */
const TURN_RATE = 1.8;
/** Breathing room around the frame in the preview, CSS px — more below, where
 *  the gesture hint sits. */
const PAD_X = 16;
const PAD_Y = 28;
/** The preview is a preview: past 2× nobody sees the difference on the glass. */
const DPR_MAX = 2;
const CARBON = "#050505";

/** Where the camera looks and how. `zoom` is screen pixels per world unit over
 *  the logical slide width, so it survives a change of format or thickness. */
type View = { x: number; y: number; zoom: number; yaw: number; pitch: number };

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

const slideSize = (st: Settings) => {
  const f = FORMATS[st.format];
  const w = BASE_W / st.thick;
  return { f, w, h: (w * f.h) / f.w };
};

const camera = (v: View, slideW: number, focusX: number): Camera => ({
  x: v.x,
  y: v.y,
  logS: Math.log(v.zoom * slideW),
  focus: 0.5,
  focusX,
  yaw: v.yaw,
  pitch: v.pitch,
});

/** Null when the device has no usable WebGL2 — see createTissueGl. */
export function createStudio(
  area: HTMLElement,
  canvas: HTMLCanvasElement,
  frameEl: HTMLElement,
  initial: Settings,
): Studio | null {
  const org: Organism = growOrganism();
  const segs = org.spineEdge.length;
  let raf = 0;
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(draw);
  };
  const gl: TissueGl | null = createTissueGl(canvas, org, schedule);
  if (!gl) return null;

  let st = initial;
  const view: View = { x: 0, y: 0, zoom: 1, yaw: 0, pitch: 0 };
  /** The preview's geometry: the area in CSS px, and `d`, CSS px per logical
   *  px — how much the logical frame is shrunk to fit. */
  const lay = { aw: 0, ah: 0, d: 1 };
  /** The export's own renderer, made on first use and kept: a second context
   *  so the preview never has to change size under the reader's finger. */
  let ex: { c: HTMLCanvasElement; g: TissueGl } | null = null;

  const growthS = () => st.growth * segs;

  function draw() {
    raf = 0;
    const { aw, ah, d } = lay;
    if (gl!.lost || aw === 0) return;
    const dev = Math.min(window.devicePixelRatio || 1, DPR_MAX);
    const cw = Math.round(aw * dev);
    const ch = Math.round(ah * dev);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
      gl!.resize(cw, ch);
    }
    const { w } = slideSize(st);
    gl!.render({
      s: growthS(),
      cl: st.sealed ? 1 : 0,
      pulse: null,
      gain: 1,
      cam: camera(view, w, 0.5),
      // The whole area, in logical px: what lies outside the frame is drawn too
      // and dimmed by the overlay, so the crop is chosen with its surroundings.
      W: aw / d,
      H: ah / d,
      dpr: (cw * d) / aw,
      topDev: st.invert ? 0 : ch,
      botDev: ch,
    });
  }

  /** Fit the frame — all n slides — into the area, and place the overlay. */
  const relayout = () => {
    const aw = area.clientWidth;
    const ah = area.clientHeight;
    if (aw === 0 || ah === 0) return;
    const { w, h } = slideSize(st);
    const pw = w * st.slides;
    const d = Math.max(1e-3, Math.min((aw - 2 * PAD_X) / pw, (ah - 2 * PAD_Y) / h));
    lay.aw = aw;
    lay.ah = ah;
    lay.d = d;
    const fw = pw * d;
    const fh = h * d;
    frameEl.style.left = `${(aw - fw) / 2}px`;
    frameEl.style.top = `${(ah - fh) / 2}px`;
    frameEl.style.width = `${fw}px`;
    frameEl.style.height = `${fh}px`;
    schedule();
  };

  /** Move what is on screen by (dx, dy) LOGICAL px, by moving the camera's
   *  point in the world — so the turn keeps pivoting on the frame's centre.
   *  The inverse of the projection's two terms that involve the camera:
   *  ∂x1/∂cx = −cos yaw, ∂y1/∂cx = −sin yaw·sin pitch, ∂y1/∂cy = −cos pitch. */
  const pan = (dx: number, dy: number) => {
    const s = view.zoom * slideSize(st).w;
    const dcx = -dx / (s * Math.cos(view.yaw));
    view.x += dcx;
    view.y += -(dy / s + Math.sin(view.yaw) * Math.sin(view.pitch) * dcx) / Math.cos(view.pitch);
  };

  /** Zoom by `k` about a point (ox, oy) logical px from the frame's centre: the
   *  point lands at o·k, so it is panned back by o·(1 − k). */
  const zoomAt = (k: number, ox: number, oy: number) => {
    const z = clamp(view.zoom * k, ZOOM_MIN, ZOOM_MAX);
    const r = z / view.zoom;
    view.zoom = z;
    pan(ox * (1 - r), oy * (1 - r));
  };

  const turn = (dx: number, dy: number) => {
    const k = TURN_RATE / Math.min(lay.aw, lay.ah);
    // Grabbing the near side: drag right and what is nearest moves right.
    view.yaw = clamp(view.yaw + dx * k, -TURN_MAX, TURN_MAX);
    view.pitch = clamp(view.pitch - dy * k, -TURN_MAX, TURN_MAX);
  };

  const frame = (how: Framing) => {
    const { w, h } = slideSize(st);
    const s = growthS();
    view.yaw = 0;
    view.pitch = 0;
    if (how === "discesa") {
      // The site mid-scroll: rail point in the lower third, VIS_STEPS rows tall.
      const p = spineAt(org, s);
      view.x = p.x;
      view.y = p.y - (FOCUS_Y - 0.5) * VIS_STEPS * p.step;
      view.zoom = h / (VIS_STEPS * p.step) / w;
    } else if (how === "tutto") {
      // StromaCanvas's revealCamera, fitted to the whole carousel: what is LIT,
      // not the organism's bounds, or it frames rows that are not drawn.
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const e of org.edges) {
        if (e.t0 > s) continue;
        x0 = Math.min(x0, e.minX);
        y0 = Math.min(y0, e.minY);
        x1 = Math.max(x1, e.maxX);
        y1 = Math.max(y1, e.maxY);
      }
      if (x0 > x1) {
        x0 = org.minX;
        y0 = org.minY;
        x1 = org.maxX;
        y1 = org.maxY;
      }
      const bw = (x1 - x0) * 1.14 || 1;
      const bh = (y1 - y0) * 1.14 || 1;
      view.x = (x0 + x1) / 2;
      view.y = (y0 + y1) / 2;
      view.zoom = Math.min((w * st.slides) / bw, h / bh) / w;
    }
    schedule();
  };

  // ---- gestures --------------------------------------------------------------
  // One finger turns the tissue; two pan and pinch. A mouse turns with the left
  // button and pans with the right one (or shift); the wheel zooms.
  const pts = new Map<number, { x: number; y: number }>();
  let panning = false;
  /** Set once two fingers are down, cleared when the last one lifts: the finger
   *  left behind after a pinch would otherwise jerk the turn. */
  let pinched = false;

  const local = (e: PointerEvent | WheelEvent) => {
    const r = area.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 2) return;
    area.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, local(e));
    panning = e.button === 2 || e.shiftKey;
    if (pts.size >= 2) pinched = true;
  };

  const onMove = (e: PointerEvent) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const cur = local(e);
    pts.set(e.pointerId, cur);
    const { d } = lay;
    if (pts.size === 1) {
      if (pinched) return;
      if (panning) pan((cur.x - prev.x) / d, (cur.y - prev.y) / d);
      else turn(cur.x - prev.x, cur.y - prev.y);
    } else if (pts.size === 2) {
      // One finger moved, the other held still: compare against it.
      let other = cur;
      for (const [id, p] of pts) if (id !== e.pointerId) other = p;
      const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
      const d1 = Math.hypot(cur.x - other.x, cur.y - other.y);
      const mx0 = (prev.x + other.x) / 2;
      const my0 = (prev.y + other.y) / 2;
      const mx1 = (cur.x + other.x) / 2;
      const my1 = (cur.y + other.y) / 2;
      pan((mx1 - mx0) / d, (my1 - my0) / d);
      if (d0 > 1) zoomAt(d1 / d0, (mx1 - lay.aw / 2) / d, (my1 - lay.ah / 2) / d);
    }
    schedule();
  };

  const onUp = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size === 0) pinched = false;
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    const p = local(e);
    zoomAt(Math.exp(-dy * 0.0015), (p.x - lay.aw / 2) / lay.d, (p.y - lay.ah / 2) / lay.d);
    schedule();
  };

  // Safari's own pinch, which `touch-action: none` alone does not always stop.
  const stop = (e: Event) => e.preventDefault();

  area.addEventListener("pointerdown", onDown);
  area.addEventListener("pointermove", onMove);
  area.addEventListener("pointerup", onUp);
  area.addEventListener("pointercancel", onUp);
  area.addEventListener("wheel", onWheel, { passive: false });
  area.addEventListener("contextmenu", stop);
  area.addEventListener("gesturestart", stop);
  const ro = new ResizeObserver(relayout);
  ro.observe(area);

  relayout();
  frame("discesa");

  return {
    set: (s) => {
      st = s;
      relayout();
    },
    frame,
    exportSlides: async (onProgress) => {
      // A snapshot: a setting touched mid-export must not split the carousel.
      const s = st;
      const v = { ...view };
      const { f, w, h } = slideSize(s);
      const n = s.slides;
      if (!ex) {
        const c = document.createElement("canvas");
        c.width = f.w;
        c.height = f.h;
        const g = createTissueGl(c, org, () => {});
        if (!g) throw new Error("WebGL2 non disponibile");
        ex = { c, g };
      }
      if (ex.c.width !== f.w || ex.c.height !== f.h) {
        ex.c.width = f.w;
        ex.c.height = f.h;
        ex.g.resize(f.w, f.h);
      }
      const out = document.createElement("canvas");
      out.width = f.w;
      out.height = f.h;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D non disponibile");
      const blobs: Blob[] = [];
      try {
        for (let i = 0; i < n; i++) {
          onProgress(i, n);
          // Let the progress paint before the frame is spent encoding.
          await new Promise((r) => setTimeout(r, 0));
          if (ex.g.lost) throw new Error("Contesto WebGL perso, riprova");
          ex.g.render({
            s: s.growth * segs,
            cl: s.sealed ? 1 : 0,
            pulse: null,
            gain: 1,
            cam: camera(v, w, n / 2 - i),
            W: w,
            H: h,
            dpr: f.w / w,
            topDev: s.invert ? 0 : f.h,
            botDev: f.h,
          });
          // Read back in the SAME task as the render: the GL canvas keeps no
          // copy of its drawing buffer once the browser has presented it.
          // Carbon under it: the GL canvas is transparent where nothing is lit.
          ctx.fillStyle = CARBON;
          ctx.fillRect(0, 0, f.w, f.h);
          ctx.drawImage(ex.c, 0, 0);
          // The veil, in the ground's colour. The preview lays the same flat
          // colour over its canvas with CSS opacity — the same source-over —
          // so what is seen there is what is saved here.
          if (s.veil > 0) {
            ctx.globalAlpha = s.veil;
            ctx.fillStyle = s.invert ? VIOLA_SOLID : CARBON;
            ctx.fillRect(0, 0, f.w, f.h);
            ctx.globalAlpha = 1;
          }
          // JPEG, so the slide can carry a date taken (see exif.ts). At 0.95 a
          // 4× crop of the densest tissue is indistinguishable from the PNG; what
          // little JPEG does lose is the colour detail Instagram's own JPEG drops.
          const blob = await new Promise<Blob | null>((r) =>
            out.toBlob(r, "image/jpeg", 0.95),
          );
          if (!blob) throw new Error("Impossibile creare l'immagine");
          blobs.push(blob);
        }
      } finally {
        // iOS caps the canvas memory a page may hold; give this one back now.
        out.width = 0;
        out.height = 0;
      }
      return blobs;
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      raf = 0;
      ro.disconnect();
      area.removeEventListener("pointerdown", onDown);
      area.removeEventListener("pointermove", onMove);
      area.removeEventListener("pointerup", onUp);
      area.removeEventListener("pointercancel", onUp);
      area.removeEventListener("wheel", onWheel);
      area.removeEventListener("contextmenu", stop);
      area.removeEventListener("gesturestart", stop);
      gl.dispose();
      if (ex) {
        ex.g.dispose();
        ex.c.width = 0;
        ex.c.height = 0;
        ex = null;
      }
    },
  };
}
