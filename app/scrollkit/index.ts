/**
 * scrollkit — the public import surface. **Site code imports from here and only
 * here**, never from a deep path:
 *
 * ```tsx
 * import { ScrollShell, Section, SDiv, BUDGET, EASE } from "@/app/scrollkit";
 * ```
 *
 * One import path means the folder can move, or land under a different alias in the
 * next project, without touching a single call site. New to this kit? Read, in
 * order: `README.md` → `docs/ENGINE.md` → `docs/AUTHORING.md` → `docs/INVARIANTS.md`
 * → `docs/COOKBOOK.md`.
 */

// ── Core ────────────────────────────────────────────────────────────────────
// The scroll engine: the shell that owns the loop, the section registry, the
// per-frame hooks, the smoothing/easing laws, and the named magnitudes.
export { default as ScrollShell } from './core/ScrollShell';
export * from './core';

// ── Widgets ─────────────────────────────────────────────────────────────────
// What you actually compose a page out of. Every one takes `SequenceSpec`
// (`index`/`budget`/`start`/`end`/`loop`) plus its own props — see docs/AUTHORING.md.

/** Scroll-driven wrapper for any content: keyframed transforms, colors, effects. */
export { default as SDiv } from './widgets/SDiv';
/** Scroll-driven hole punched through the DOM parent — wipes, reveals, morphs. */
export { default as SMask } from './widgets/SMask';
/** Frame-by-frame image sequence scrubbed by scroll (or by a loop). */
export { default as ImageSequence } from './widgets/ImageSequence';
/** A jump CTA: click to scroll to a section. Reference use of `useScrollNav`. */
export { default as SectionNav } from './widgets/SectionNav';
/** Dev-only overlay: fps, per-section scroll, global scroll, jump buttons. */
export { default as DevHud } from './widgets/DevHud';
/** The raw (global-scroll) progress driver. Exported for widgets you write
 *  yourself that want a `rawAnim` layer; SDiv/SMask already mount it internally. */
export { default as RawLayer } from './widgets/RawLayer';

// ── Animation authoring ─────────────────────────────────────────────────────
// The keyframe vocabulary. `AnimSpec`/`Keyframe` are what `anim` and `rawAnim`
// accept; the rest is for building your own scroll-driven widget.
export type { AnimSpec, Keyframe, Anchor, Compiled, BoxBase } from './widgets/anim';
export {
  compileAnim,
  compileRaw,
  styleAt,
  composeStyle,
  sampleScalar,
  transformOrigin,
} from './widgets/anim';
