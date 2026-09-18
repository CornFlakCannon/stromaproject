/**
 * Shared, render-free state for the scroll-driven animation system.
 *
 * The core (`ScrollShell`) owns exactly one store: it writes the live values on
 * every rAF tick and calls `notify()` once per frame. Child widgets subscribe
 * with `onFrame` (see `useScrollFrame`) and mutate their own DOM directly —
 * nothing in here ever triggers a React re-render.
 *
 * There is a single rAF loop (the core's). Widgets do NOT start their own; they
 * read the broadcast clock (`state.time`) and derive their local timeline from
 * it. That keeps every nested animation on the same, drift-free frame.
 */

/** The "gamestate" broadcast to every widget on each frame. */
export interface ScrollState {
  /** Index of the currently active section — the one whose widgets animate. */
  sectionIndex: number;
  /** Raw accumulated wheel delta consumed on this tick (the "scroller"). */
  accumulator: number;
  /** rAF timestamp of the current tick — the shared animation clock. */
  time: number;
  /** During a jump's glide (see `core/nav.ts`): the section indices currently
   *  OFF-screen and therefore safe to snap to their just-reset pose. The presence of
   *  this field marks a settling frame — widgets on a still-visible section hold their
   *  pose (so nothing visibly jumps) until it scrolls out and appears here. Undefined
   *  on ordinary frames. */
  settle?: readonly number[];
}

export type FrameListener = (state: Readonly<ScrollState>) => void;

export interface ScrollStore {
  /**
   * Live, read-only snapshot for imperative reads. It is mutated in place each
   * tick (via `notify`), so treat it as valid only at the moment you read it.
   */
  readonly state: Readonly<ScrollState>;
  /** Register a per-frame callback. Returns an unsubscribe function. */
  onFrame(listener: FrameListener): () => void;
  /**
   * Apply an optional field patch, then fan out to every frame listener. The
   * producer calls this once per rAF tick. The patch is applied *inside* the
   * store (not via `store.state.x =` in the component) because the React
   * compiler lint forbids mutating a value reached from `useState`/`useRef`.
   */
  notify(patch?: Partial<ScrollState>): void;
}

/** Create the store. The core builds one and hands it to `ScrollStateProvider`. */
export function createScrollStore(initial?: Partial<ScrollState>): ScrollStore {
  const state: ScrollState = {
    sectionIndex: 0,
    accumulator: 0,
    time: 0,
    ...initial,
  };

  const listeners = new Set<FrameListener>();

  return {
    state,
    onFrame(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    notify(patch) {
      if (patch) Object.assign(state, patch);
      for (const listener of listeners) listener(state);
    },
  };
}
