"use client";

import { useRef } from "react";
import { SDiv, SNAP, Section } from "@/app/scrollkit";
import { CHI_SIAMO } from "@/app/content";
import FounderDialog, { type FounderDialogHandle } from "../FounderDialog";
import FounderPortrait from "../FounderPortrait";
import { T, TBlock } from "../T";
import { BEAT, PLAY, rise, riseHeavy, settleIn } from "./motion";

const LAST = BEAT * (2 + CHI_SIAMO.items.length - 1);
const SPAN = LAST + PLAY;

/**
 * The faces. One card each, settling in one after another, each one a button:
 * the pointer gets the role, the click gets the whole card.
 *
 * The dialog is a sibling of the cards rather than their parent, and it owns its
 * own open state — see FounderDialog. Nothing here re-renders when a card opens,
 * which is exactly what the scroll widgets need.
 */
export default function ChiSiamo({ index }: { index: number }) {
  const dialog = useRef<FounderDialogHandle>(null);

  return (
    <Section index={index} snap end={SNAP.normal + SPAN}>
      <div className="relative z-10 flex min-h-[100svh] flex-col justify-center gap-[5svh] px-5 py-24 md:px-8">
        <Section start={SNAP.normal}>
          <SDiv budget={PLAY} anim={rise} className="t-meta text-bone/60">
            <T c={CHI_SIAMO.eyebrow} />
          </SDiv>

          <h2 className="t-cubital text-[10vw] md:text-[5.6vw]">
            <SDiv budget={PLAY} anim={riseHeavy}>
              <TBlock c={CHI_SIAMO.headline[0]} />
            </SDiv>
            <SDiv start={BEAT} budget={PLAY} anim={riseHeavy} className="text-viola">
              <TBlock c={CHI_SIAMO.headline[1]} />
            </SDiv>
          </h2>

          {/* One column per face at every width, never one column in all. The
              panel does not scroll inside itself — ScrollShell moves whole
              panels — so stacked portraits on a phone would put the last one
              somewhere unreachable. Counted from the list, so a face can leave
              or return in content.ts without a class changing here. */}
          <ul
            className="mt-[2svh] grid gap-[3vw] sm:gap-[2vw]"
            style={{ gridTemplateColumns: `repeat(${CHI_SIAMO.items.length}, minmax(0, 1fr))` }}
          >
            {CHI_SIAMO.items.map((f, i) => (
              /* min-w-0: a grid item defaults to min-width:auto, and a name
                 wider than its column would push the whole row off screen. */
              <li key={f.id} className="min-w-0">
                <SDiv start={BEAT * (2 + i)} budget={PLAY} anim={settleIn}>
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() => dialog.current?.open(f)}
                    className="group block w-full cursor-pointer text-left"
                  >
                    {/* Capped against the viewport's height rather than the
                        column's width: the name below it has to stay above the
                        fold, and the panel is exactly one screen tall.

                        The sizing lives HERE rather than on the portrait, and
                        that is not a preference: this box is what `inset-x-0`
                        measures the sheet below against, and what clips it at
                        rest. Left unsized it fills the grid column, and the
                        sheet came out over twice the width of the face. */}
                    <div className="relative aspect-[3/4] w-full overflow-hidden sm:h-[42svh] sm:w-auto">
                      <FounderPortrait
                        person={f}
                        sizes="(max-width: 640px) 90vw, 30vw"
                        className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03] group-focus-visible:scale-[1.03]"
                      />
                      {/* The role rides up from the bottom edge. Every hover
                          state here is doubled on focus-visible, or the card
                          would be mute to a keyboard — and on a touch screen,
                          where no hover exists, the tap opens the card outright
                          and this panel is simply never needed. */}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 translate-y-full bg-carbon/85 px-3 py-2 transition-transform duration-300 group-hover:translate-y-0 group-focus-visible:translate-y-0">
                        <span className="t-meta block text-flesh">
                          <T c={f.role} />
                        </span>
                        <span className="t-meta block text-bone/55">
                          <T c={CHI_SIAMO.hint} />
                        </span>
                      </div>
                    </div>

                    {/* The name never hides: a face without one is worse than a
                        face with one, pointer or no pointer. */}
                    <span className="t-condensed mt-[1.4svh] block text-[3.4vw] text-bone transition-colors group-hover:text-flesh group-focus-visible:text-flesh sm:text-[2.2vw]">
                      {f.name}
                    </span>
                  </button>
                </SDiv>
              </li>
            ))}
          </ul>
        </Section>

        <FounderDialog ref={dialog} />
      </div>
    </Section>
  );
}
