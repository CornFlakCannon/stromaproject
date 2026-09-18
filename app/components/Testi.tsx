"use client";

import { useState } from "react";
import { OPERE, type Testo } from "@/app/content";
import TestoDialog from "./TestoDialog";
import { T } from "./T";

/** The gap between one card's arrival and the next's, as on the Opere panel. */
const CARD_STAGGER = 70;

/**
 * Texts laid out as a grid of cards — a title and the first lines under it —
 * that open one at a time, full screen, in TestoDialog. The lines on the card
 * are a glimpse, not the text: they are cut after three and hidden from
 * assistive tech, so the button's name is the title and "Leggi", nothing more.
 *
 * A client component for the click and the dialog it opens, nothing else; the
 * page that lays it out stays a server component. The dialog is a sibling of
 * the list, not a child of the card, the same way the lightbox sits beside the
 * reader — so nothing pressed in there reaches the button that opened it.
 */
export default function Testi({ items }: { items: Testo[] }) {
  const [open, setOpen] = useState<Testo | null>(null);
  return (
    <>
      <ul className="grid grid-cols-1 gap-[3vw] sm:grid-cols-2 md:grid-cols-3 md:gap-[2vw]">
        {items.map((testo, i) => (
          <li
            key={testo.title.it}
            className="enter-card"
            style={{ animationDelay: `${i * CARD_STAGGER}ms` }}
          >
            <button
              type="button"
              onClick={() => setOpen(testo)}
              className="group flex h-full w-full cursor-pointer flex-col items-start gap-[1.6svh] border border-bone/15 px-[4vw] py-[3svh] text-left transition-colors hover:border-bone/40 focus-visible:border-flesh md:px-[1.4vw] md:py-[2.4svh]"
            >
              <h3 className="t-condensed text-[7vw] leading-[0.9] text-bone transition-colors group-hover:text-flesh md:text-[2vw]">
                <T c={testo.title} />
              </h3>
              <p
                aria-hidden
                className="t-voice line-clamp-3 whitespace-pre-line text-[4.4vw] text-bone/55 md:text-[1.15vw]"
              >
                {testo.text[0]}
              </p>
              <span className="t-meta mt-auto pt-[1svh] text-bone/50 transition-colors group-hover:text-flesh">
                <T c={OPERE.read} /> <span aria-hidden>&rarr;</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <TestoDialog testo={open} onClose={() => setOpen(null)} />
    </>
  );
}
