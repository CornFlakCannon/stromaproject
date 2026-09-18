/**
 * Easing functions for scroll-driven sequences. Each maps normalized progress
 * t ∈ [0,1] → eased [0,1]. Pass one as the `ease` of a tween (see SDiv); the
 * default everywhere is `linear`.
 */
export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;

export const easeInQuad: Easing = (t) => t * t;
export const easeOutQuad: Easing = (t) => 1 - (1 - t) * (1 - t);
export const easeInOutQuad: Easing = (t) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

export const easeInCubic: Easing = (t) => t * t * t;
export const easeOutCubic: Easing = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic: Easing = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Classic Hermite smoothstep — gentle ease-in-out, cheaper than the cubic. */
export const smoothstep: Easing = (t) => t * t * (3 - 2 * t);
