'use client';

import { useEffect, useRef } from 'react';
import { useScrollStore } from './context';
import type { FrameListener } from './store';

/**
 * Run `listener` on every animation frame the core broadcasts, reading the live
 * scroll state. Do your work by mutating refs / DOM inside it — this hook never
 * causes a re-render.
 *
 * The latest `listener` is always used without re-subscribing, so an inline
 * closure that captures fresh props/state each render is fine.
 */
export function useScrollFrame(listener: FrameListener): void {
  const store = useScrollStore();
  const ref = useRef(listener);

  // Keep the latest listener without re-subscribing (synced after each render).
  useEffect(() => {
    ref.current = listener;
  });

  useEffect(() => {
    return store.onFrame((state) => ref.current(state));
  }, [store]);
}
