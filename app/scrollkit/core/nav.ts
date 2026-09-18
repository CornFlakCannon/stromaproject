'use client';

import { playTo as playToSection } from './autoplay';
import { useScrollStore } from './context';
import type { ScrollStore } from './store';

/**
 * Imperative "scroll to a section" bus.
 *
 * The engine advances one section at a time from accumulated wheel/touch delta —
 * there is no way to *jump*. A UI affordance ("Contattami", a section menu) needs
 * exactly that, so this is a tiny per-store request channel in the same style as the
 * section registry (`sections.ts`): a widget calls `requestJump(store, index)` (via
 * the `useScrollNav` hook), and the core (`ScrollShell`) consumes it once per frame
 * with `consumeJump(store)` and lands on that panel (see the loop there).
 *
 * It's a request, not a direct write, because only the core owns the scroll state:
 * keeping the hand-off one-directional (widget requests → core applies) matches how
 * the rest of the system already works (widgets never mutate the store's scroll).
 */
/**
 * Where in the target section a jump lands.
 *
 * `"auto"` lands where the section says it READS — its `landing` prop, or the end of
 * its cycle when it declares none (see `core/sections.ts`). Direction of travel does
 * NOT enter into it: a menu entry is a destination, and a panel has to look the same
 * whether the reader came down to it or back up to it. It cannot mean "about to play"
 * either — a panel keeps its contents in a nested `<Section start={snap span}>`, so
 * arriving at the snap span puts every widget at p = 0 and the reader lands on a
 * blank screen with no clue that scrolling is what fills it.
 *
 * `"start"` overrides that with the beginning of the panel — what a "back to the top"
 * affordance (a wordmark, a home link) means. It lands at the section's snap span,
 * exactly where arriving from above does, so a snap panel still reports its own top
 * and cannot strand mid-glide.
 */
export type JumpAt = "auto" | "start";

/**
 * `instant` skips the scroll glide: the container is put on the target panel in the
 * same frame the poses are landed, so nothing is seen travelling. What arriving BY
 * URL wants — a reader coming back from a project page never left the grid, and
 * watching three panels fly past would say otherwise. A menu entry keeps the glide.
 */
export type JumpOptions = { instant?: boolean };

type Jump = { index: number; at: JumpAt; instant: boolean };

const PENDING = new WeakMap<ScrollStore, Jump | null>();

/** Ask the core to land on section `index` on the next frame. */
export function requestJump(
  store: ScrollStore,
  index: number,
  at: JumpAt = "auto",
  opts: JumpOptions = {},
): void {
  PENDING.set(store, { index, at, instant: opts.instant ?? false });
}

/** Read-and-clear the pending jump (null when none). The core calls this once
 *  per rAF tick; clearing on read makes a jump a single-shot event. */
export function consumeJump(store: ScrollStore): Jump | null {
  const target = PENDING.get(store) ?? null;
  if (target !== null) PENDING.set(store, null);
  return target;
}

/**
 * Widget-side handle. Two ways to reach a section:
 *
 * - `jumpTo(index, at?, opts?)` TELEPORTS: every panel is landed at once and the
 *   container glides there with the target already posed (see the jump in
 *   `ScrollShell`). What a menu wants — a destination, reached fast. With
 *   `{ instant: true }` the container is placed there too, no glide at all.
 * - `playTo(index, ms?)` PLAYS there, as a reader scrolling at a steady pace would —
 *   forward or back, through every hand-off, the leaving panel playing out and the
 *   arriving one's entrances playing in — and stops where that section reads. The whole
 *   trip takes `ms` (default: the shell's `step` duration). What an arrow key wants,
 *   and what the wheel does in step mode. See `core/autoplay.ts`.
 *
 * Must be used under a `<ScrollStateProvider>` (i.e. inside `<ScrollShell>`), the
 * same as every other scroll hook — a portaled overlay still qualifies, since React
 * context flows through portals.
 */
export function useScrollNav(): {
  jumpTo: (index: number, at?: JumpAt, opts?: JumpOptions) => void;
  playTo: (index: number, ms?: number) => void;
} {
  const store = useScrollStore();
  return {
    jumpTo: (index: number, at?: JumpAt, opts?: JumpOptions) => requestJump(store, index, at, opts),
    // `from` is the live active section — the broadcast one, at most a frame stale,
    // which is the same index the loop will hand off from.
    playTo: (index: number, ms?: number) => playToSection(store, store.state.sectionIndex, index, ms),
  };
}
