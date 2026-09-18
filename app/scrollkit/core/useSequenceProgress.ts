'use client';

import { useRef } from "react";
import { useScrollFrame } from "./useScrollFrame";
import { useScrollStore, useSection } from "./context";
import { defaultSmoother } from "./smoothing";
import type { ScrollState, ScrollStore } from "./store";

/**
 * The scroll window a sequence-driven widget plays over — the shared prop
 * vocabulary every widget reuses (extend it, never re-declare these fields), so
 * `index`/`budget`/`start`/`end` mean the same thing everywhere.
 *
 * The window is `[start, end]`: progress holds at 0 until the scroll position
 * reaches `start`, then ramps to 1 at `end`. `end - start` is the budget — the
 * scroll units it takes to play start-to-finish. Give any two of the three and
 * the third is implied (`end == start + budget`).
 */
export type SequenceSpec = {
  /** The section index this widget animates on — usually inherited from the
   *  enclosing `<Section>`; set it only to override or when unnested. */
  index?: number;
  /** Scroll units to play start-to-finish. Ignored when `end` is given. */
  budget?: number;
  /** Scroll position where progress leaves 0 (default 0). */
  start?: number;
  /** Scroll position where progress reaches 1 (default `start + budget`). */
  end?: number;
  /** Replay the anim as a repeating phase instead of a one-shot ramp. See {@link LoopSpec}. */
  loop?: LoopSpec;
};

/**
 * A looping animation: replay the widget's `anim` as a repeating PHASE rather than
 * playing it once and clamping. `by` picks what advances the loop — the scroll
 * wheel (default) or the wall clock (`"auto"`, ~60fps). `period` is the length of
 * ONE cycle: scroll units when `by:"wheel"`, milliseconds when `by:"auto"`. `times`
 * caps the cycle count and then holds the final pose; omit it to loop forever.
 * `mode` shapes the wrap — "repeat" restarts each cycle (author the anim so `at:0`
 * matches `at:1` for a seamless loop), "pingpong" bounces `0→1→0`.
 *
 * An `auto` loop is scroll-armed and section-gated: it begins once the scroll
 * reaches `start`, advances on the clock while its section is active, and pauses
 * (holding its phase) whenever another section is active — resuming on return.
 */
export type LoopSpec = {
  /** What advances the loop: the scroll wheel (default) or the wall clock. */
  by?: "wheel" | "auto";
  /** Length of ONE cycle — scroll units when `by:"wheel"`, ms when `by:"auto"`. */
  period: number;
  /** Cap the cycle count, then hold the final pose; omit to loop forever. */
  times?: number;
  /** Wrap shape: sawtooth "repeat" (default) or bouncing "pingpong". */
  mode?: "repeat" | "pingpong";
};

/**
 * Shared, per-ScrollShell (keyed by its store) and per-widget-index scroll
 * position. Every widget on an index reads ONE integrated position, so reversing
 * scroll unwinds the *end of the queue* first: a widget already past its window's
 * end stays put until the position falls back into `[start, end]`, instead of all
 * widgets subtracting in lockstep (which is what happens when each integrates its
 * own separately-clamped accumulator).
 */
type IndexScroll = { pos: number; max: number; time: number };
const SHARED = new WeakMap<ScrollStore, Map<number, IndexScroll>>();

function getIndexScroll(store: ScrollStore, index: number): IndexScroll {
  let byIndex = SHARED.get(store);
  if (!byIndex) SHARED.set(store, (byIndex = new Map()));
  let sh = byIndex.get(index);
  if (!sh) byIndex.set(index, (sh = { pos: 0, max: 0, time: -1 }));
  return sh;
}

/**
 * Advance (once per frame) and read the shared position for `index`. Every active
 * widget calls this, but the `time` guard lets only the first through, so the
 * frame's delta is integrated exactly once. `max` grows to the furthest window
 * `end` on the index, so the position never overshoots past the last animation
 * (no dead zone to scroll back through on reverse).
 */
function sharedScroll(
  store: ScrollStore,
  index: number,
  end: number,
  s: Readonly<ScrollState>,
): number {
  const sh = getIndexScroll(store, index);
  if (end > sh.max) sh.max = end;
  if (s.time !== sh.time) {
    sh.time = s.time;
    sh.pos = Math.min(sh.max, Math.max(0, sh.pos + s.accumulator));
  }
  return sh.pos;
}

/**
 * Total reachable scroll across every section — the sum of each index's ceiling
 * (`max`). This is the true extent the GLOBAL counter spans: cumulative scroll from
 * the top of the page to the bottom. It grows as later sections register/activate
 * and their ceilings fill in, and never shrinks (index maxes only grow).
 */
function totalExtent(store: ScrollStore): number {
  let total = 0;
  const byIndex = SHARED.get(store);
  if (byIndex) for (const sh of byIndex.values()) total += sh.max;
  return total;
}

/**
 * The GLOBAL scroll position (per store): the raw wheel delta integrated every
 * frame, ungated by section and shared by every `raw` widget — so a `rawAnim`
 * plays against absolute scroll, straight across section hand-offs. Clamped to
 * `[0, totalExtent]` — the WHOLE page's scroll, NOT the furthest raw window.
 * Clamping at the furthest raw window was wrong: it pinned the counter there on the
 * way down, so on the way back it unwound from that pin immediately — a rawAnim
 * reversed the moment you scrolled up from far below its window, instead of when you
 * scrolled back INTO it. Time-guarded: many raw widgets call this per frame, only
 * the first integrates the delta.
 */
const GLOBAL = new WeakMap<ScrollStore, IndexScroll>();
function globalScroll(store: ScrollStore, s: Readonly<ScrollState>): number {
  let sh = GLOBAL.get(store);
  if (!sh) GLOBAL.set(store, (sh = { pos: 0, max: 0, time: -1 }));
  if (s.time !== sh.time) {
    sh.time = s.time;
    sh.pos = Math.min(totalExtent(store), Math.max(0, sh.pos + s.accumulator));
  }
  return sh.pos;
}

/** Live integrated scroll position for an index (0 until a widget on it runs). */
export function readIndexPos(store: ScrollStore, index: number): number {
  return SHARED.get(store)?.get(index)?.pos ?? 0;
}

/** Furthest window end seen on an index — a section's fallback hand-off threshold. */
export function readIndexMax(store: ScrollStore, index: number): number {
  return SHARED.get(store)?.get(index)?.max ?? 0;
}

/** Grow an index's ceiling so `pos` can reach an explicitly-declared threshold. */
export function growIndexCeiling(store: ScrollStore, index: number, value: number): void {
  const sh = getIndexScroll(store, index);
  if (value > sh.max) sh.max = value;
}

/** Force an index's integrated scroll position, clamped to its current ceiling, and
 *  return the value actually stored. An imperative override the core uses to land
 *  every panel when jumping to a section: pass `Infinity` for "scrolled to the end",
 *  `0` for "not yet reached". The clamped return lets the core sum the landed
 *  positions (for the global counter). Ordinary per-frame integration is untouched. */
export function setIndexPos(store: ScrollStore, index: number, pos: number): number {
  const sh = getIndexScroll(store, index);
  sh.pos = Math.min(sh.max, Math.max(0, pos));
  return sh.pos;
}

/** Force the GLOBAL scroll counter (the one `rawAnim` widgets read via `globalScroll`),
 *  clamped to `[0, totalExtent]`. The core calls this on a jump so `rawAnim` layers —
 *  ungated by section — reset to the landed cumulative position instead of keeping
 *  their far-scrolled pose. */
export function setGlobalPos(store: ScrollStore, pos: number): void {
  let sh = GLOBAL.get(store);
  if (!sh) GLOBAL.set(store, (sh = { pos: 0, max: 0, time: -1 }));
  sh.pos = Math.min(totalExtent(store), Math.max(0, pos));
}

/**
 * Integrate an index's scroll position for this frame, clamped to its current
 * ceiling. Time-guarded like `sharedScroll`, so the core calling this and the
 * widgets on the same index running in the same frame integrate the delta exactly
 * once. Lets the core advance the *active* section's position even when it owns no
 * widgets (e.g. a bare panel), so `snap` slides and hand-offs still progress.
 */
export function integrateIndexPos(
  store: ScrollStore,
  index: number,
  s: { time: number; accumulator: number },
): number {
  const sh = getIndexScroll(store, index);
  if (s.time !== sh.time) {
    sh.time = s.time;
    sh.pos = Math.min(sh.max, Math.max(0, sh.pos + s.accumulator));
  }
  return sh.pos;
}

/**
 * Map a continuous, ≥0 cycle count to the phase `p ∈ [0,1]` that drives the anim.
 * "repeat" is a sawtooth (each cycle restarts at 0); "pingpong" a triangle (odd
 * cycles play in reverse). Past `times` it holds the final pose — the anim's `to`
 * for "repeat", or wherever the last leg landed for "pingpong".
 */
function loopPhase(cycles: number, loop: LoopSpec): number {
  const mode = loop.mode ?? "repeat";
  if (loop.times !== undefined && cycles >= loop.times) {
    return mode === "pingpong" ? (Math.floor(loop.times) % 2 === 0 ? 0 : 1) : 1;
  }
  const frac = cycles - Math.floor(cycles);
  return mode === "pingpong" && Math.floor(cycles) % 2 === 1 ? 1 - frac : frac;
}

/**
 * The shared heart of every scroll-driven widget: while this widget is the
 * active one (`widgetIndex === index`), read the shared per-index scroll position
 * (see `sharedScroll`) and hand back normalized progress `p ∈ [0,1]` for this
 * widget's `[start, end]` window.
 *
 * The active window is a `[start, end]` slice of that position: `p` holds at 0
 * until the position reaches `start`, then ramps to 1 at `end`. `end - start`
 * is the widget's budget — the scroll units it takes to play start-to-finish.
 * For the common case pass just `budget` (window `[0, budget]`); pass `start`
 * to delay the widget, staggering it against others on the same index.
 *
 * Progress is smoothed before it is handed on: `onProgress` receives an eased
 * value that glides toward the scroll-derived target (see `./smoothing`), so
 * a tick animates over time rather than snapping. It runs inside the core's
 * single rAF loop — mutate refs / DOM in it, never setState. It receives the raw
 * scroll state too, in case a widget wants more than `p`.
 *
 * In `raw` mode the widget is ungated by section: it ignores `s.sectionIndex` and
 * its section's offset, and plays over the ABSOLUTE window `[start, end]` against
 * the global scroll position (`globalScroll`). This is the path `rawAnim` widgets
 * take — everything downstream (smoothing, `p ∈ [0,1]`) is identical.
 */
export function useSequenceProgress(
  { index, budget, start = 0, end, raw = false, loop }: {
    index?: number;
    /** Scroll units to play start-to-finish. Ignored when `end` is given. */
    budget?: number;
    /** Scroll position where `p` leaves 0 (default 0). */
    start?: number;
    /** Scroll position where `p` reaches 1 (default `start + budget`). */
    end?: number;
    /** Drive from the global scroll position, ungated by section (see above). */
    raw?: boolean;
    /** Replay the anim as a repeating phase (see {@link LoopSpec}). */
    loop?: LoopSpec;
  },
  onProgress: (p: number, state: Readonly<ScrollState>) => void,
): void {
  // Inherit the gating index and scroll origin from the enclosing <Section>.
  // The default (unnested) is `index 0, offset 0`, so `start`/`end` stay absolute
  // and this reduces to the pre-section behavior exactly. `offset` shifts this
  // widget's window along the shared position so section-local `start`/`end`
  // compose without hand-editing absolute positions. A `raw` widget opts out of
  // both: no gating, no offset — its window is absolute against global scroll.
  const section = useSection();
  const idx = index ?? section.index;
  const offset = raw ? 0 : section.offset;

  const localEnd = end ?? start + (budget ?? 0); // upper bound in section-local space
  const span = localEnd - start;                 // budget == localEnd - start
  // A wheel loop must be scrollable through all its cycles (start + times*period);
  // an auto loop only needs the scroll to reach `start` to arm. Reach that far so
  // sharedScroll grows this index's ceiling to cover it. Non-loop path unchanged.
  const loopReach = loop
    ? loop.by === "auto" ? start : start + (loop.times ?? 0) * loop.period
    : 0;
  const to = offset + (loop ? Math.max(localEnd, loopReach) : localEnd); // upper bound in index space

  const store = useScrollStore();
  const displayed = useRef(0); // eased progress (or, for a wheel loop, eased cycle count)
  const lastTime = useRef(0);  // previous frame's clock, for the smoother's dt
  const elapsed = useRef(0);   // armed wall-clock ms accumulated (auto loop only)
  const started = useRef(false); // has this widget ever run on its ACTIVE section?

  useScrollFrame((s) => {
    // During a jump's glide, `s.settle` lists the sections currently off-screen — the
    // ones safe to snap to their just-reset pose this frame (see ScrollShell). `idx`
    // exists even in raw mode (the enclosing section), so one list drives both layers.
    const settling = s.settle !== undefined;
    const inList = settling && s.settle!.includes(idx);
    // TRAILING — the section you scroll AWAY from still has to LAND its animation.
    // Its position does reach the end (it is clamped to the index ceiling, and the
    // hand-off only fires once it is past the threshold), but the *smoothed* progress
    // lags that position by design — so a fast scroll hands off while `displayed` is
    // still mid-ramp. Cutting the widget dead right there froze it there, in plain
    // sight: the leaving panel stays on screen for the whole snap glide. So a widget
    // whose section is no longer active keeps ticking, easing toward the pose its (now
    // frozen) position implies, and stops itself the moment it converges — see the
    // early-out below, which is what keeps an idle section free.
    //
    // Three cases opt out. A settling frame: a jump's own rule wins there — a
    // still-visible section HOLDS and snaps only once off-screen (`inList`), which
    // trailing would contradict. A loop: an `auto` loop must pause off-section, holding
    // its phase (see LoopSpec). And a widget that has never run on its active section:
    // nothing was started, so there is nothing to finish (`span <= 0` widgets, whose
    // target is 1 unconditionally, would otherwise pose themselves ahead of the reader).
    const trailing = !raw && s.sectionIndex !== idx && !inList;
    if (trailing && (settling || loop || !started.current)) return;
    // A raw widget is ungated, but on a settle frame its target teleports (global was
    // reset); hold it while its own section is still on-screen so it doesn't visibly
    // chase, letting it snap once that section is off-screen (in the list).
    if (raw && settling && !inList) return;
    if (!trailing) started.current = true;

    // Loop mode: emit a repeating PHASE instead of a one-shot ramp. Kept ahead of
    // the ordinary path (which it fully replaces for a loop widget), so the two
    // never share state — a loop reuses `displayed`/`lastTime` for its own meaning.
    if (loop) {
      const pos = raw ? globalScroll(store, s) : sharedScroll(store, idx, to, s);
      const local = pos - offset;
      const dt = lastTime.current ? Math.min(64, s.time - lastTime.current) : 0;
      lastTime.current = s.time;
      const period = loop.period > 0 ? loop.period : 1;

      let cycles: number;
      if (loop.by === "auto") {
        // Wall-clock advance, but only while armed (scrolled past `start`). The
        // section gate above already freezes it off-section, so `elapsed` holds and
        // the phase resumes where it paused on return.
        if (local >= start) elapsed.current += dt;
        cycles = elapsed.current / period;
      } else {
        // Scroll advance, smoothed on the CONTINUOUS cycle count (never the phase,
        // whose 1→0 wrap the smoother would smear) — take the fraction after easing.
        // An off-screen settle (inList) snaps straight to the target so a jump lands clean.
        const target = Math.max(0, (local - start) / period);
        let next = inList ? target : defaultSmoother(displayed.current, target, dt);
        if (Math.abs(target - next) < 1e-4) next = target;
        displayed.current = next;
        cycles = next;
      }
      onProgress(loopPhase(cycles, loop), s);
      return;
    }

    // Read the scroll position (integrated once per frame): the global one in raw
    // mode, else this index's shared position shifted into the section's local
    // space, then take this widget's window slice. Because the position is shared,
    // a widget past its `end` holds until the position reverses back into range —
    // so reversing unwinds the end of the queue, not everyone at once.
    // Trailing reads the position WITHOUT integrating: `sharedScroll` adds this frame's
    // delta to the index it is called with, so calling it from a section that is no
    // longer the active one would advance (or unwind) that section while the reader
    // scrolls a different one — it would be found already rewound on the way back.
    const pos = raw ? globalScroll(store, s)
      : trailing ? readIndexPos(store, idx)
      : sharedScroll(store, idx, to, s);
    const local = pos - offset;
    const target = span > 0 ? Math.min(1, Math.max(0, (local - start) / span)) : 1;
    // Landed: a trailing widget that has reached its target is done, and costs nothing
    // from here on. (The snap below assigns the exact target, so this compares exactly.)
    if (trailing && displayed.current === target) return;

    // Smoothing stage — the one spot every animation passes through before it
    // becomes style. Ease `displayed` toward `target`; new ticks only move the
    // target, so the same ease keeps chasing it. dt is clamped so a hidden tab
    // (rAF paused) can't jump on return; snap once close to avoid endless churn.
    // An off-screen settle (inList) snaps straight to the target, bypassing the ease,
    // so a section reflects its reset pose the instant it's out of view; ordinary
    // frames (and still-visible sections) ease as before.
    const dt = lastTime.current ? Math.min(64, s.time - lastTime.current) : 0;
    lastTime.current = s.time;
    let next = inList ? target : defaultSmoother(displayed.current, target, dt);
    if (Math.abs(target - next) < 1e-4) next = target;
    displayed.current = next;

    onProgress(next, s);
  });
}
