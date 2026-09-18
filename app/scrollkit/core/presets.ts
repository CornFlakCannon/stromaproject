/**
 * Named magnitudes — the bridge between how a person describes motion and the
 * numbers the engine actually runs on.
 *
 * Structure is easy to get right from a description ("a panel that wipes in as you
 * scroll" maps to `<Section snap>` + `<SMask>` unambiguously). **Magnitudes are not.**
 * "A slow reveal" is a number, and left unnamed it gets guessed differently every
 * time — which is where nearly all the back-and-forth in authoring goes.
 *
 * So intent words live here, once, and everything else points at them: the lexicon
 * in `PROMPT_CONVENTIONS.md` resolves a phrase to `BUDGET.slow`, the cookbook uses
 * the same token, and a re-read of the code says `BUDGET.slow` rather than `3200`.
 * Change the feel of every "slow" thing in a project by editing one row.
 *
 * These are defaults, not a straitjacket — every prop that takes a preset also takes
 * a raw number. Reach for a raw number when a value is genuinely one-off; reach for
 * a preset (or add a row) when it expresses an intent that will recur.
 */

import {
  easeInCubic,
  easeInOutCubic,
  easeInOutQuad,
  easeOutCubic,
  linear,
  smoothstep,
  type Easing,
} from "./easing";

/**
 * Scroll units a widget takes to play start-to-finish — what `budget` (or
 * `end - start`) wants. The unit is accumulated wheel delta, so these are absolute:
 * they mean the same amount of scrolling on a phone and on a desktop, independent
 * of viewport size or the CSS units the keyframes are authored in.
 *
 * Rule of thumb: `normal` is about one comfortable scroll gesture. Anything above
 * `slow` asks the reader to commit, so spend it only on the moment a section is
 * actually about.
 */
export const BUDGET = {
  /** A beat — a fade or a nudge that should feel immediate. */
  instant: 300,
  /** A short move; several of these stagger nicely inside one section. */
  quick: 800,
  /** The workhorse. One unhurried gesture, start to finish. */
  normal: 1600,
  /** A deliberate reveal the reader has to keep scrolling through. */
  slow: 3200,
  /** A section-length set piece (a long image sequence, a full-panel transform). */
  epic: 6000,
} as const;

/**
 * Scroll span a `snap` panel takes to glide up into view when it becomes active
 * (see `sections.ts`). Also the stagger floor for widgets on that section: a widget
 * with `start >= the snap span` plays only *after* the panel has landed.
 *
 * `normal` is the value `<Section snap>` uses when `snap` is just `true`.
 */
export const SNAP = {
  /** Snappy hand-off; the panel is in place almost as soon as you push into it. */
  fast: 300,
  /** Default — the panel slides up over one short gesture. */
  normal: 600,
  /** A long, cinematic push where the outgoing panel stays visible a while. */
  slow: 1200,
} as const;

/**
 * Intent → easing curve, so a phrase maps to one curve everywhere in a project
 * instead of a different `easeInOut*` each time it comes up. Pass as a keyframe's
 * `ease`, which shapes the transition *into* that keyframe.
 *
 * The raw curves stay exported from `./easing` for anything these don't cover.
 */
export const EASE = {
  /** Constant speed. Correct for scrubbing (an image sequence), rarely for motion. */
  steady: linear,
  /** Arrives softly, decelerating into place — the default for "comes to rest". */
  settle: easeOutCubic,
  /** Starts still and accelerates away — for "takes off" / "gets flung out". */
  launch: easeInCubic,
  /** Soft at both ends, mild. The workhorse for anything travelling across screen. */
  swoop: easeInOutQuad,
  /** Soft at both ends, pronounced — a heavier, more cinematic version of `swoop`. */
  glide: easeInOutCubic,
  /** The gentlest ease-in-out; good for opacity and small nudges. */
  gentle: smoothstep,
} as const satisfies Record<string, Easing>;

/**
 * Length of ONE cycle of an `auto` loop, in milliseconds (see `LoopSpec.period`).
 * Wheel-driven loops take scroll units instead — use `BUDGET.*` for those.
 */
export const PERIOD = {
  /** A quick pulse — a blink, a shimmer. */
  fast: 600,
  /** Default — a visible, unhurried cycle. */
  normal: 1200,
  /** A slow breath; reads as ambient rather than as an animation. */
  slow: 2400,
} as const;

/**
 * How fast a PLAYTHROUGH scrolls the page by itself (see `core/autoplay.ts`), in scroll
 * units per second. Being the same unit as `BUDGET` makes it compose: a widget's
 * on-screen duration is exactly `budget / speed` seconds, whatever the page's length.
 * So `BUDGET.normal` at `SPEED.normal` takes two seconds, on every site.
 *
 * Read the names the other way round from `BUDGET`'s: a *slower* playthrough is a
 * *smaller* number, because this is a rate and that is a distance.
 */
export const SPEED = {
  /** A drifting read — one `BUDGET.normal` beat takes about four seconds. */
  slow: 400,
  /** Default — one `BUDGET.normal` beat per two seconds; an unhurried gesture's pace. */
  normal: 800,
  /** A brisk showreel — one `BUDGET.normal` beat per second. */
  fast: 1600,
} as const;

/** Intent name accepted anywhere a scroll-unit magnitude is expected. */
export type BudgetName = keyof typeof BUDGET;
/** Intent name accepted anywhere a snap span is expected. */
export type SnapName = keyof typeof SNAP;
/** Intent name accepted anywhere an easing is expected. */
export type EaseName = keyof typeof EASE;
/** Intent name accepted anywhere a playthrough rate is expected. */
export type SpeedName = keyof typeof SPEED;
