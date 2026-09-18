"use client";

import { SDiv, SNAP, Section } from "@/app/scrollkit";
import { CONTACT, CONTATTO } from "@/app/content";
import { T, TBlock } from "../T";
import { BEAT, PLAY, drawAcross, rise, riseHeavy } from "./motion";

const SPAN = BEAT * 5 + PLAY;
const LANGS = ["it", "en"] as const;

/**
 * The ask, and the end of the organism's growth. One address, no form — there
 * is nothing here a person needs to fill in before speaking.
 */
export default function Contatto({ index }: { index: number }) {
  return (
    <Section index={index} snap end={SNAP.normal + SPAN}>
      <div className="relative z-10 flex min-h-[100dvh] flex-col justify-between px-5 pb-8 pt-24 md:px-8 md:pb-10">
        <Section start={SNAP.normal}>
          <div className="flex flex-1 flex-col justify-center gap-[4svh]">
            <SDiv budget={PLAY} anim={rise} className="t-meta text-viola">
              <T c={CONTATTO.eyebrow} />
            </SDiv>

            {/* 9.5vw, not more: "COSTRUIAMO" is one unbreakable word at 125% stretch,
                measured 8.9em wide, and a 320px phone leaves it 87.5vw between the
                gutters. */}
            <h2 className="t-cubital text-[9.5vw] md:text-[8vw]">
              <SDiv start={BEAT} budget={PLAY} anim={riseHeavy}>
                <TBlock c={CONTATTO.headline[0]} />
              </SDiv>
              <SDiv start={BEAT * 2} budget={PLAY} anim={riseHeavy}>
                <TBlock c={CONTATTO.headline[1]} />
              </SDiv>
            </h2>

            <SDiv
              start={BEAT * 3}
              budget={PLAY}
              anim={rise}
              className="t-voice text-[5.4vw] text-bone/75 md:text-[2.4vw]"
            >
              <T c={CONTATTO.lead} />
            </SDiv>

            <SDiv
              start={BEAT * 3}
              budget={PLAY}
              anim={drawAcross}
              anchor={{ x: "start" }}
              className="rule w-full"
            />

            <SDiv
              start={BEAT * 4}
              budget={PLAY}
              anim={rise}
              className="flex flex-col items-start gap-[2svh] md:flex-row md:items-baseline md:justify-between md:gap-8"
            >
              <span className="flex flex-col gap-[0.6svh]">
                <span className="t-meta text-bone/55">
                  <T c={CONTATTO.emailLabel} />
                </span>
                {/* One anchor per language so the mail subject arrives in the
                    reader's own — never an inline `display`, which would beat
                    the rule that hides the inactive one. */}
                {LANGS.map((l) => (
                  <a
                    key={l}
                    data-t={l}
                    lang={l}
                    href={`mailto:${CONTACT.email}?subject=${encodeURIComponent(CONTATTO.subject[l])}`}
                    className="t-condensed inline-block break-all text-[6.2vw] text-bone transition-colors hover:text-flesh md:text-[4vw]"
                  >
                    {CONTACT.email}
                  </a>
                ))}
              </span>

              {/* Instagram, off the page for now — back when the handle exists
                  (CONTACT.instagram in content.ts).
              <span className="flex flex-col gap-[0.6svh] md:items-end">
                <span className="t-meta text-bone/55">Instagram</span>
                <a
                  href={CONTACT.instagramUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="t-condensed text-[6vw] text-bone/70 transition-colors hover:text-flesh md:text-[2.4vw]"
                >
                  @{CONTACT.instagram}
                </a>
              </span>
              */}
            </SDiv>
          </div>

          <SDiv start={BEAT * 5} budget={PLAY} anim={rise} className="t-meta pt-[3svh] text-bone/45">
            <T c={CONTATTO.colophon} />
          </SDiv>
        </Section>
      </div>
    </Section>
  );
}
