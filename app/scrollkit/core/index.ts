/**
 * The core's internal surface — what the kit's own widgets import (`../core`).
 *
 * Widgets import from HERE, never from `../index` (the public barrel re-exports the
 * widgets themselves, so going through it would loop) and never from a `@/…` alias
 * (see docs/INVARIANTS.md — the kit must survive being copied into a project with a
 * different path setup). Core modules import each other by direct relative path,
 * never through this file.
 *
 * Everything here is also re-exported publicly by `../index`; this file exists so
 * the two directions stay untangled.
 */

export { createScrollStore } from './store';
export type { ScrollState, ScrollStore, FrameListener } from './store';

export { ScrollStateProvider, useScrollStore, useSection } from './context';
export type { SectionCtx } from './context';

export { useScrollFrame } from './useScrollFrame';

export {
  useSequenceProgress,
  integrateIndexPos,
  readIndexMax,
  readIndexPos,
  growIndexCeiling,
  setIndexPos,
  setGlobalPos,
} from './useSequenceProgress';
export type { SequenceSpec, LoopSpec } from './useSequenceProgress';

export {
  Section,
  advanceSection,
  sectionScrollTop,
  sectionIndices,
  snapDurationOf,
  offscreenSections,
  hasSection,
  landingClamped,
  playDistance,
} from './sections';

export { requestJump, consumeJump, useScrollNav } from './nav';
export type { JumpAt, JumpOptions } from './nav';

export {
  setAutoplay,
  readAutoplay,
  readDestination,
  playTo,
  setStepDuration,
  readStepDuration,
  DEFAULT_STEP_MS,
  useAutoplay,
} from './autoplay';

export { smoothLerp, noSmoothing, defaultSmoother } from './smoothing';
export type { Smoother } from './smoothing';

export { BUDGET, SNAP, EASE, PERIOD, SPEED } from './presets';
export type { BudgetName, SnapName, EaseName, SpeedName } from './presets';

export * from './easing';
