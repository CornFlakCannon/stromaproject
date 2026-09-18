"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { createPortal } from "react-dom";
import { CHI_SIAMO, type Founder } from "@/app/content";
import FounderPortrait from "./FounderPortrait";
import { T } from "./T";
import { useMounted } from "./useMounted";

export type FounderDialogHandle = { open: (f: Founder) => void };

/**
 * A founder's card, opened from their face.
 *
 * A native <dialog>: the focus trap, Escape, the inert background and the top
 * layer — which sits above every z-index on the page, TopBar's included — all
 * come from the platform rather than from us.
 *
 * Portalled to <body> for the same reason TopBar is: ScrollShell binds wheel
 * and pointer to its own container, so a dialog rendered inside that container
 * would have its scrolling eaten by the page behind it.
 *
 * The open state lives HERE rather than in ChiSiamo, and that is the whole
 * reason this is a separate component with an imperative handle: SDiv re-applies
 * its p=0 pose on every render (scrollkit/widgets/SDiv.tsx), so a useState up in
 * ChiSiamo would snap all three cards back to their entry pose for a frame each
 * time one of them was opened.
 */
export default function FounderDialog({ ref }: { ref?: Ref<FounderDialogHandle> }) {
  const mounted = useMounted();
  const el = useRef<HTMLDialogElement>(null);
  const [who, setWho] = useState<Founder | null>(null);

  useImperativeHandle(ref, () => ({ open: setWho }), []);

  // Open only once the content is committed. showModal() straight from the
  // click handler would run before the re-render and flash an empty dialog.
  useEffect(() => {
    const d = el.current;
    if (d && who && !d.open) d.showModal();
  }, [who]);

  if (!mounted) return null;

  return createPortal(
    <dialog
      ref={el}
      aria-labelledby={who ? `founder-${who.id}` : undefined}
      onClose={() => setWho(null)}
      // A click on the backdrop lands on the dialog element itself; the panel
      // inside is what stops it from reaching here.
      onClick={(e) => {
        if (e.target === el.current) el.current?.close();
      }}
      /* m-auto is not decoration: Tailwind's preflight zeroes margin on *, which
         takes away the `margin: auto` a modal dialog is centred by. */
      className="m-auto max-h-[88svh] w-[min(92vw,56rem)] overflow-y-auto bg-carbon p-0 text-bone md:overflow-hidden"
    >
      {who && (
        /* One element, not a padded panel wrapping a grid: the picture runs to
           the panel's own edges, so the padding belongs to the text column and
           nowhere else.

           aspect-[2/1] is the rule, not a proportion someone liked. With the
           left column at 0.75 of 2fr — 0.375·W — a panel half as tall as it is
           wide makes that column 0.375W by 0.5W, which is 3:4 exactly, at every
           width. The photograph is therefore the same rectangle for all three
           founders and never has to be trimmed twice.

           grid-rows-[minmax(0,1fr)] is what holds it: an auto row would size
           itself to whichever column has more text, and the panel would grow
           per founder — the very thing this is meant to stop. */
        <div className="relative grid md:aspect-[2/1] md:grid-cols-[0.75fr_1.25fr] md:grid-rows-[minmax(0,1fr)]">
          {/* First in the DOM so it takes the initial focus a modal hands out.
              On a phone it now lands on the photograph rather than on carbon,
              where bone at 60% is unreadable — hence its own ground there. */}
          <button
            type="button"
            onClick={() => el.current?.close()}
            className="t-meta absolute right-5 top-5 z-10 cursor-pointer bg-carbon/80 px-3 py-1.5 text-bone/60 transition-colors hover:text-flesh md:right-8 md:top-8 md:bg-transparent md:px-0 md:py-0"
          >
            <T c={CHI_SIAMO.close} /> <span aria-hidden>&times;</span>
          </button>

          <FounderPortrait
            person={who}
            sizes="(max-width: 768px) 100vw, 21rem"
            /* On a phone a band across the top rather than a tall tile, so the
               bio still starts above the fold. */
            className="h-[34svh] w-full md:h-full"
          />

          {/* min-h-0 is the condition for overflow to work on a grid item at
              all; min-w-0 is the guard ChiSiamo already carries — an fr column
              floors at its min-content, and one long unbreakable name set in
              the display face would otherwise take width from the photograph. */}
          <div className="flex flex-col gap-[2svh] p-6 md:min-h-0 md:min-w-0 md:overflow-y-auto md:p-10">
            <div className="flex flex-col gap-[0.6svh]">
              {/* pr on md: the close button is pinned to the panel's corner, which
                  is exactly where this column's first line ends up. */}
              <h2 id={`founder-${who.id}`} className="t-cubital text-[8vw] md:pr-28 md:text-[3vw]">
                {who.name}
              </h2>
              <p className="t-meta text-viola">
                <T c={who.role} />
              </p>
            </div>

            <p className="t-voice text-[4.6vw] text-bone/85 md:text-[1.5vw]">
              <T c={who.bio} />
            </p>

            <div className="rule mt-[1svh] w-full" />

            <div className="flex flex-col gap-[1.2svh]">
              <p className="t-meta text-bone/55">
                <T c={CHI_SIAMO.percorso} />
              </p>
              <ul className="flex flex-col gap-[0.8svh]">
                {who.cv.map((line) => (
                  <li key={line.it} className="t-voice text-[4vw] text-bone/70 md:text-[1.25vw]">
                    <T c={line} />
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </dialog>,
    document.body,
  );
}
