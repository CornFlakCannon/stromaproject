'use client';

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useScrollNav } from "../core";

/** A store that never emits: client snapshot `true`, server `false`, so
 *  `useSyncExternalStore` yields "have we hydrated on the client yet?". */
const NEVER = () => () => {};

/**
 * A jump CTA: a fixed, always-visible button that scroll-jumps to a section — the
 * reference use of `useScrollNav` (see `core/nav.ts`). Use it for "get in touch", a
 * "back to top", or as the model for a full section menu (render one per index).
 *
 * Rendered through a portal to <body> (the same pattern as `DevHud`) so it stays
 * viewport-fixed, is never collected as a ScrollShell section (it's not a direct
 * child in the DOM), and clears the widgets' transformed ancestors — yet still reads
 * the scroll store, since React context flows through portals. It must still be
 * rendered *inside* `<ScrollShell>` (i.e. under `<ScrollStateProvider>`).
 *
 * The default styling uses `mix-blend-difference`, which keeps the label legible over
 * both light and dark panels without knowing the palette. Pass `className` to replace
 * the look entirely (position included).
 */
export default function SectionNav({
  target,
  label,
  className = "fixed left-6 top-5 z-[9998] font-sans text-sm tracking-wide text-white mix-blend-difference transition-opacity hover:opacity-70",
}: {
  /** Top-level `<Section index={…}>` to jump to. */
  target: number;
  /** Button text. */
  label: string;
  /** Replaces the default look and position wholesale. */
  className?: string;
}) {
  const { jumpTo } = useScrollNav();

  // Portal into <body> only after hydration, so the server render and the first client
  // render agree (both null) — same reasoning as DevHud.
  const mounted = useSyncExternalStore(NEVER, () => true, () => false);
  if (!mounted) return null;

  return createPortal(
    <button
      type="button"
      onClick={() => jumpTo(target)}
      className={className}
    >
      {label}
    </button>,
    document.body,
  );
}
