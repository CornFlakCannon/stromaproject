/**
 * The smoothing stage every widget's progress passes through before it becomes
 * style (see `useSequenceProgress` — the single spot every animation flows
 * through). Raw scroll gives a *target* progress; the displayed progress eases
 * toward it over time, so a scroll "tick" glides to its new value instead of
 * snapping. Further ticks only move the target, so the same ease keeps chasing
 * it — the motion extends for as long as you keep scrolling, then settles.
 *
 * A `Smoother` is a pure per-frame step: given where we are (`current`), where
 * we're heading (`target`), and how long since the last frame (`dtMs`), return
 * the next displayed value. This is the modular slot to experiment in — write a
 * new law below and point `defaultSmoother` at it. The first is a simple lerp.
 */
export type Smoother = (current: number, target: number, dtMs: number) => number;

/**
 * Simple lerp toward the target, frame-rate independent. `halfLifeMs` is the time
 * to close half the remaining gap each step — smaller is snappier, larger floats
 * for longer. Continuing ticks just move `target`, so it keeps chasing.
 */
export const smoothLerp = (halfLifeMs = 90): Smoother => (current, target, dtMs) => {
  if (halfLifeMs <= 0) return target; // 0 half-life ⇒ no smoothing (snap)
  if (dtMs <= 0) return current; // no time passed ⇒ no movement
  const k = 1 - Math.pow(2, -dtMs / halfLifeMs);
  return current + (target - current) * k;
};

/** No smoothing — snap straight to the target. Handy as an A/B baseline. */
export const noSmoothing: Smoother = (_current, target) => target;

/** The active smoothing law. Swap this to experiment across every animation. */
export const defaultSmoother: Smoother = smoothLerp();
