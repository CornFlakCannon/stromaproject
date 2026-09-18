/**
 * The page's shared vocabulary of movement. Hoisted to module scope on purpose:
 * SDiv memoises `compileAnim` on the array's identity, so a literal written
 * inline recompiles on every render.
 *
 * Two magnitudes cover almost everything — one BEAT of stagger between
 * neighbours, one PLAY for a widget to travel start to finish.
 */
import { BUDGET, EASE, type AnimSpec } from "@/app/scrollkit";

export const BEAT = BUDGET.instant; // 300 — the gap between two things arriving
export const PLAY = BUDGET.quick; //  800 — how long one thing takes to arrive

/** The default: lift into place from just below, fading up. */
export const rise: AnimSpec = [
  { at: 0, y: "4svh", opacity: 0 },
  { at: 1, y: "0svh", opacity: 1, ease: EASE.settle },
];

/** For headline-sized things, which need further to travel to feel heavy. */
export const riseHeavy: AnimSpec = [
  { at: 0, y: "9svh", opacity: 0 },
  { at: 1, y: "0svh", opacity: 1, ease: EASE.settle },
];

/** List items: they arrive from the margin, the way a line of type is set. */
export const fromLeft: AnimSpec = [
  { at: 0, x: "-5vw", opacity: 0 },
  { at: 1, x: "0vw", opacity: 1, ease: EASE.swoop },
];

/** A rule or a strike drawing itself across. Pair with anchor={{ x: "start" }}. */
export const drawAcross: AnimSpec = [
  { at: 0, scale: 0 },
  { at: 1, scale: 1, ease: EASE.glide },
];

/** The hero does not enter on scroll — it leaves. */
export const heroExit: AnimSpec = [
  { at: 0, y: "0svh", opacity: 1 },
  { at: 1, y: "-12svh", opacity: 0, ease: EASE.launch },
];

export const heroExitSoft: AnimSpec = [
  { at: 0, y: "0svh", opacity: 1 },
  { at: 0.75, y: "-5svh", opacity: 0, ease: EASE.launch },
];

/** The scroll hint, breathing on the clock instead of the wheel. */
export const breathe: AnimSpec = [
  { at: 0, y: "0svh", opacity: 0.4 },
  { at: 1, y: "1.1svh", opacity: 1, ease: EASE.gentle },
];

/** A photograph settling: it overshoots a hair, then lands. */
export const settleIn: AnimSpec = [
  { at: 0, y: "8svh", scale: 1.06, opacity: 0 },
  { at: 0.72, y: "-1svh", scale: 1.01, opacity: 1, ease: EASE.swoop },
  { at: 1, y: "0svh", scale: 1, ease: EASE.settle },
];

/** A reveal wipe for SMask: the shape is a px rectangle in the parent's box, and
 *  we overshoot it deliberately so the same spec works at any measured size. */
export const wipeDown: AnimSpec = [
  { at: 0, x: -200, y: -200, width: 2600, height: 0 },
  { at: 1, height: 2800, ease: EASE.swoop },
];
