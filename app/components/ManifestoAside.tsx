"use client";

import { useImperativeHandle, useRef, type Ref } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { MANIFESTO_PAGE } from "@/app/content";
import { setAside } from "@/app/lib/aside";
import { T } from "./T";
import { useMounted } from "./useMounted";

export type ManifestoAsideHandle = { open: () => void };

/**
 * The manifesto, read beside the panel that calls it rather than at a route of
 * its own.
 *
 * A native <dialog>, portalled to <body>, for the same reasons FounderDialog is:
 * the focus trap, Escape, and the top layer come from the platform — and, the
 * part this feature actually turns on, a modal dialog's backdrop swallows wheel
 * and pointer before they reach ScrollShell's container. That is the whole
 * "the reader cannot scroll the landing until they close this" requirement,
 * with no input handling of our own and no change to the settled engine. It is
 * also why KeyboardNav stands down on its own: it already bails whenever a
 * `dialog[open]` exists.
 *
 * The open state lives HERE and not in the Manifesto panel, which is not a style
 * choice: SDiv re-applies its p=0 pose on every render, so a useState up there
 * would snap the whole panel back to its entry pose the instant the card opened.
 *
 * The manifesto is a typeset plate, not running text: one picture, shown whole.
 * There is nothing to page, so there is no input of ours in here at all.
 */
export default function ManifestoAside({ ref }: { ref?: Ref<ManifestoAsideHandle> }) {
  const mounted = useMounted();
  const dialog = useRef<HTMLDialogElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        const d = dialog.current;
        if (!d) return;
        // Idempotent on purpose. `showModal` is what puts the card in the top
        // layer, and an early return on an already-open dialog would leave a
        // NON-modal one on screen with `data-aside` never set — the card visible,
        // the panel not slid, and the panel's own z-10 box eating the click on
        // the ✕. Re-entering the modal state costs nothing and cannot desync.
        if (d.open) d.close();
        d.showModal();
        setAside(true);
      },
    }),
    [],
  );

  if (!mounted) return null;

  return createPortal(
    <dialog
      ref={dialog}
      data-aside
      aria-labelledby="manifesto-title"
      /* The one close path. It fires for the ✕, for Escape and for close() alike,
         so `html[data-aside]` cannot be left set with no card on screen — which
         would strand the panel behind it slid off to the left. */
      onClose={() => setAside(false)}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === dialog.current) dialog.current?.close();
      }}
      /* The viewport less ten per cent, but sitting low rather than centred: the
         top bar lives in the first few svh and a centred card crowds it. An
         explicit top margin with `mb-auto` does it — a modal dialog gets
         `inset: 0` from the UA, so the auto margin absorbs the remainder and the
         box lands exactly this far down. The horizontal autos are not decoration
         either: Tailwind's preflight zeroes the margin a dialog is centred by.

         And no `flex` class here, ever: `display` is owned by .aside-card in
         globals.css, because a Tailwind display utility on a <dialog> outranks
         the UA rule that hides it when closed — which left an invisible but
         fully clickable card sitting over half the page. */
      className="satin aside-card mx-auto mb-auto mt-[9svh] h-[85svh] w-[90vw] overflow-hidden p-0 text-bone"
    >
      <div aria-hidden className="grain" />

      {/* No heading: the plate carries its own. The card's accessible name is
          the caption below (aria-labelledby), so the dialog is still announced. */}
      <header className="flex shrink-0 justify-end px-6 pt-6 md:px-10 md:pt-8">
        <button
          type="button"
          onClick={() => dialog.current?.close()}
          className="t-meta shrink-0 cursor-pointer text-bone/60 transition-colors hover:text-flesh"
        >
          <T c={MANIFESTO_PAGE.close} /> <span aria-hidden>&times;</span>
        </button>
      </header>

      {/* The plate. `fill` + object-contain in a box that takes whatever the
          header leaves, so the whole picture is always on screen, centred,
          whatever shape the card is on this viewport. */}
      <figure className="min-h-0 flex-1 px-6 pb-6 pt-[2svh] md:px-10 md:pb-8">
        <div className="relative h-full w-full">
          <Image
            src={MANIFESTO_PAGE.image.src}
            /* The description is the caption below, not this attribute: an
                attribute cannot carry two languages, a caption can. */
            alt=""
            fill
            sizes="90vw"
            /* Eager, not lazy: the card is display:none until opened, so the
               native lazy load would never fire before the reader is already
               looking at an empty box. One SVG, its type already outlined, so
               it is ~40KB gzipped and next/image passes it through untouched. */
            loading="eager"
            className="object-contain"
          />
        </div>
        <figcaption id="manifesto-title" className="sr-only">
          <T c={MANIFESTO_PAGE.image.alt} />
        </figcaption>
      </figure>
    </dialog>,
    document.body,
  );
}
