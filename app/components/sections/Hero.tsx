"use client";

import { BUDGET, SDiv, Section, PERIOD } from "@/app/scrollkit";
import { HERO } from "@/app/content";
import { T } from "../T";
import { breathe, heroExit, heroExitSoft } from "./motion";

const SPAN = BUDGET.quick + BUDGET.instant; // 1100 — long enough to feel like a departure

/**
 * The thesis: the word itself, at the size the concept board set, bleeding off
 * the left edge. Nothing here enters on scroll — the hero has to exist before
 * a wheel is touched — so it arrives with a CSS load-in and *leaves* on scroll.
 */
export default function Hero({ index }: { index: number }) {
  return (
    // landing={0}: this panel plays on the way OUT, so the end of its span is an empty
    // screen. A jump back to it (Home, an arrow key) wants it whole — see `landing` in
    // scrollkit/core/sections.ts. Safe at 0 here: index 0, and no snap span to strand in.
    <Section index={index} end={SPAN} landing={0}>
      <div className="relative z-10 flex min-h-[100svh] flex-col justify-end gap-[4svh] px-5 pb-8 pt-20 md:justify-center md:gap-[6svh] md:px-8 md:pb-10 md:pt-24">
        {/* Bled a hair off the left margin, the way the concept board crops it. */}
        <SDiv budget={SPAN} anim={heroExit} className="-ml-[1.4vw] select-none">
          <h1 className="t-cubital text-[26vw] text-viola md:text-[16vw]">
            <span className="enter block">Stro</span>
            <span className="enter block" style={{ animationDelay: "140ms" }}>
              Ma
            </span>
          </h1>
        </SDiv>

        <SDiv budget={SPAN} anim={heroExitSoft}>
          <p
            className="enter t-voice max-w-[34ch] text-balance text-[3.9vw] text-bone/80 md:max-w-[46ch] md:text-[1.35vw]"
            style={{ animationDelay: "420ms" }}
          >
            <T c={HERO.seed} />
          </p>
        </SDiv>

        {/* The invitation, centred at the foot of the frame and set large
            enough to be the one thing asking for the wheel. */}
        <SDiv budget={SPAN} anim={heroExitSoft} className="flex justify-center">
          {/* The `.enter` load-in and the loop must not land on the same element:
              a running CSS animation outranks the inline style SDiv writes. */}
          <span className="enter" style={{ animationDelay: "900ms" }}>
            <SDiv
              loop={{ by: "auto", period: PERIOD.slow, mode: "pingpong" }}
              anim={breathe}
              className="t-condensed flex flex-col items-center text-[7vw] leading-none text-bone/85 md:text-[2.2vw]"
            >
              <T c={HERO.scroll} />
              <span aria-hidden className="mt-[0.2em] font-mono font-normal">↓</span>
            </SDiv>
          </span>
        </SDiv>
      </div>
    </Section>
  );
}
