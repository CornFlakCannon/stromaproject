"use client";

import { useRef, type PointerEvent } from "react";

/** Finger travel (px) across the sheet that counts as a swipe rather than a tap. */
const SWIPE_PX = 60;
/** How much longer the horizontal leg must be than the vertical one. A drag at
 *  45° is a scroll that wandered, not a page turn. */
const DOMINANCE = 2;

/**
 * A horizontal swipe on touch, strict enough to live on a surface the reader
 * also scrolls across.
 *
 * The surface keeps `touch-action: pan-y pinch-zoom`, so a vertical drag and a
 * pinch belong to the browser. When the browser takes a gesture over it fires
 * `pointercancel` — that gesture was a scroll or a zoom, and it is dropped,
 * never read as a swipe. A second finger aborts too (it is a pinch), and so
 * does a page that is already zoomed in: there a sideways drag pans the zoom.
 * What survives turns a page only if it travelled far enough AND mostly
 * sideways.
 *
 * The mouse is ignored: it has the arrows and the keys.
 */
export function useSwipe(onTurn: (dir: 1 | -1) => void) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  /** Fingers currently down on the surface. More than one is a pinch. */
  const down = useRef(new Set<number>());

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    down.current.add(e.pointerId);
    start.current =
      down.current.size === 1
        ? { id: e.pointerId, x: e.clientX, y: e.clientY }
        : null;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    down.current.delete(e.pointerId);
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    if ((window.visualViewport?.scale ?? 1) > 1.01) return;
    const dx = s.x - e.clientX;
    const dy = s.y - e.clientY;
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= DOMINANCE * Math.abs(dy)) return;
    onTurn(dx > 0 ? 1 : -1);
  };

  const onPointerCancel = (e: PointerEvent) => {
    down.current.delete(e.pointerId);
    start.current = null;
  };

  return { onPointerDown, onPointerUp, onPointerCancel };
}
