'use client';

import { useEffect, useRef } from "react";
import { useSequenceProgress, type SequenceSpec } from "../core";

type Props = SequenceSpec & {
  /** Number of frames in the sequence (output_001 … output_{frames}). */
  frames?: number;
  /** Builds the image src for frame n (1-based). Keep this reference stable. */
  frameSrc?: (n: number) => string;
};

const catFrame = (n: number) =>
  `/animations/cat/output_${String(n).padStart(3, "0")}.png`;

export default function ImageSequence({
  index,
  frames = 112,
  budget = 500,
  start,
  end,
  loop,
  frameSrc = catFrame,
}: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const lastFrame = useRef(0);

  // Preload the whole sequence once so scrubbing never shows a load flash.
  useEffect(() => {
    for (let n = 1; n <= frames; n++) {
      const img = new Image();
      img.src = frameSrc(n);
    }
  }, [frames, frameSrc]);

  // Scrub the sequence off this widget's normalized scroll progress (or a
  // repeating loop phase — see LoopSpec); swap src only when the frame changes.
  useSequenceProgress({ index, budget, start, end, loop }, (p) => {
    const frame = 1 + Math.round(p * (frames - 1)); // 1..frames
    const img = imgRef.current;
    if (!img || frame === lastFrame.current) return;
    img.src = frameSrc(frame);
    lastFrame.current = frame;
  });

  return (
    <div className="relative h-full w-full items-center justify-center overflow-hidden bg-transparent">
      <img
        ref={imgRef}
        src={frameSrc(1)}
        alt="animation"
        className="h-full w-full"
        style={{ objectFit: "fill" }}
      />
    </div>
  );
}
