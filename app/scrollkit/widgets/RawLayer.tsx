'use client';

import { useSequenceProgress } from "../core";

/**
 * The raw (global-scroll) progress driver shared by every widget that supports a
 * `rawAnim` layer (SDiv, SMask, …). It is a component, not an inline hook, so a
 * widget can mount it ONLY when it actually has a `rawAnim` — rules of hooks forbid
 * calling `useSequenceProgress` conditionally in the widget body. It renders
 * nothing; each frame it feeds the parent widget's compositor the raw layer's
 * progress `p ∈ [0,1]` over the absolute window `[start, end]`, ungated by section
 * (see `useSequenceProgress`'s `raw` mode).
 */
export default function RawLayer({
  start,
  end,
  onProgress,
}: {
  start: number;
  end: number;
  onProgress: (p: number) => void;
}) {
  useSequenceProgress({ start, end, raw: true }, (p) => onProgress(p));
  return null;
}
