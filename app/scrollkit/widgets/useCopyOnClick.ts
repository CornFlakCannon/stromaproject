'use client';

import { useEffect } from "react";

/**
 * Dev authoring aid: click anywhere to copy either the click point or the clicked
 * element's box to the clipboard, ready to paste into a widget's anim spec /
 * className. A short toast at the pointer confirms what was copied. Call it from a
 * dev-only surface (see DevHud) so it never ships.
 *
 *   click       → `x: <clientX>, y: <clientY>` — the viewport point you clicked,
 *                 i.e. the translate `x`/`y` that puts a widget's top-left there.
 *                 Each section is a full-viewport panel snapped to the top, so
 *                 viewport coords equal the local translate origin.
 *   Alt + click → `width: <w>, height: <h>` — the clicked element's layout box
 *                 (offsetWidth/Height: integer px, transform-independent, so scroll
 *                 scale/translate don't skew it). Click an element's own padding/
 *                 edge to size the box rather than its deepest child.
 */
export function useCopyOnClick(enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const onClick = (e: MouseEvent) => {
      let text: string;
      if (e.altKey) {
        const el = e.target as HTMLElement | null;
        // offsetWidth is undefined on non-HTML targets (e.g. SVG) — skip those.
        if (!el || typeof el.offsetWidth !== "number") return;
        text = `width: ${Math.round(el.offsetWidth)}, height: ${Math.round(el.offsetHeight)}`;
      } else {
        text = `x: ${Math.round(e.clientX)}, y: ${Math.round(e.clientY)}`;
      }
      navigator.clipboard?.writeText(text).catch(() => {});
      toast(`✓ ${text}`, e.clientX, e.clientY);
    };

    // Capture phase so we always see the click, before anything can stop it.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [enabled]);
}

/** Transient pointer-anchored confirmation, built imperatively (no re-render). */
function toast(text: string, x: number, y: number) {
  const node = document.createElement("div");
  node.textContent = text;
  node.style.cssText =
    `position:fixed; left:${x + 12}px; top:${y + 12}px; z-index:99999;` +
    `pointer-events:none; padding:2px 6px; border-radius:4px;` +
    `background:rgba(0,0,0,.8); color:#fff; white-space:nowrap;` +
    `font:11px var(--font-mono),ui-monospace,monospace;` +
    `transition:opacity .3s ease;`;
  document.body.appendChild(node);
  setTimeout(() => (node.style.opacity = "0"), 500);
  setTimeout(() => node.remove(), 850);
}
