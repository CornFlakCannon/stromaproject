'use client';

import { createElement, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { SectionContext, useSection, useScrollStore } from './context';
import { SNAP } from './presets';
import type { ScrollStore } from './store';
import { growIndexCeiling, readIndexMax, readIndexPos, type SequenceSpec } from './useSequenceProgress';

/**
 * Sections replace the old dormant "widget index": a run of animations grouped
 * under one gating index that the scroll advances through, one at a time.
 *
 * A top-level `<Section index={n} start end budget>` owns index `n` and a hand-off
 * threshold. While it is active it integrates its own scroll position (0-based,
 * isolated per index — see `useSequenceProgress`); once that position reaches the
 * threshold and the user is still scrolling forward, the active index advances to
 * `n+1`; once it is back at the bottom and scrolling back, it returns to `n-1`.
 *
 * A nested `<Section>` is coordinate-only: it inherits the enclosing index and
 * simply subtracts its own `start` from the scroll origin its descendants see, so
 * `start`/`end` inside it compose locally. Only top-level sections advance.
 */

/**
 * Registry of advancing (top-level) sections per store: index → its threshold, the
 * scroll position (in that index's space) at which it hands off. A `null` threshold
 * means "fall back to the furthest child end", discovered at runtime.
 */
type SectionInfo = {
  /** Hand-off position in index-pos space; null = fall back to the furthest child end. */
  threshold: number | null;
  /** Scroll span (this index's units) over which the panel glides into view;
   *  0 = not a snap panel (the scroll stays put). Widgets stagger past it via `start`. */
  snapDuration: number;
  /** Where an imperative jump lands in index-pos space; null = the section's ceiling
   *  ("played to the end"). Declared by the author — see the `landing` prop. */
  landing: number | null;
  /** The section's wrapper element — the panel the glide scrolls to. */
  el: HTMLElement | null;
};
const REGISTRY = new WeakMap<ScrollStore, Map<number, SectionInfo>>();

function registry(store: ScrollStore): Map<number, SectionInfo> {
  let m = REGISTRY.get(store);
  if (!m) REGISTRY.set(store, (m = new Map()));
  return m;
}

function registerSection(store: ScrollStore, index: number, info: SectionInfo): void {
  registry(store).set(index, info);
}

function unregisterSection(store: ScrollStore, index: number): void {
  registry(store).delete(index);
}

/** Is `index` a registered (top-level, advancing) section? The core validates a
 *  step's neighbour with this before playing toward it. */
export function hasSection(store: ScrollStore, index: number): boolean {
  return registry(store).has(index);
}

/** A section's threshold in index-pos space: its declared value, else furthest child end. */
function thresholdOf(store: ScrollStore, index: number): number {
  const declared = registry(store).get(index)?.threshold ?? null;
  return declared ?? readIndexMax(store, index);
}

/**
 * Extra scroll a reader has to push at a section's edge before it lets go — the
 * dead zone that makes a panel somewhere you can SIT rather than a tripwire.
 *
 * Without it the margin is exactly zero in both directions: a section's position
 * is clamped to `[0, max]` and `max` is its threshold, so the frame it arrives at
 * the end it already satisfies `pos >= threshold`, and the next flick of a wheel
 * — however small — hands off. Same at the bottom against 0.
 *
 * It costs nothing in responsiveness: the margin accumulates from the very delta
 * the reader produces, so a single decisive frame (a fling is easily >= this)
 * still crosses on that frame. It only takes the hair-trigger off the small moves.
 */
const HANDOFF_MARGIN = 300;

/**
 * Per-store overshoot accumulated at the current section's edge — signed, so one
 * number carries both directions (positive = pushing past the end, negative =
 * pushing back past the start). Kept here, in the same per-store `WeakMap` idiom
 * as the registry above and `nav.ts`'s pending jump, rather than in the store: the
 * hand-off decision owns it and nothing else reads it.
 */
const OVERSHOOT = new WeakMap<ScrollStore, number>();

/** Drop the accumulated edge overshoot. The core calls this on an imperative jump:
 *  a backward jump lands the target at `Infinity` → clamped to its ceiling, i.e.
 *  already AT the edge, so a stale accumulator would hand straight off again on the
 *  first wheel click after the jump. */
export function resetHandoff(store: ScrollStore): void {
  OVERSHOOT.set(store, 0);
}

/**
 * Decide the active section index for the next frame given this frame's scroll
 * `delta`. Hand off forward once the active section has sat at its threshold for
 * `HANDOFF_MARGIN` of further scroll (and a next section exists); hand back once
 * it has sat at the bottom for as much in reverse. Positions persist per index, so
 * a section resumes where it left off. Called by the core (`ScrollShell`) once per
 * frame — see the note there.
 *
 * The accumulator only grows while the position is already pinned at the edge it is
 * being pushed against, and any movement back INSIDE the section clears it — so the
 * margin is a fresh push each time, never a debt carried from an earlier visit. A
 * `delta` of 0 leaves it alone: an idle frame is not a change of mind, and a slow
 * trackpad scroll with gaps between its events has to keep accumulating across them.
 */
export function advanceSection(store: ScrollStore, current: number, delta: number): number {
  const threshold = thresholdOf(store, current);
  const pos = readIndexPos(store, current);
  let overshoot = OVERSHOOT.get(store) ?? 0;

  if (delta > 0) {
    // Clamped to the margin so a last section with nowhere to go can't bank an
    // unbounded push and then leap the moment one becomes reachable.
    overshoot = threshold > 0 && pos >= threshold
      ? Math.min(HANDOFF_MARGIN, Math.max(0, overshoot) + delta)
      : 0;
  } else if (delta < 0) {
    overshoot = pos <= 0 ? Math.max(-HANDOFF_MARGIN, Math.min(0, overshoot) + delta) : 0;
  }
  OVERSHOOT.set(store, overshoot);

  if (overshoot >= HANDOFF_MARGIN && hasSection(store, current + 1)) {
    OVERSHOOT.set(store, 0);
    return current + 1;
  }
  if (overshoot <= -HANDOFF_MARGIN && current > 0) {
    OVERSHOOT.set(store, 0);
    return current - 1;
  }
  return current;
}

/** Default snap span (scroll units) when `snap` is just `true`. Named in
 *  `./presets` so "how fast do panels arrive" is one row, not a literal here —
 *  pass `snap={SNAP.slow}` for any other span. */
const DEFAULT_SNAP_DURATION = SNAP.normal;

/**
 * The container scrollTop the active section wants right now — a CONTINUOUS target
 * (never null between panels), which is what lets ScrollShell ease scrollTop toward
 * it over time without ever stranding: the old strand was the target vanishing at a
 * hand-off, not the easing. A `snap` section (after the first) slides in from the
 * previous panel across its `snapDuration` of scroll — a linear lerp of the panel
 * top over `t = pos / snapDuration`; past that span it sits at its own panel, so
 * widgets with `start >= snapDuration` play only after it lands. Every other active
 * section just targets its own panel top. Only an unregistered section (no `el` yet)
 * yields null. Assumes the scroll container is the `offsetParent` (ScrollShell marks
 * it `relative`), so `el.offsetTop` is the scrollTop that puts a panel at the top.
 */
export function sectionScrollTop(store: ScrollStore, active: number): number | null {
  const info = registry(store).get(active);
  if (!info?.el) return null;
  const thisTop = info.el.offsetTop;
  if (info.snapDuration > 0 && active > 0) {
    const prevTop = registry(store).get(active - 1)?.el?.offsetTop ?? 0;
    const t = Math.min(1, Math.max(0, readIndexPos(store, active) / info.snapDuration));
    return prevTop + (thisTop - prevTop) * t;
  }
  return thisTop;
}

/** Every registered (top-level, advancing) section index, ascending. The core
 *  walks these to land positions across all panels for an imperative jump. */
export function sectionIndices(store: ScrollStore): number[] {
  return [...registry(store).keys()].sort((a, b) => a - b);
}

/** A section's snap-glide span in its index-pos space (0 = not a snap panel).
 *  A jump asking for `"start"` lands the target here, so `sectionScrollTop` reports its
 *  own panel (t = 1), i.e. flush, with the widgets inside still at their entry pose. */
export function snapDurationOf(store: ScrollStore, index: number): number {
  return registry(store).get(index)?.snapDuration ?? 0;
}

/** Where a jump lands on section `index` — the position at which the author says the
 *  panel READS. `Infinity` when undeclared, which `setIndexPos` clamps to the section's
 *  ceiling: everything arrived, which is what a panel of entrances wants. A section
 *  whose end is not its readable state (a gallery that pans, a hero that plays on its
 *  way OUT) declares its own. See the `landing` prop below. */
export function landingOf(store: ScrollStore, index: number): number {
  return registry(store).get(index)?.landing ?? Infinity;
}

/** `landingOf` brought into the section's reachable range `[0, max]` — the position
 *  a destination playthrough actually stops at (an undeclared landing is `Infinity`,
 *  i.e. the ceiling). Shared by the core's stop rule and `playDistance` so the two
 *  can never disagree about where "arrived" is. */
export function landingClamped(store: ScrollStore, index: number): number {
  return Math.max(0, Math.min(landingOf(store, index), readIndexMax(store, index)));
}

/**
 * Scroll units a playthrough covers from section `from` (at its current position) to
 * the landing of section `to`, walking panel by panel exactly as a reader would: the
 * rest of each section on the way (up to its threshold going forward, down to 0 going
 * back), plus `HANDOFF_MARGIN` for every hand-off, plus whatever separates the
 * destination's current position from its landing. The core turns this into a rate
 * (`distance / duration`) so a step takes a fixed time whatever the panels' budgets.
 *
 * `max(0, …)` on the forward legs: a jump can leave a position at the ceiling above a
 * declared `end`. The last term is unsigned in both directions: after a jump the
 * destination may sit on either side of its landing.
 */
export function playDistance(store: ScrollStore, from: number, to: number): number {
  const order = sectionIndices(store);
  const a = order.indexOf(from);
  const b = order.indexOf(to);
  if (a < 0 || b < 0) return 0;
  let distance = 0;
  if (b > a) {
    for (let k = a; k < b; k++) {
      const i = order[k];
      distance += Math.max(0, thresholdOf(store, i) - readIndexPos(store, i)) + HANDOFF_MARGIN;
    }
  } else if (b < a) {
    for (let k = a; k > b; k--) {
      distance += readIndexPos(store, order[k]) + HANDOFF_MARGIN;
    }
  }
  return distance + Math.abs(landingClamped(store, to) - readIndexPos(store, to));
}

/** Registered sections whose panel lies fully outside the viewport `[scrollTop,
 *  scrollTop + viewportH]`. The core sweeps this across a jump's glide to snap each
 *  section's reset only once it's off-screen (see the settle logic in ScrollShell /
 *  useSequenceProgress) — the still-visible one stays frozen until it scrolls out. */
export function offscreenSections(store: ScrollStore, scrollTop: number, viewportH: number): number[] {
  const result: number[] = [];
  for (const [index, info] of registry(store)) {
    const el = info.el;
    if (!el) continue;
    const top = el.offsetTop;
    if (top + el.offsetHeight <= scrollTop || top >= scrollTop + viewportH) result.push(index);
  }
  return result;
}

/**
 * Group scroll widgets under one advancing index (top level) or refine their
 * scroll origin (nested). Shares the `SequenceSpec` vocabulary: `start` sets the
 * local origin (subtracted for descendants), `end`/`budget` set the hand-off
 * threshold. `index` names the slot for a top-level section; nested sections
 * inherit the enclosing index and ignore their own.
 */
export function Section({
  index,
  start = 0,
  budget,
  end,
  snap = false,
  landing,
  children,
}: SequenceSpec & {
  /** Make this section a panel that glides into view when it becomes active:
   *  `true` for the default span, or a number = the scroll span the glide takes.
   *  Widgets inside stagger past it with `start` (>= the span plays after it lands). */
  snap?: boolean | number;
  /** Where an imperative jump (`jumpTo`) lands, in this section's own scroll space.
   *  Omitted, a jump lands at the ceiling — every widget arrived, which is right for a
   *  panel made of entrances. Declare it when the END of the span is not the state the
   *  panel reads in: a strip that pans sideways would be jumped to its far edge, a hero
   *  that animates OUT to an empty screen.
   *
   *  On a `snap` panel it must be >= the snap span: below it `sectionScrollTop` still
   *  reports the PREVIOUS panel's top (see the glide in `ScrollShell`). */
  landing?: number;
  children?: ReactNode;
}) {
  const parent = useSection();
  const store = useScrollStore();
  const elRef = useRef<HTMLDivElement>(null);

  const isTop = parent.depth === 0;
  const gatingIndex = isTop ? (index ?? 0) : parent.index;
  const offset = parent.offset + start;

  // Threshold lives in the index's 0-based scroll space. Only top-level sections
  // advance, and their parent offset is 0, so this equals the local end. Nested
  // sections don't register, so their (unused) threshold is harmless.
  const localEnd = end ?? (budget !== undefined ? start + budget : undefined);
  const threshold = localEnd !== undefined ? parent.offset + localEnd : null;

  const snapDuration = snap === false ? 0 : typeof snap === "number" ? snap : DEFAULT_SNAP_DURATION;

  // Same space as `threshold` above: a top-level section's parent offset is 0, so this
  // is the position as the author wrote it.
  const landingPos = landing !== undefined ? parent.offset + landing : null;

  useEffect(() => {
    if (!isTop) return;
    registerSection(store, gatingIndex, { threshold, snapDuration, landing: landingPos, el: elRef.current });
    // Grow the ceiling so `pos` can reach an explicit threshold (and the snap span,
    // so the glide can complete) even if no child window extends that far.
    const ceiling = Math.max(threshold ?? 0, snapDuration);
    if (ceiling > 0) growIndexCeiling(store, gatingIndex, ceiling);
    return () => unregisterSection(store, gatingIndex);
  }, [store, isTop, gatingIndex, threshold, snapDuration, landingPos]);

  const value = useMemo(
    () => ({ index: gatingIndex, offset, depth: parent.depth + 1 }),
    [gatingIndex, offset, parent.depth],
  );

  // Only a top-level section is a panel — a registered snap/scroll target that must
  // be a full-viewport box (min-h here, not a runtime class, so flex can't compress
  // it a hair under 100vh and strand the last panel's top). A nested section is
  // coordinate-only: it exists purely to shift its descendants' scroll origin, so it
  // emits NO layout box, only the context, and its children lay out exactly as if it
  // weren't there. (A min-h box here would inject a stray 100vh into the middle of an
  // absolutely-composed scene — inflating the container and dislocating the layout.)
  const provider = createElement(SectionContext.Provider, { value }, children);
  if (!isTop) return provider;
  // eslint-disable-next-line react-hooks/refs -- forwarding the ref to the DOM node, not reading it in render
  return createElement("div", { ref: elRef, className: "min-h-[100svh] shrink-0" }, provider);
}
