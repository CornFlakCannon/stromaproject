'use client';

import { useEffect, useRef, useState } from "react";
// Sibling modules by relative path, never through the `./index` barrel (which
// re-exports this file) and never through a `@/…` alias — see docs/INVARIANTS.md:
// the kit must stay copy-portable into a project with a different path setup.
import {
  DEFAULT_STEP_MS,
  playTo,
  readAutoplay,
  readDestination,
  setAutoplay,
  setStepDuration,
} from "./autoplay";
import { ScrollStateProvider } from "./context";
import { consumeJump } from "./nav";
import {
  advanceSection,
  landingClamped,
  landingOf,
  offscreenSections,
  resetHandoff,
  sectionIndices,
  sectionScrollTop,
  snapDurationOf,
} from "./sections";
import { smoothLerp } from "./smoothing";
import { createScrollStore } from "./store";
import {
  integrateIndexPos,
  readIndexMax,
  readIndexPos,
  setGlobalPos,
  setIndexPos,
} from "./useSequenceProgress";

/** Half-life (ms) of the panel-to-panel scroll glide — the smoothness knob (bigger
 *  = softer/slower). It eases scrollTop toward a target that stays continuous across
 *  hand-offs, so it glides smoothly and still lands exactly, without ever stranding. */
const SCROLL_HALF_LIFE = 150;

/** Touch/pen scrub sensitivity — scroll units per pixel of finger travel. This is
 *  THE knob for how fast a swipe scrubs: 1 = 1:1 (sluggish against the large section
 *  budgets), higher = a swipe covers more ground. Only scales touch/pen; the wheel
 *  is unscaled. */
const TOUCH_SENSITIVITY = 3.5;

/** STEP MODE knobs (see the `step` prop). In step mode the input is not scroll, it is
 *  INTENT: it accumulates into a decaying sum, and a step fires when that sum crosses
 *  the threshold. One mouse click is 100 units, so it fires on the click; a trackpad
 *  has to be swiped, not brushed. */
const STEP_THRESHOLD = 40;
/** The threshold while a step is still in flight — a crossing there RE-AIMS the trip one
 *  panel further (or back), so it is held higher: a mouse click (100) still clears it,
 *  but the inertial dribble of the swipe that started the trip cannot. */
const STEP_REAIM_THRESHOLD = 80;
/** Half-life (ms) of the intent sum. This is what stops a trackpad's inertial tail
 *  from firing a second step: after a fling, macOS keeps dribbling 1–3 units per
 *  event for a second or more, and an undecayed sum would cross 40 in well under
 *  that. With a 100 ms half-life a dribble of 2 per frame plateaus near 20. */
const STEP_INTENT_HALF_LIFE = 100;
/** How long after a step fires (or a jump lands) the input stays ignored, ms — the one
 *  physical gesture that fired it must not fire again on its own tail. Short on
 *  purpose: every extra ms is felt as "I scrolled and nothing happened". */
const STEP_COOLDOWN = 200;

export default function ScrollShell ({
  children,
  step = false,
}: {
  children: React.ReactNode[];
  /**
   * Move the page in BLOCKS instead of scrubbing it: one wheel click or one swipe is
   * one panel, played in — a click while a panel is still arriving aims the trip one
   * panel further. `true` for the default trip length, a number for the
   * milliseconds one step takes — the one knob for "how fast the site feels", whatever
   * the panels' budgets (see `playTo` in `core/autoplay.ts`). Off (the default), the
   * wheel scrubs as before.
   */
  step?: boolean | number;
}) {
  const mainContainer = useRef<HTMLDivElement>(null);

  const animationId = useRef<number>(null);
  const scrollAccumulator = useRef<number>(0);
  const currentSectionIndex = useRef<number>(0);
  const lastFrameTime = useRef<number>(0);
  const scrollPos = useRef<number>(0);
  // True while a jump's glide is in flight: the loop sweeps the off-screen sections
  // each frame (see below) and resets each only once it has scrolled out of view.
  const settling = useRef<boolean>(false);
  // Set by an `instant` jump and consumed by the glide on the same frame: the
  // container is written straight to the target panel instead of eased there.
  const teleport = useRef<boolean>(false);
  // Step mode: the decaying intent sum, and the time until which input is ignored.
  const stepIntent = useRef<number>(0);
  const stepLockUntil = useRef<number>(0);

  // One store the core owns and writes; widgets read it via useScrollFrame.
  // useState (lazy init) gives a stable, render-readable handle: created once,
  // never re-set. Its contents mutate inside the store (see notify), not here.
  const store = useState(() => createScrollStore())[0];

  const stepping = step !== false;
  const stepMs = typeof step === "number" ? step : DEFAULT_STEP_MS;

  useEffect(() => {
    // The shell's duration is the page's: arrow keys and any `playTo` caller read it.
    setStepDuration(store, stepMs);

    // Touch gesture state, shared by the handlers and the loop (all in this closure).
    let dragging = false;
    let lastPointerY = 0;
    // Step mode: a swipe is ONE step, however far the finger keeps travelling after
    // the step fired — reset on the next pointerdown.
    let gestureSpent = false;

    // Single rAF loop. Defined here as a plain local function so its self-
    // reference — requestAnimationFrame(animate) — is lint-clean (a component
    // -level useCallback that references itself is not).
    const animate = (time: number) => {
      // This frame's length, first thing: the playthrough below converts its rate with
      // it and the glide at the bottom eases with it, and both must see the same number.
      // Clamped so a backgrounded tab (or a stalled frame) can't lurch the page forward.
      const dt = lastFrameTime.current ? Math.min(64, time - lastFrameTime.current) : 0;
      lastFrameTime.current = time;

      // Consume this frame's accumulated scroll delta and reset it, so each
      // frame reports only its own movement. Widgets integrate this into their
      // own scroll budget (see ImageSequence).
      const input = scrollAccumulator.current;
      scrollAccumulator.current = 0;
      // Scrub mode: the input IS the delta. Step mode: it is intent (below), and only
      // the playthrough moves the page.
      let delta = stepping ? 0 : input;

      // PLAYTHROUGH (core/autoplay.ts): while one is running, add the distance it
      // covers this frame — units/sec × this frame's seconds — to the very same delta
      // the wheel produces. That is the whole feature: hand-offs, the snap glide,
      // `rawAnim` and the smoothers all read this one number, so the page plays exactly
      // as a reader scrolling at a steady pace would, with no second clock.
      //
      // With a DESTINATION (`until`) the same delta is signed toward it — decided from
      // the pre-frame active index, since that is the index the hand-off is decided
      // from — and, once the destination is the active section, trimmed so the position
      // lands exactly on its landing (see below, after the hand-off).
      const rate = readAutoplay(store);
      let until = readDestination(store);
      const travel = rate !== null ? rate * (dt / 1000) : 0;
      const current = currentSectionIndex.current;
      if (rate !== null) delta += until === null || until >= current ? travel : -travel;

      // STEP MODE: the wheel and the finger do not scroll, they ASK for a panel. The
      // input feeds a decaying intent sum; crossing the threshold plays to the
      // neighbouring panel (by ordinal: indices need not be contiguous) in `stepMs`.
      // A trip does NOT lock the wheel: a crossing while one is in flight re-aims it one
      // panel further — or back — from where it was heading, and the remaining trip
      // takes `stepMs` again from now. Nothing can break: the current panel still plays
      // out, hands off, and the next plays in — only the delta's rate and sign change.
      // Input IS dropped for STEP_COOLDOWN after each fire (the gesture that fired it
      // must not fire again on its own tail), during a jump's settle (positions are
      // being snapped, not played), and once a swipe has spent its one step.
      if (stepping) {
        if (settling.current) stepLockUntil.current = time + STEP_COOLDOWN;
        if (time < stepLockUntil.current || (dragging && gestureSpent)) {
          stepIntent.current = 0;
        } else {
          const keep = dt > 0 ? Math.pow(2, -dt / STEP_INTENT_HALF_LIFE) : 1;
          stepIntent.current = stepIntent.current * keep + input;
          const threshold = until !== null ? STEP_REAIM_THRESHOLD : STEP_THRESHOLD;
          if (Math.abs(stepIntent.current) >= threshold) {
            const order = sectionIndices(store);
            // Count from where the trip is HEADING, not from where it is: two quick
            // clicks mean two panels.
            const k = order.indexOf(until ?? current);
            const next = k < 0 ? undefined : order[k + Math.sign(stepIntent.current)];
            if (next !== undefined) {
              playTo(store, current, next, stepMs);
              stepLockUntil.current = time + STEP_COOLDOWN;
              if (dragging) gestureSpent = true;
            }
            stepIntent.current = 0;
          }
        }
      }

      // Imperative jump (a CTA / a section menu — see core/nav.ts). Land
      // every panel around the target: sections before it are fully scrolled (pos = ∞ →
      // clamped to their max), those after it reset to the start (0). The TARGET lands
      // where its author says it READS (`landingOf` — the ceiling unless the section
      // declares otherwise), NOT by direction of travel: a panel wraps its contents in a
      // nested `<Section start={snap span}>`, so landing on the snap span alone puts every
      // widget at p = 0 and the reader arrives at an empty screen. `"start"` overrides
      // that with the panel's beginning, which is what a "back to the top" affordance
      // means. Sum the landed positions into the GLOBAL counter so
      // `rawAnim` layers (ungated by section) resolve to the same spot. Drop this frame's
      // delta so the fresh position isn't re-advanced, and start "settling": the sweep
      // below snaps each section's reset only once it's off-screen, so the leaving one
      // never visibly jumps. The glide then eases scrollTop to the target panel.
      const jump = consumeJump(store);
      if (jump !== null) {
        // A jump is a destination too, and the newer one wins: a playthrough still
        // heading somewhere else is stopped here, before the trim below could aim it
        // at the jumped state.
        setAutoplay(store, null);
        until = null;
        // Never 0 for the target under "start": a snap panel at position 0 reports
        // the PREVIOUS panel's top, and with the delta dropped nothing would advance it
        // out of the glide again.
        const landing =
          jump.at === "start" ? snapDurationOf(store, jump.index) : landingOf(store, jump.index);
        let global = 0;
        for (const i of sectionIndices(store)) {
          const pos = i < jump.index ? Infinity : i > jump.index ? 0 : landing;
          global += setIndexPos(store, i, pos);
        }
        setGlobalPos(store, global);
        currentSectionIndex.current = jump.index;
        // The landing sits AT an edge (a backward jump lands on the ceiling), so
        // the edge overshoot banked before the jump has to go with it — see
        // resetHandoff in core/sections.ts.
        resetHandoff(store);
        delta = 0;
        settling.current = true;
        teleport.current = jump.instant;
      }

      // Advance the active section when its scroll crosses the threshold it
      // declares (and back when it returns to the bottom). Decided from the
      // previous frame's integrated position, so the hand-off lags one frame;
      // see core/sections.ts.
      //
      // Not while already ON the destination of a playthrough: a section whose landing
      // lies past its declared `end` would otherwise bank the margin on the way to it
      // and hand off before arriving. The hand-off INTO the destination still happens —
      // on that frame the pre-frame index is not yet the destination.
      const active = until !== null && currentSectionIndex.current === until
        ? until
        : advanceSection(store, currentSectionIndex.current, delta);
      currentSectionIndex.current = active;

      // Destination reached this frame? Trim the delta to the exact remaining distance
      // — on the hand-off frame too, so nothing leaks past the landing — and stop the
      // playthrough after integrating it. A flag, not a float comparison: `pos +
      // (landing − pos)` is not guaranteed to equal `landing` in IEEE arithmetic.
      let arrived = false;
      if (until !== null && active === until) {
        const remaining = landingClamped(store, until) - readIndexPos(store, active);
        if (Math.abs(remaining) <= travel) {
          delta = remaining;
          arrived = true;
        } else {
          delta = Math.sign(remaining) * travel;
        }
      }

      // Integrate the active section's own scroll position this frame (once —
      // widgets on it read the same value below). Doing it here also advances
      // panels that own no widgets, so `snap` slides still progress.
      integrateIndexPos(store, active, { time, accumulator: delta });
      if (arrived) setAutoplay(store, null);

      // End of a FREE playthrough (no destination): the last section's position is
      // clamped to its ceiling, so once it sits there the page has nowhere left to go
      // and autoplay would keep injecting delta into a wall. Stop it — the reader is at
      // the bottom, and a control reading `useAutoplay().speed` flips back to "Play" on
      // this frame. It does not rewind; where it stopped is where the reader is. (A
      // ceiling of 0 means a section that has registered no span yet, not one that is
      // finished.) A destination playthrough ends at its landing instead — it may well
      // START at the bottom, heading up.
      if (rate !== null && until === null) {
        const all = sectionIndices(store);
        const last = all[all.length - 1];
        if (last !== undefined && active === last) {
          const max = readIndexMax(store, last);
          if (max > 0 && readIndexPos(store, last) >= max) setAutoplay(store, null);
        }
      }

      // While settling (a jump glide), broadcast the sections currently off-screen so
      // their widgets snap to the just-reset pose out of view; the still-visible one is
      // omitted and stays frozen until it scrolls out. Settling ends once every non-
      // active section is off-screen — the last visible one snaps on that same frame.
      let settleList: number[] | undefined;
      if (settling.current) {
        const H = mainContainer.current?.clientHeight ?? 0;
        settleList = offscreenSections(store, scrollPos.current, H);
        if (sectionIndices(store).every((i) => i === active || settleList!.includes(i))) {
          settling.current = false;
        }
      }

      // Publish this frame's gamestate and fan out to widgets. Values go through
      // notify() (not store.state.x = ...) so the mutation stays inside the store.
      store.notify({ time, accumulator: delta, sectionIndex: active, settle: settleList });

      // Glide the container toward the active section's panel, easing scrollTop over
      // time for a smooth transition. Safe now because the target stays continuous
      // across a hand-off (sectionScrollTop never goes null between panels) — the old
      // strand was the target vanishing, not the easing. Clamp to the reachable range
      // and snap the last sub-pixel so a panel still lands exactly flush. (`dt` comes
      // from the top of the loop — the playthrough needs it before this point.)
      const container = mainContainer.current;
      if (container) {
        const want = sectionScrollTop(store, active);
        if (want !== null) {
          const target = Math.max(0, Math.min(want, container.scrollHeight - container.clientHeight));
          // Ease our OWN float — not container.scrollTop, which the browser rounds to
          // a whole pixel. Reading that rounded value back each frame makes the tiny
          // sub-pixel steps near the end vanish, stalling the glide a few px short of
          // the top/bottom. Keeping the float here (and snapping the last sub-pixel)
          // lands it exactly; we only ever *write* scrollTop, never read it back.
          // An instant jump lands the container in one write instead of easing it.
          // The settle sweep runs before this block, so it sees the new scrollPos on
          // the NEXT frame: every other panel is off-screen by then and its widgets
          // snap to the landed pose out of view, and settling ends there.
          let next = teleport.current
            ? target
            : smoothLerp(SCROLL_HALF_LIFE)(scrollPos.current, target, dt);
          teleport.current = false;
          if (Math.abs(target - next) < 0.5) next = target;
          scrollPos.current = next;
          container.scrollTop = next;
        }
      }

      animationId.current = requestAnimationFrame(animate);
    };

    animationId.current = requestAnimationFrame(animate);

    // A real scroll always wins: it hands control back from a running playthrough
    // instead of fighting its drift. Placed at the two spots that actually PRODUCE
    // delta (here and pointermove) — not on pointerdown, where a tap on a link would
    // read as scrolling. Autoplay only ever writes `container.scrollTop`, which emits
    // no wheel or pointer event, so this can't cancel itself.
    //
    // Not in step mode: there the playthrough IS the reader's own step, and the input
    // that would cancel it is dropped by the lock in the loop instead.
    const releaseAutoplay = () => {
      if (!stepping && readAutoplay(store) !== null) setAutoplay(store, null);
    };

    const handleWheel = (e: WheelEvent) => {
      // Accumulate scroll delta across events; the loop consumes it each frame.
      // Clamp per-event so a single fling can't jump the animation.
      releaseAutoplay();
      scrollAccumulator.current += Math.max(-100, Math.min(100, e.deltaY));
      e.preventDefault();
    };

    // Touch/pen drag is the phone's wheel: feed the SAME accumulator so the rAF loop
    // stays input-agnostic. Pointer Events (not raw touch) give one reliable path with
    // `clientY` straight on the event — no fragile `touches[0]` — and, together with
    // `touch-action: none` on the container (see className) plus setPointerCapture,
    // the browser delivers every move to us instead of scrolling. The mouse keeps using
    // the wheel above. Swiping up (finger toward the top, smaller Y) scrolls the content
    // down like native — hence delta = last − current, under the same per-move clamp.
    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return; // desktop stays wheel-driven
      dragging = true;
      gestureSpent = false;
      lastPointerY = e.clientY;
      mainContainer.current?.setPointerCapture(e.pointerId);
    };
    const handlePointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      releaseAutoplay();
      // Clamp raw finger travel per event (anti-jump, like the wheel), THEN scale by
      // the sensitivity knob so a swipe covers a useful slice of the section budget.
      const travel = Math.max(-100, Math.min(100, lastPointerY - e.clientY));
      scrollAccumulator.current += travel * TOUCH_SENSITIVITY;
      lastPointerY = e.clientY;
    };
    const endDrag = () => {
      dragging = false;
    };

    if (mainContainer.current) {
      mainContainer.current.addEventListener('wheel', handleWheel, { passive: false });
      mainContainer.current.addEventListener('pointerdown', handlePointerDown);
      mainContainer.current.addEventListener('pointermove', handlePointerMove);
      mainContainer.current.addEventListener('pointerup', endDrag);
      mainContainer.current.addEventListener('pointercancel', endDrag);
      // Each direct child is a full-viewport section wrapper.
      for (const el of mainContainer.current.children) {
        el.classList.add("min-h-[100svh]");
      }
    }

    return () => {
      if (animationId.current) cancelAnimationFrame(animationId.current);
      if (mainContainer.current) {
        mainContainer.current.removeEventListener('wheel', handleWheel);
        mainContainer.current.removeEventListener('pointerdown', handlePointerDown);
        mainContainer.current.removeEventListener('pointermove', handlePointerMove);
        mainContainer.current.removeEventListener('pointerup', endDrag);
        mainContainer.current.removeEventListener('pointercancel', endDrag);
      }
    };
  }, [store, stepping, stepMs]);

  // touch-none = `touch-action: none`: tell the browser up front NOT to treat touch
  // as native scroll/zoom on this container. Without it a phone starts the scroll on
  // the compositor and ignores our touchmove preventDefault, so the page scrolls
  // natively and the accumulator never sees the gesture. With it, every touch is
  // delivered to our handler and drives the animation instead. (overscroll-none also
  // kills pull-to-refresh.) Wheel/desktop is unaffected — touch-action is touch-only.
  return (
    <div
      ref={mainContainer}
      className="relative flex flex-col bg-black w-full max-h-[100svh] overflow-y-scroll no-scrollbar touch-none overscroll-none"
    >
      <ScrollStateProvider store={store}>
        {children}
      </ScrollStateProvider>
    </div>
  );
}
