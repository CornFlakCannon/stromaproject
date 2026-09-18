"use client";

import { SDiv, SNAP, Section } from "@/app/scrollkit";
import { GALLERIA } from "@/app/content";
import Slides from "../Slides";
import { T } from "../T";
import { PLAY, rise } from "./motion";

/**
 * The register, shown rather than argued: the collective at work, one
 * photograph at a time, while the panel holds still.
 *
 * These pictures used to sit under the Opere heading. Opere is the work now —
 * the disciplines and the projects inside them — so the photographs got a
 * panel of their own, and it is a gallery: you look, you don't read.
 *
 * It used to be a strip drifting on the clock. Now it is a player
 * (components/Slides): a stage, two arrows, a counter. The page moves in blocks
 * (one click, one panel — see page.tsx), so the photographs cannot ride the
 * wheel either; they wait for the arrows. The player runs edge to edge — the
 * header keeps the page's gutter, the track does not — and keeps its place in
 * the DOM rather than in React state, so leaving the panel and coming back
 * finds the same photograph — see the note in Slides.
 */
export default function Galleria({ index }: { index: number }) {
  // The section's scroll span is just the header: the moment it has landed is the
  // state this panel reads in, and the ceiling is where a jump lands.
  const SPAN = PLAY;

  return (
    <Section index={index} snap end={SNAP.normal + SPAN}>
      <div className="relative z-10 flex min-h-[100svh] flex-col justify-center gap-[4svh] overflow-hidden py-24">
        <Section start={SNAP.normal}>
          <SDiv
            budget={PLAY}
            anim={rise}
            className="flex flex-col gap-[0.6svh] px-5 md:flex-row md:items-baseline md:justify-between md:gap-6 md:px-8"
          >
            <h2 className="t-meta text-bone/60">
              <T c={GALLERIA.eyebrow} />
            </h2>
            <p className="t-meta text-bone/45">
              <T c={GALLERIA.note} />
            </p>
          </SDiv>

          <SDiv start={PLAY} budget={PLAY} anim={rise} className="mt-[4svh]">
            <Slides items={GALLERIA.items} label={GALLERIA.photo} />
          </SDiv>
        </Section>
      </div>
    </Section>
  );
}
