"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type DependencyList,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

/** The range of the zoom, 1 being "fits the box", and one key step of it. */
const MIN = 1;
const MAX = 6;
const STEP = 1.6;
/** Where a click lands, from the fit. */
const CLICK_ZOOM = 2.5;
/** Pointer travel (px) under which a press-and-release is a click, not a pan. */
const CLICK_PX = 6;

const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z));

/** A point to hold still across a zoom: the fraction of the content that sat
 *  under it, and where in the box it should stay. */
type Anchor = { fx: number; fy: number; x: number; y: number };

type Pt = { x: number; y: number };

/**
 * A picture to look at closely, zoomed and panned inside its own box — never by
 * zooming the page. Shared by LeafLightbox and the manifesto card.
 *
 * The zoom is a width: the content (`body`) is laid out at the size that fits
 * the box, times `z`, inside a box (`box`) that scrolls, so a pan is a scroll
 * offset. Every gesture on the box is ours — the box is `touch-action: none`:
 *
 *   - one pointer, any kind, drags the box's scroll by hand;
 *   - two fingers pinch: the zoom follows their spread and the point between
 *     them follows the midpoint, so pinching and panning are one motion;
 *   - a press released where it landed is a click, and toggles the zoom at
 *     that point (a click after a drag or a pinch is not);
 *   - ctrl+wheel (a trackpad pinch) and the +/-/0 keys zoom too.
 *
 * Owning the finger pinch is the point. Left to the browser it zooms the whole
 * visual viewport, and on the landing — where ScrollShell is `touch-action:
 * none` — the reader could not pinch back out once the card had closed.
 *
 * Zooming holds a point still: the fraction of the content under it is
 * measured before the change, and the scroll is corrected after the layout, in
 * a layout effect, so nothing jumps. Measured with bounding rects rather than
 * offsets, so the auto margins that centre a content smaller than its box do
 * not throw it off.
 *
 * `rebind` re-attaches the wheel listener: pass whatever mounts the box.
 */
export function useZoomPan(rebind: DependencyList) {
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const [z, setZ] = useState(MIN);
  const zRef = useRef(MIN);
  const anchor = useRef<Anchor | null>(null);

  /** Hold anchor `a` still: scroll the box so the content's point (fx, fy)
   *  sits at (x, y) in the box. */
  const hold = (a: Anchor) => {
    const b = box.current;
    const c = body.current;
    if (!b || !c) return;
    const br = b.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    b.scrollLeft += cr.left + a.fx * cr.width - (br.left + a.x);
    b.scrollTop += cr.top + a.fy * cr.height - (br.top + a.y);
  };

  /** The anchor for a point on screen, or the box's centre. */
  const anchorAt = (clientX?: number, clientY?: number): Anchor | null => {
    const b = box.current;
    const c = body.current;
    if (!b || !c) return null;
    const br = b.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    const px = clientX ?? br.left + br.width / 2;
    const py = clientY ?? br.top + br.height / 2;
    return {
      fx: (px - cr.left) / cr.width,
      fy: (py - cr.top) / cr.height,
      x: px - br.left,
      y: py - br.top,
    };
  };

  const setZoom = (next: number, a: Anchor | null) => {
    const nz = clamp(next);
    if (nz === zRef.current) {
      // At a bound the zoom cannot move, but a pinch still pans.
      if (a) hold(a);
      return;
    }
    anchor.current = a;
    zRef.current = nz;
    setZ(nz);
  };

  const zoomTo = (next: number, clientX?: number, clientY?: number) =>
    setZoom(next, anchorAt(clientX, clientY));

  /** Back to the fit, at once — for a fresh opening. */
  const reset = () => {
    anchor.current = null;
    zRef.current = MIN;
    setZ(MIN);
    const b = box.current;
    if (b) b.scrollLeft = b.scrollTop = 0;
  };

  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a) return;
    anchor.current = null;
    hold(a);
  }, [z]);

  // Bound by hand, not through onWheel: React's wheel listener is passive, and a
  // passive listener cannot preventDefault — and ctrl+wheel left to the browser
  // zooms the page, not the picture.
  useEffect(() => {
    const b = box.current;
    if (!b) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(zRef.current * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };
    b.addEventListener("wheel", onWheel, { passive: false });
    return () => b.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, rebind);

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "+" || e.key === "=") zoomTo(zRef.current * STEP);
    else if (e.key === "-") zoomTo(zRef.current / STEP);
    else if (e.key === "0") zoomTo(MIN);
    else return;
    e.preventDefault();
  };

  /** Pointers down on the box, where they are now. */
  const pts = useRef(new Map<number, Pt>());
  /** A one-pointer press: where it started, the scroll it started from. */
  const press = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  /** A two-finger pinch: their spread and the zoom when it began, and the
   *  content's point that sat between them. */
  const pinch = useRef<{ d0: number; z0: number; fx: number; fy: number } | null>(null);
  /** Whether this gesture ever became a pinch — its release is then no click. */
  const pinched = useRef(false);

  const pair = (): [Pt, Pt] | null => {
    const [p, q] = [...pts.current.values()];
    return p && q ? [p, q] : null;
  };

  const startPress = (p: Pt, moved: boolean) => {
    const b = box.current;
    if (!b) return;
    press.current = { x: p.x, y: p.y, left: b.scrollLeft, top: b.scrollTop, moved };
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const b = box.current;
    if (!b || (e.pointerType === "mouse" && e.button !== 0)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    b.setPointerCapture(e.pointerId);
    if (pts.current.size === 1) {
      pinched.current = false;
      startPress({ x: e.clientX, y: e.clientY }, false);
      return;
    }
    const two = pair();
    if (pts.current.size !== 2 || !two) return;
    const [p, q] = two;
    const a = anchorAt((p.x + q.x) / 2, (p.y + q.y) / 2);
    if (!a) return;
    press.current = null;
    pinched.current = true;
    pinch.current = {
      d0: Math.max(1, Math.hypot(p.x - q.x, p.y - q.y)),
      z0: zRef.current,
      fx: a.fx,
      fy: a.fy,
    };
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const b = box.current;
    if (!b || !pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const g = pinch.current;
    const two = pair();
    if (g && two) {
      const [p, q] = two;
      const br = b.getBoundingClientRect();
      setZoom(g.z0 * (Math.hypot(p.x - q.x, p.y - q.y) / g.d0), {
        fx: g.fx,
        fy: g.fy,
        x: (p.x + q.x) / 2 - br.left,
        y: (p.y + q.y) / 2 - br.top,
      });
      return;
    }

    const s = press.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.hypot(dx, dy) >= CLICK_PX) s.moved = true;
    b.scrollLeft = s.left - dx;
    b.scrollTop = s.top - dy;
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!pts.current.delete(e.pointerId)) return;
    const b = box.current;
    if (b?.hasPointerCapture(e.pointerId)) b.releasePointerCapture(e.pointerId);

    if (pinch.current) {
      if (pts.current.size >= 2) return;
      pinch.current = null;
      // One finger left on the glass: it carries on as a pan from here.
      const [rest] = [...pts.current.values()];
      if (rest) startPress(rest, true);
      return;
    }

    const s = press.current;
    if (!s || pts.current.size > 0) return;
    press.current = null;
    if (e.type === "pointercancel" || s.moved || pinched.current) return;
    zoomTo(zRef.current > MIN ? MIN : CLICK_ZOOM, e.clientX, e.clientY);
  };

  return {
    z,
    zoomed: z > MIN,
    box,
    body,
    reset,
    onKey,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
    },
  };
}
