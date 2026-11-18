"use client";

import { useRef, type CSSProperties } from "react";
import { SDiv, SNAP, Section } from "@/app/scrollkit";
import { CHI_SIAMO } from "@/app/content";
import FounderDialog, { type FounderDialogHandle } from "../FounderDialog";
import FounderPortrait from "../FounderPortrait";
import { T, TBlock } from "../T";
import { BEAT, PLAY, rise, riseHeavy, settleIn } from "./motion";

const FACES = CHI_SIAMO.items.length;
const LAST = BEAT * (2 + FACES - 1);
const SPAN = LAST + PLAY;

/* Faces to a row. Under the headline a landscape screen runs out of height
   long before it runs out of width, so it keeps them all in one row — a second
   row would halve the height each face gets and leave half the width bare —
   until there are too many to read, then splits them in two. A portrait one,
   a phone held upright, is the other way round: from the fourth face on it
   goes two rows deep, because four abreast on a phone are thumbnails and two
   by two are faces. Counted from the list, so a face can join or leave in
   content.ts and nothing here changes. */
const COLS_WIDE = FACES <= 8 ? FACES : Math.ceil(FACES / 2);
const COLS_TALL = FACES <= 3 ? FACES : Math.ceil(FACES / 2);

/* `--card` is the largest card for which `--cols` fit across the room and
   `--rows` fit down it, gaps included. The room is a size container, so cqw
   and cqh are its width and height — whatever the headline has left on this
   screen. A custom property holds the expression unresolved: the cq units in
   it are read where it is used, against the room, on the list and the cards
   alike.

   0.66 turns a row's height into a card's width. The card is the 3:4 portrait
   (4/3 of its width) plus the name under it (11% of the width at line-height
   0.9) and the gap above the name (5%): 1.48 times its width, so the width is
   the height over 1.48 — 0.675, less a hair of slack. Change the name's size
   and this changes with it. */
const ROOM = {
  "--cols-wide": COLS_WIDE,
  "--rows-wide": Math.ceil(FACES / COLS_WIDE),
  "--cols-tall": COLS_TALL,
  "--rows-tall": Math.ceil(FACES / COLS_TALL),
  "--card": `min(
    (100cqw - (var(--cols) - 1) * var(--gap)) / var(--cols) - 1px,
    (100cqh - (var(--rows) - 1) * var(--row-gap)) / var(--rows) * 0.66
  )`,
} as CSSProperties;

/* The list is exactly `--cols` cards wide, so it wraps where the count says
   rather than wherever the cards happen to fit: cards narrower than their
   share of the width would otherwise crowd more of them onto a line. The
   pixel of slack is the guard against rounding — a row adding up to a hair
   over the list's width would wrap its last face alone — and the card's own
   pixel off the across term keeps the list inside the room. */
const LIST = {
  width: "calc(var(--cols) * var(--card) + (var(--cols) - 1) * var(--gap) + 1px)",
} as CSSProperties;

const CARD = { width: "var(--card)" } as CSSProperties;

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
      {/* Exactly one screen tall, not at least one: the faces take whatever
          height the headline leaves, and that needs a height to take it from.
          The panel does not scroll inside itself — ScrollShell moves whole
          panels — so anything past the fold would be out of reach anyway. */}
      <div className="relative z-10 flex h-[100dvh] flex-col gap-[5svh] px-5 pb-12 pt-24 md:px-8">
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

          {/* The room takes the height the headline leaves (flex-1) and is a
              size container, so `--card` can measure against both its sides.
              The cards pack from the left margin, the headline's, at a fixed
              gap; when they come out narrower than the width allows, the slack
              collects on the right, and a short last row ends early rather
              than spreading out. The rows sit in the middle of the height. */}
          <div
            style={ROOM}
            className="flex flex-1 items-center [container-type:size] [--cols:var(--cols-wide)] [--gap:3vw] [--row-gap:3svh] [--rows:var(--rows-wide)] portrait:[--cols:var(--cols-tall)] portrait:[--rows:var(--rows-tall)] sm:[--gap:2vw]"
          >
            <ul style={LIST} className="flex flex-wrap gap-x-[var(--gap)] gap-y-[var(--row-gap)]">
              {CHI_SIAMO.items.map((f, i) => (
                <li key={f.id} style={CARD} className="shrink-0">
                  <SDiv start={BEAT * (2 + i)} budget={PLAY} anim={settleIn}>
                    {/* The card is a container too, so the name is sized against
                        the face it sits under, not against the screen: a phone
                        two by two and a row of six both get a name that fits. */}
                    <button
                      type="button"
                      aria-haspopup="dialog"
                      onClick={() => dialog.current?.open(f)}
                      className="group @container block w-full cursor-pointer text-left"
                    >
                      {/* The sizing lives on the card rather than on the
                          portrait, and that is not a preference: this box is
                          what `inset-x-0` measures the sheet below against, and
                          what clips it at rest. */}
                      <div className="relative aspect-[3/4] w-full overflow-hidden">
                        <FounderPortrait
                          person={f}
                          sizes="(orientation: portrait) 50vw, 25vw"
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
                      {/* The floor only bites below a card of about 100px —
                        seven or eight faces on a phone — and a card that
                        narrow is narrow because the width ran out, not the
                        height, so there is room under it for a name that
                        wraps. */}
                    <span className="t-condensed mt-[5cqw] block text-[max(11cqw,0.7rem)] text-bone transition-colors group-hover:text-flesh group-focus-visible:text-flesh">
                        {f.name}
                      </span>
                    </button>
                  </SDiv>
                </li>
              ))}
            </ul>
          </div>
        </Section>

        <FounderDialog ref={dialog} />
      </div>
    </Section>
  );
}
