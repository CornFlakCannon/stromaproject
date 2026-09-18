'use client';

import { useEffect, useMemo, useRef } from "react";
import { useSequenceProgress, type SequenceSpec } from "../core";
import RawLayer from "./RawLayer";
import { compileAnim, compileRaw, sampleScalar, type AnimSpec, type Compiled, type Keyframe } from "./anim";

/** SVG path data for a rounded rectangle at (x,y), size (w,h), corner radius `r`
 *  clamped to half the smaller side — so `r` sweeps rectangle (0) → rounded →
 *  circle/ellipse. Used to build SMask's clip-path. */
function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const x2 = x + w;
  const y2 = y + h;
  if (rr === 0) return `M${x} ${y}H${x2}V${y2}H${x}Z`;
  return (
    `M${x + rr} ${y}` +
    `H${x2 - rr}A${rr} ${rr} 0 0 1 ${x2} ${y + rr}` +
    `V${y2 - rr}A${rr} ${rr} 0 0 1 ${x2 - rr} ${y2}` +
    `H${x + rr}A${rr} ${rr} 0 0 1 ${x} ${y2 - rr}` +
    `V${y + rr}A${rr} ${rr} 0 0 1 ${x + rr} ${y}Z`
  );
}

/**
 * Scroll-driven transparency hole. Drop `<SMask>` inside any element (typically an
 * SDiv) and it punches a moving rounded rectangle (or circle) of transparency
 * through that PARENT — the parent's own pixels (and any text in it) go see-through
 * where the hole is, revealing whatever sits behind. It renders nothing visible
 * itself; each frame it writes a `clip-path` onto its DOM parent, the way SDiv writes
 * `transform`/`opacity` onto its own div. So it "behaves like an SDiv": same
 * `SequenceSpec` scroll window, same `anim` keyframes, inherits the `<Section>`.
 *
 * It uses `clip-path`, NOT `mask-image`: clip-path describes the shape as plain
 * geometry and mints no per-frame image, whereas the old data-URI mask forced the
 * browser to create + parse a fresh mask image every frame — the perf bottleneck.
 * The trade-off is no blur (feather) and no rotation.
 *
 * Geometry comes from the same `anim` channels SDiv uses, read as a PIXEL RECTANGLE
 * in the parent's box (not SDiv's translate/scale semantics):
 *   x, y          hole top-left, px in the parent
 *   width, height hole size, px
 *   rounding      corner radius, px — 0 is a sharp rectangle; a large value clamps to
 *                 a circle/ellipse (half the smaller side), so animate it to morph
 * `invert` flips it: instead of a hole, the parent shows ONLY through the shape.
 *
 * `rawAnim` adds a SECOND, section-agnostic layer driven by the global scroll
 * position (like SDiv's — same `Keyframe[]`, `at` in absolute scroll units). Because
 * every SMask channel is px GEOMETRY (not a CSS transform), the two layers compose by
 * plain ADDITION on every channel — so author `rawAnim` from rest (0 deltas) and it
 * only nudges the hole once its window opens. (This is why SMask composes uniformly,
 * unlike SDiv, whose per-channel `compose` reflects transform semantics.)
 *
 * v1 owns the parent's clip outright — use one `<SMask>` per parent, as a direct
 * child of the element you want clipped.
 */
export default function SMask({
  index,
  budget,
  start,
  end,
  anim = [],
  rawAnim,
  invert = false,
}: SequenceSpec & {
  anim?: AnimSpec;
  rawAnim?: Keyframe[];
  invert?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const parent = useRef<HTMLElement | null>(null);
  const size = useRef({ w: 0, h: 0 });
  const lastSig = useRef(""); // last painted shape signature, to skip idle repaints
  // Each layer's most recent progress; `paint` reads both so either layer's tick
  // repaints from the current state of the section anim AND the raw anim.
  const pAnim = useRef(0);
  const pRaw = useRef(0);

  // Compile each layer's stops once per anim, not per frame (see compileAnim). The
  // raw layer also yields its absolute [start,end] window (see compileRaw).
  const compiledAnim = useMemo(() => compileAnim(anim), [anim]);
  const rawSpec = useMemo(() => (rawAnim ? compileRaw(rawAnim) : null), [rawAnim]);
  const compiledRaw = useMemo(() => (rawSpec ? compileAnim(rawSpec.spec) : null), [rawSpec]);

  // Additive two-layer sample of one geometry channel: section anim + raw layer.
  const sample = (ch: keyof Compiled) =>
    sampleScalar(compiledAnim, ch, pAnim.current) +
    (compiledRaw ? sampleScalar(compiledRaw, ch, pRaw.current) : 0);

  // Build the clip-path from both layers' current progress and write it to the
  // parent. For a hole (default) we clip the parent to "its whole box MINUS the
  // shape" via an even-odd path, so the shape reads as a see-through hole; `invert`
  // clips to just the shape, so the parent shows ONLY through it.
  const paint = () => {
    const el = parent.current;
    const { w: W, h: H } = size.current;
    if (!el || W === 0 || H === 0) return;

    const w = Math.max(0, sample("width"));
    const h = Math.max(0, sample("height"));
    const x = sample("x");
    const y = sample("y");
    const r = Math.max(0, sample("rounding"));

    // Skip when nothing changed since the last paint. The section (and raw) callback
    // fires every frame — even when idle — and clip-path is a paint op, so re-clipping
    // a stationary shape is wasted work. Once progress settles (snaps to a constant)
    // the signature stops changing, so a resting mask costs nothing.
    const sig = `${W}|${H}|${x}|${y}|${w}|${h}|${r}|${invert}`;
    if (sig === lastSig.current) return;
    lastSig.current = sig;

    const shape = roundedRectPath(x, y, w, h, r);
    const clip = invert
      ? `path("${shape}")`                              // show ONLY through the shape
      : `path(evenodd, "M0 0H${W}V${H}H0Z ${shape}")`;  // whole box minus the shape = hole
    el.style.setProperty("clip-path", clip);
    el.style.setProperty("-webkit-clip-path", clip);
  };

  // Keep the latest paint (it closes over the compiled layers / invert) reachable
  // from the []-deps effect below without resubscribing — same pattern as useScrollFrame.
  const paintRef = useRef(paint);
  useEffect(() => {
    paintRef.current = paint;
  });

  useEffect(() => {
    const el = ref.current?.parentElement ?? null;
    parent.current = el;
    if (!el) return;

    const measure = () => {
      // Border-box, so the clip coords line up with the element's own box.
      size.current = { w: el.offsetWidth, h: el.offsetHeight };
      paintRef.current(); // hold the p=0 shape until this widget's section is active
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);

    return () => {
      ro.disconnect();
      el.style.removeProperty("clip-path");
      el.style.removeProperty("-webkit-clip-path");
    };
  }, []);

  // Section layer: the ordinary section-gated window.
  useSequenceProgress({ index, budget, start, end }, (p) => {
    pAnim.current = p;
    paint();
  });

  return (
    <>
      <span ref={ref} style={{ display: "none" }} />
      {rawSpec && (
        <RawLayer
          start={rawSpec.start}
          end={rawSpec.end}
          onProgress={(p) => {
            pRaw.current = p;
            paint();
          }}
        />
      )}
    </>
  );
}
