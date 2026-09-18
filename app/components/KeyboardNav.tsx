"use client";

import { useEffect, useRef } from "react";
import { readDestination, sectionIndices, useScrollFrame, useScrollNav, useScrollStore } from "@/app/scrollkit";

/**
 * scrollkit listens to wheel and pointer only, so without this the page is
 * unreachable from a keyboard. Panel-by-panel navigation through the public
 * nav API — no change to the kit itself.
 *
 * An arrow is a wheel click: it PLAYS to the neighbouring panel (`playTo`), at the
 * shell's step duration. Mid-trip it counts from where the trip is HEADING, exactly as
 * the wheel does, so two quick presses mean two panels; only a jump's settle is off
 * limits (positions are being snapped, not played). Home and End are destinations,
 * and jump.
 */
export default function KeyboardNav() {
  const { jumpTo, playTo } = useScrollNav();
  const store = useScrollStore();
  const active = useRef(0);
  const settling = useRef(false);

  useScrollFrame((s) => {
    active.current = s.sectionIndex;
    settling.current = s.settle !== undefined;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      // Let a focused control keep its own keys (Space activates a button).
      if (t?.closest("button, a, input, textarea, select, [contenteditable]")) return;
      // A modal is in charge while it is open: the focus may sit on its body
      // rather than on a control, and an arrow key there must not scroll the
      // page behind it.
      if (document.querySelector("dialog[open]")) return;

      const all = sectionIndices(store);
      if (all.length === 0) return;
      const first = all[0];
      const last = all[all.length - 1];
      // Neighbours by ORDINAL, not ±1: indices need not be contiguous.
      const k = all.indexOf(readDestination(store) ?? active.current);

      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        if (settling.current) return;
        const next = all[k + 1];
        if (next !== undefined) playTo(next);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        if (settling.current) return;
        const prev = all[k - 1];
        if (prev !== undefined) playTo(prev);
      } else if (e.key === "Home") {
        e.preventDefault();
        jumpTo(first);
      } else if (e.key === "End") {
        e.preventDefault();
        jumpTo(last);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [jumpTo, playTo, store]);

  return null;
}
