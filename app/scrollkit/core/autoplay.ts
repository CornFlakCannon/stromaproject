'use client';

import { useSyncExternalStore } from 'react';
import { useScrollStore } from './context';
import { SPEED } from './presets';
import { playDistance } from './sections';
import type { ScrollStore } from './store';

/**
 * The playthrough: "scroll the site for me, at this speed".
 *
 * Some sites are worth watching rather than driving. The engine only moves when the
 * wheel or a finger moves it, and `jumpTo` (see `core/nav.ts`) teleports between
 * panels instead of playing through them — so this is the third and last producer of
 * scroll: a sustained rate the core adds to the same accumulator the input feeds.
 *
 * That is the whole trick. Section hand-offs, the snap glide, `rawAnim`, `auto` loops
 * and the smoothers are all pure functions of one number — this frame's delta — so
 * feeding it `speed × dt` plays the page exactly as a reader scrolling at a steady
 * pace would, with no second clock and no code path of its own.
 *
 * A playthrough may carry a DESTINATION (`until`): a section index the core plays
 * toward — backward if it lies above — and stops at, exactly where that section reads
 * (`landingClamped`, see `core/sections.ts`). The direction and the final trimmed delta
 * are the core's business, decided frame by frame in the loop; this module only stores
 * the request. Without a destination the playthrough is the old one: forward, to the
 * bottom of the page. `playTo` is the destination form with a fixed DURATION: the rate
 * is `distance / seconds`, so a step between panels takes the same time whatever the
 * panels' budgets — the step mode of `ScrollShell` is built on nothing else.
 *
 * Same request-bus shape as `nav.ts`, and for the same reason: only the core owns the
 * scroll state, so a widget files a request and the core applies it. The one
 * difference is lifetime — a jump is a single-shot event (`consumeJump` read-and-
 * clears), a playthrough is a MODE that persists across frames, so the core reads it
 * without clearing and only ever writes `null` to stop it (at its destination, at the
 * bottom of the page, or when the reader scrolls and takes control back).
 */
type Playthrough = { rate: number; until: number | null };
const PLAY = new WeakMap<ScrollStore, Playthrough | null>();

/** Set the playthrough rate in scroll units per second, or `null` to stop. `until` names
 *  a destination section (see above); omitted, the playthrough runs to the bottom. The
 *  core reads this every frame; unlike a jump it is not consumed. Also called BY the core
 *  (with `null`) when the destination is reached, the page reaches the bottom or the
 *  reader scrolls. */
export function setAutoplay(store: ScrollStore, rate: number | null, until: number | null = null): void {
  PLAY.set(store, rate === null ? null : { rate, until });
}

/** The live playthrough rate (units/sec), or `null` when nothing is playing. Reads
 *  WITHOUT clearing — the mode has to survive the frame that observes it. Stays a
 *  primitive on purpose: it is the `useSyncExternalStore` snapshot in `useAutoplay`. */
export function readAutoplay(store: ScrollStore): number | null {
  return PLAY.get(store)?.rate ?? null;
}

/** The destination section of the running playthrough, or `null` (none running, or a
 *  free run to the bottom). */
export function readDestination(store: ScrollStore): number | null {
  return PLAY.get(store)?.until ?? null;
}

/** Default length of one step — `<ScrollShell step>` with no number, and `playTo`
 *  outside a shell that set its own. Long enough for a panel's entrances to read as a
 *  sequence, short enough that a wheel click still feels like it moved the page. */
export const DEFAULT_STEP_MS = 1400;

/**
 * How long a step takes, per shell. `ScrollShell` writes its `step` prop here so the
 * wheel, the arrow keys and any `playTo` caller move at the one duration the page
 * declared — one knob, not one per input.
 */
const STEP_MS = new WeakMap<ScrollStore, number>();

export function setStepDuration(store: ScrollStore, ms: number): void {
  STEP_MS.set(store, ms);
}

export function readStepDuration(store: ScrollStore): number {
  return STEP_MS.get(store) ?? DEFAULT_STEP_MS;
}

/**
 * Play from section `from` (where it stands now) to where section `to` reads, in `ms`.
 * The distance is measured the way the loop will actually consume it (`playDistance`),
 * so the rate lands the step on time to within a frame or two. Nothing to cover — the
 * destination already sits at its landing — means no playthrough at all, rather than a
 * silent one that would hold the step lock for the whole duration.
 */
export function playTo(store: ScrollStore, from: number, to: number, ms: number = readStepDuration(store)): void {
  const distance = playDistance(store, from, to);
  if (distance < 1 || ms <= 0) return;
  setAutoplay(store, distance / (ms / 1000), to);
}

/**
 * Widget-side handle for the free playthrough. Must be used under a `<ScrollStateProvider>`
 * (i.e. inside `<ScrollShell>`) like every other scroll hook — a portaled overlay
 * still qualifies, since React context flows through portals.
 *
 * `speed` is live, which is what lets a control label itself "Play"/"Pause" and follow
 * the core stopping on its own at the bottom. It is the one hook in the kit that
 * re-renders its caller — but only when the rate actually changes, never per frame: the
 * snapshot is a primitive, so React bails out on every one of the ~60 identical reads a
 * second. The per-frame ban in `docs/INVARIANTS.md` stands; nothing here sets state
 * from a frame callback.
 *
 * Forward only. A non-positive speed is ignored rather than quietly rewinding, which
 * has no stop condition (the top of the page is where a reader arrives, not somewhere
 * a playthrough ends). Playing BACK to a panel is what a destination is for — see
 * `useScrollNav().playTo` in `core/nav.ts`.
 */
export function useAutoplay(): {
  /** Start playing, or re-aim a playthrough already running. Defaults to `SPEED.normal`. */
  play: (speed?: number) => void;
  /** Stop. The scroll position stays exactly where it is. */
  pause: () => void;
  /** Play if stopped, stop if playing — for a single Play/Pause control. */
  toggle: (speed?: number) => void;
  /** Live rate in units/sec while playing, `null` when stopped. */
  speed: number | null;
} {
  const store = useScrollStore();
  const speed = useSyncExternalStore(
    store.onFrame,
    () => readAutoplay(store),
    () => null, // SSR: nothing is playing before the loop exists
  );

  const play = (rate: number = SPEED.normal) => {
    if (rate > 0) setAutoplay(store, rate);
  };
  const pause = () => setAutoplay(store, null);

  return {
    play,
    pause,
    toggle: (rate?: number) => (readAutoplay(store) !== null ? pause() : play(rate)),
    speed,
  };
}
