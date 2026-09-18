"use client";

import { useRef } from "react";
import { SDiv, SNAP, Section } from "@/app/scrollkit";
import { MANIFESTO } from "@/app/content";
import ManifestoAside, { type ManifestoAsideHandle } from "../ManifestoAside";
import { T, TBlock } from "../T";
import { BEAT, PLAY, drawAcross, rise, riseHeavy } from "./motion";

const LAST = BEAT * 2;
const SPAN = LAST + PLAY;

/**
 * The call — a taste of it. The headline lands, the rule draws, one line says
 * what the word means, and the door to the manifesto proper opens.
 *
 * That door no longer leads anywhere: the text arrives SIDEWAYS, in a card that
 * takes the top layer while this panel steps out of frame to the left (the
 * .aside-host class, driven off html[data-aside] — see globals.css). The scroll
 * counter never moves, so closing the card puts the reader back exactly where
 * they stood.
 *
 * The card owns its own open state (ManifestoAside), and the handle is a ref
 * rather than state for a reason that is not style: SDiv re-applies its p=0 pose
 * on every render, so a useState here would snap this whole panel back to its
 * entry pose each time the manifesto was opened. Same reason, same shape, as
 * ChiSiamo and FounderDialog.
 */
export default function Manifesto({ index }: { index: number }) {
  const aside = useRef<ManifestoAsideHandle>(null);

  return (
    <Section index={index} snap end={SNAP.normal + SPAN}>
      <div className="aside-host relative z-10 flex min-h-[100svh] flex-col justify-center gap-[5svh] px-5 py-24 md:px-8">
        <Section start={SNAP.normal}>
          <SDiv budget={PLAY} anim={rise} className="t-meta text-bone/60">
            <T c={MANIFESTO.eyebrow} />
          </SDiv>

          <h2 className="t-cubital text-[12vw] md:text-[7.4vw]">
            <SDiv budget={PLAY} anim={riseHeavy}>
              <TBlock c={MANIFESTO.headline[0]} />
            </SDiv>
            <SDiv start={BEAT} budget={PLAY} anim={riseHeavy} className="text-viola">
              <button
                type="button"
                onClick={() => aside.current?.open()}
                className="hover:text-flesh cursor-pointer uppercase transition-colors"
              >
                <TBlock c={MANIFESTO.headline[1]} />
              </button>
            </SDiv>
          </h2>

          <SDiv
            start={BEAT}
            budget={PLAY}
            anim={drawAcross}
            anchor={{ x: "start" }}
            className="rule w-full"
          />

          {/* A div, not a <p>: SDiv renders a div, and a div inside a p is
              invalid HTML the browser would silently re-parent. */}
          <SDiv
            start={BEAT * 2}
            budget={PLAY}
            anim={rise}
            className="t-voice max-w-[24ch] text-[5.6vw] text-bone/85 md:max-w-[30ch] md:text-[2.6vw]"
          >
            <T c={MANIFESTO.teaser} />
            <span className="text-flesh"><T c={MANIFESTO.teaser_emphasis} /></span>
            <T c={MANIFESTO.teaser_rest}/>
          </SDiv>

          {/* The button goes inside the SDiv, never the reverse: the widget must
              own the element it animates. */}
          <SDiv start={LAST} budget={PLAY} anim={rise}>
            <button
              type="button"
              onClick={() => aside.current?.open()}
              className="t-meta inline-flex cursor-pointer items-center gap-2 text-bone/70 transition-colors hover:text-flesh focus-visible:text-flesh"
            >
              <T c={MANIFESTO.cta} />
              <span aria-hidden>&rarr;</span>
            </button>
          </SDiv>
        </Section>
      </div>

      {/* Portals to <body>, so it is not a second panel — it renders nothing here. */}
      <ManifestoAside ref={aside} />
    </Section>
  );
}
