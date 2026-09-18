'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ScrollStore } from './store';

const ScrollStoreContext = createContext<ScrollStore | null>(null);

/**
 * Makes the scroll store available to descendant widgets. The core creates the
 * store (so it alone writes to it) and passes it in here; widgets read it via
 * `useScrollFrame` / `useScrollStore`. The store object is stable, so this
 * provider never re-renders consumers — updates flow through `onFrame`, not
 * through the context value.
 */
export function ScrollStateProvider({
  store,
  children,
}: {
  store: ScrollStore;
  children: ReactNode;
}) {
  return (
    <ScrollStoreContext.Provider value={store}>
      {children}
    </ScrollStoreContext.Provider>
  );
}

/** Access the raw store. Prefer `useScrollFrame` for per-frame work. */
export function useScrollStore(): ScrollStore {
  const store = useContext(ScrollStoreContext);
  if (!store) {
    throw new Error('useScrollStore must be used within a <ScrollStateProvider>');
  }
  return store;
}

/**
 * What a `<Section>` hands to its descendants. A widget reads this to learn which
 * `index` it animates on and the cumulative scroll `offset` that shifts its window
 * into the section's local space. The default (no enclosing `<Section>`) is inert:
 * `index 0`, `offset 0`, so widgets behave exactly as they did pre-sections.
 */
export interface SectionCtx {
  /** Gating index a descendant animates on (only while `state.sectionIndex` matches). */
  index: number;
  /** Cumulative scroll offset: a descendant's local position is `pos - offset`. */
  offset: number;
  /** Nesting depth; 0 means "no enclosing Section" (the default value below). */
  depth: number;
}

const DEFAULT_SECTION: SectionCtx = { index: 0, offset: 0, depth: 0 };

/** Set by `<Section>` (see `./sections`); read by widgets via `useSection`. */
export const SectionContext = createContext<SectionCtx>(DEFAULT_SECTION);

/** The enclosing section's `{ index, offset, depth }` (defaults when unnested). */
export function useSection(): SectionCtx {
  return useContext(SectionContext);
}
