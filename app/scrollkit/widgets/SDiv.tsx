'use client';

import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useSequenceProgress, type SequenceSpec } from "../core";
import RawLayer from "./RawLayer";
import {
  compileAnim,
  compileRaw,
  composeStyle,
  styleAt,
  transformOrigin,
  type AnimSpec,
  type Anchor,
  type BoxBase,
  type Keyframe,
} from "./anim";

/**
 * Sequence Div — a scroll-driven wrapper for any non-animation content. Give it
 * a scroll window (`budget`, or a `start`/`end` pair — see {@link SequenceSpec})
 * and an `anim` spec: an array of keyframe poses the element passes through (see
 * {@link AnimSpec}). It maps this widget's scroll progress onto the wrapper;
 * channels compose via the independent scale/translate/rotate CSS properties
 * instead of clobbering.
 *
 * `anchor` sets which point stays fixed as width/height (and scale/rotate) apply
 * — e.g. `anchor={{ x: "start" }}` grows the width rightward from the left edge.
 *
 * `rawAnim` is a SECOND, independent layer that COEXISTS with `anim`: keyframes
 * whose `at` is an ABSOLUTE scroll value (same units as `budget`/`end`), driven by
 * the global scroll position and ungated by section — so it plays continuously
 * across the whole page regardless of which section is active. The two layers are
 * merged additively (see {@link composeStyle}): translate/rotate/blur add, scale/
 * opacity multiply; width/height/rounding/color are single-owner — the raw layer
 * takes them over only once its window opens, so the section anim keeps them until
 * then. Author `rawAnim` from rest (x:0, scale:1, …; and match single-owner channels
 * to where the anim leaves them) so it "kicks in later" on top of the section anim
 * without snapping or trampling it.
 */
export default function SDiv({
  index,
  budget,
  start,
  end,
  loop,
  anim = [],
  rawAnim,
  anchor,
  className,
  children,
}: SequenceSpec & {
  anim?: AnimSpec;
  rawAnim?: Keyframe[];
  anchor?: { x?: Anchor; y?: Anchor };
  className?: string;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Measured base box size (px). px width/height channels resolve to a scale
  // against this (see anim.ts `basis`); kept fresh by the ResizeObserver below.
  const box = useRef<BoxBase>({ width: 0, height: 0 });
  // Each layer's most recent progress. `pose` reads both so either layer's tick
  // repaints from the current state of both — the section anim and the raw anim.
  const pAnim = useRef(0);
  const pRaw = useRef(0);

  // Compile each layer's stops once per anim, not per frame (see compileAnim). The
  // raw layer also yields its absolute [start,end] window (see compileRaw).
  const compiledAnim = useMemo(() => compileAnim(anim), [anim]);
  const rawSpec = useMemo(() => (rawAnim ? compileRaw(rawAnim) : null), [rawAnim]);
  const compiledRaw = useMemo(() => (rawSpec ? compileAnim(rawSpec.spec) : null), [rawSpec]);

  // Write the element's style from BOTH layers' current progress, resolving px
  // width/height against the measured base box. With a raw layer the two are merged
  // additively; without one this is exactly the single-layer path (units honored).
  const pose = () => {
    const el = ref.current;
    if (!el) return;
    const style = compiledRaw
      ? composeStyle(compiledAnim, pAnim.current, compiledRaw, pRaw.current, box.current)
      : styleAt(compiledAnim, pAnim.current, box.current);
    Object.assign(el.style, style);
  };
  // Keep the latest `pose` reachable from the []-effect below without resubscribing.
  const poseRef = useRef(pose);
  useEffect(() => {
    poseRef.current = pose;
  });

  // Section layer: the ordinary section-gated window (or a repeating loop phase).
  useSequenceProgress({ index, budget, start, end, loop }, (p) => {
    pAnim.current = p;
    pose();
  });

  // Measure the base box size (layout size — unaffected by the scale transform) and
  // re-pose, so px width/height resolve correctly and follow content/font reflow.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      box.current = { width: el.offsetWidth, height: el.offsetHeight };
      poseRef.current();
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Initial pose (base unmeasured ⇒ px width/height hold natural size; the effect
  // above re-poses with the real base). At p=0 a from-rest raw layer is neutral, so
  // this is the anim's start pose. `transform-origin` is set here, untouched later.
  const initial = compiledRaw
    ? composeStyle(compiledAnim, 0, compiledRaw, 0)
    : styleAt(compiledAnim, 0);
  return (
    <div
      ref={ref}
      className={className}
      style={anchor ? { ...initial, transformOrigin: transformOrigin(anchor) } : initial}
    >
      {children}
      {rawSpec && (
        <RawLayer
          start={rawSpec.start}
          end={rawSpec.end}
          onProgress={(p) => {
            pRaw.current = p;
            pose();
          }}
        />
      )}
    </div>
  );
}
