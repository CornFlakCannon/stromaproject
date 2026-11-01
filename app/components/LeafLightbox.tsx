"use client";

import { useEffect, useId, useRef } from "react";
import Image from "next/image";
import { OPERE, type Plate } from "@/app/content";
import { T } from "./T";
import { useZoomPan } from "./useZoomPan";

/** The satin frame around the leaf, as a share of the viewport's height. */
const FRAME = "3svh";

/**
 * One leaf, to be looked at closely: a card the height of the screen, as wide
 * as the leaf needs at that height, on the satin ground. Click beside it and
 * it closes.
 *
 * A native <dialog>, for the same reasons FounderDialog is one: the focus trap,
 * Escape, the inert page behind and the top layer are the platform's. Not
 * portalled, because it does not need to be — a project page is outside
 * ScrollShell, so nothing here eats its wheel — and it is rendered next to the
 * reader, not inside it, so a key pressed in here never reaches the reader's
 * own handler.
 *
 * The zoom and the pan are useZoomPan's: a width inside a box that scrolls,
 * and every gesture on it ours — drag, two-finger pinch, click to toggle,
 * ctrl+wheel, +/-/0. `.zoom-dialog` (globals.css) takes the browser's own
 * pinch away from the whole page while it is open, so a pinch anywhere — on
 * the leaf, the frame or beside it — never zooms the page behind.
 *
 * `margin: auto` on the leaf inside a flex box is not decoration: it centres the
 * leaf while it fits, and — unlike place-items — resolves to zero once it
 * overflows, so the top-left corner stays reachable by scrolling.
 */
export default function LeafLightbox({
  leaf,
  onClose,
}: {
  leaf: Plate | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  /** More than one lightbox can sit on a page — one per plate in the prose,
   *  one for the reader — so the title's id cannot be a constant. */
  const titleId = useId();
  const { z, zoomed, box, body, reset, onKey, handlers } = useZoomPan([leaf]);

  // Open only once the content is committed — showModal() straight from the
  // click would run before the re-render and flash an empty dialog. Every
  // opening starts from the fit.
  useEffect(() => {
    const d = dialog.current;
    if (!d || !leaf) return;
    reset();
    if (!d.open) d.showModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaf]);

  const ratio = leaf ? leaf.width / leaf.height : 1;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={onKey}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself; the
        // frame inside is a child, so a click on it does not.
        if (e.target === dialog.current) dialog.current?.close();
      }}
      /* The height of the screen and no wider than the leaf needs: the UA caps
         a dialog just short of the viewport, so both caps go, and `m-auto`
         centres it — a modal dialog gets `inset: 0`, and Tailwind's preflight
         zeroes the margin it would be centred by. `w-fit`, not `w-auto`: with
         `inset: 0` an auto width stretches to both edges. No display utility
         here, ever: see .aside-card in globals.css. */
      className="satin m-auto h-[100dvh] max-h-none w-fit max-w-none overflow-hidden p-0 text-bone zoom-dialog"
    >
      {leaf && (
        /* The frame. The padding lives here and not on the dialog, so that a
           click on the satin around the leaf is a click inside the card. */
        <div className="relative h-full" style={{ padding: FRAME }}>
          <div
            ref={box}
            {...handlers}
            data-zoomed={zoomed}
            className="no-scrollbar flex h-full overflow-auto overscroll-contain cursor-zoom-in data-[zoomed=true]:cursor-zoom-out"
            /* The fit: as wide as the leaf is at the frame's height, or as
               wide as the screen allows, whichever is smaller. */
            style={{
              width: `min(calc(100vw - 2 * ${FRAME}), calc((100dvh - 2 * ${FRAME}) * ${ratio}))`,
            }}
          >
            <div
              ref={body}
              className="m-auto shrink-0"
              style={{ width: `${z * 100}%` }}
            >
              <figure className="w-full bg-white">
                <Image
                  src={leaf.src}
                  width={leaf.width}
                  height={leaf.height}
                  alt=""
                  /* Eager and first: this is the one thing on screen. */
                  priority
                  className="h-auto w-full"
                />
                <figcaption id={titleId} className="sr-only">
                  <T c={leaf.caption} />
                </figcaption>
              </figure>
            </div>
          </div>

          {/* The one control rides over the leaf, top right, on a carbon tab
              so it reads on white. */}
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="t-meta absolute right-4 top-4 cursor-pointer bg-carbon/80 px-3 py-2 text-bone/70 transition-colors hover:text-flesh focus-visible:text-flesh md:right-6 md:top-6"
          >
            <T c={OPERE.close} /> <span aria-hidden>&times;</span>
          </button>
        </div>
      )}
    </dialog>
  );
}
