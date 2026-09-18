"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { OPERE, type Testo } from "@/app/content";
import { Arrow, arrowButton } from "./Arrow";
import { T } from "./T";

/** How long a page turn takes, and how much wheel it takes to ask for one. */
const TURN_MS = 620;
const WHEEL_PER_TURN = 140;
/** Finger travel (px) that counts as a swipe rather than a tap. */
const SWIPE_PX = 60;
/** How far the sheet swings away from the reader at the midpoint of a turn. */
const SWING_DEG = 22;

/**
 * One text, to be read: a card the height of the screen on the satin ground,
 * as wide as a reading measure. Click beside it and it closes.
 *
 * The same native <dialog> as LeafLightbox, for the same reasons — the focus
 * trap, Escape, the inert page behind and the top layer are all the
 * platform's. Not portalled, and rendered next to the grid it is opened from
 * rather than inside it, exactly like the lightbox beside the reader.
 *
 * The text is not scrolled, it is PAGED — the reader the manifesto card had
 * before the manifesto became a plate (git: 1377eb2, ManifestoAside). The text
 * flows through CSS columns and spills sideways out of the box (.testo-flow in
 * globals.css); a turn slides that flow by exactly one box and swings the
 * sheet through perspective on the way. Nothing here knows how long a text is:
 * the page count is measured, so a poem that fits is one page with no pager
 * and a story is as many as it needs.
 *
 * `page` is a ref first and state second. The ref is what the wheel, the keys
 * and the resize handler read — they run outside React and need the value
 * that is true right now. The state exists only so the footer repaints. State
 * is allowed here, as in Leaves: a project page sits outside ScrollShell.
 */
export default function TestoDialog({
  testo,
  onClose,
}: {
  testo: Testo | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const swing = useRef<HTMLDivElement>(null);
  const flow = useRef<HTMLDivElement>(null);
  /** One dialog per grid, and a page can carry more than one grid. */
  const titleId = useId();

  const page = useRef(0);
  const pages = useRef(1);
  const [shown, setShown] = useState({ page: 0, pages: 1 });

  /** Width of one page in the flow's own coordinates: the box plus the gutter
   *  that follows it, since the next page's first column starts after it. */
  const step = useCallback(() => {
    const vp = viewport.current;
    const f = flow.current;
    // A closed dialog is display:none and measures zero. Guard on the box
    // itself rather than on the sum, which the gutter alone would keep positive.
    if (!vp || !f || vp.clientWidth === 0) return 0;
    const gap = parseFloat(getComputedStyle(f).columnGap);
    return vp.clientWidth + (Number.isFinite(gap) ? gap : 0);
  }, []);

  /** Re-count the pages and put the flow where the current page says, without
   *  a turn. Called on open, on resize, and once the webfonts have settled —
   *  each of those can change how much text fits in a column. */
  const measure = useCallback(() => {
    const f = flow.current;
    const s = step();
    if (!f || s <= 0) return;
    // scrollWidth spans the columns that overflow the box, which is the whole
    // point of column-fill: auto — the flow is as wide as the text needs.
    pages.current = Math.max(1, Math.ceil(f.scrollWidth / s));
    page.current = Math.min(page.current, pages.current - 1);
    f.style.transform = `translateX(${-page.current * s}px)`;
    setShown({ page: page.current, pages: pages.current });
  }, [step]);

  // Open only once the content is committed — showModal() straight from the
  // click would run before the re-render and flash an empty dialog. Every
  // opening starts at the first page, measured now that the box has layout.
  useEffect(() => {
    const d = dialog.current;
    if (!d || !testo) return;
    if (!d.open) d.showModal();
    page.current = 0;
    measure();
  }, [testo, measure]);

  /** Turn to `next`, if it exists. Returns whether anything moved, so a wheel
   *  at the last page does not lock the reader out for the length of a turn. */
  const goTo = useCallback(
    (next: number): boolean => {
      const f = flow.current;
      const sw = swing.current;
      const s = step();
      if (!f || !sw || s <= 0) return false;
      const to = Math.max(0, Math.min(next, pages.current - 1));
      if (to === page.current) return false;

      const dir = to > page.current ? 1 : -1;
      const from = -page.current * s;
      page.current = to;
      setShown({ page: to, pages: pages.current });

      // The resting transform is written directly, so it survives the
      // animation finishing and any React repaint of the footer.
      f.style.transform = `translateX(${-to * s}px)`;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;

      // Two elements, one gesture: the flow slides, and its PARENT does the
      // rotation. Keeping the rotated box at the centre of the reader is what
      // keeps the perspective honest — rotating the flow itself, pages out and
      // translated far past the perspective origin, keystones into a smear.
      f.animate(
        [{ transform: `translateX(${from}px)` }, { transform: `translateX(${-to * s}px)` }],
        { duration: TURN_MS, easing: "cubic-bezier(0.16, 1, 0.3, 1)" },
      );
      sw.animate(
        [
          { transform: "rotateY(0deg) scale(1)", opacity: 1 },
          {
            transform: `rotateY(${dir * -SWING_DEG}deg) scale(0.93)`,
            opacity: 0.45,
            offset: 0.5,
          },
          { transform: "rotateY(0deg) scale(1)", opacity: 1 },
        ],
        { duration: TURN_MS, easing: "ease-in-out" },
      );
      return true;
    },
    [step],
  );

  // Input. Bound imperatively rather than through React's props for the
  // wheel's sake: a synthetic onWheel is passive, and a passive listener cannot
  // preventDefault the rubber-band behind the card. Re-bound per text: the
  // reader only exists while one is open.
  useEffect(() => {
    const d = dialog.current;
    if (!d || !testo) return;

    let wheel = 0;
    let locked = false;
    const turn = (dir: number) => {
      if (locked) return;
      if (!goTo(page.current + dir)) return;
      locked = true;
      window.setTimeout(() => {
        locked = false;
      }, TURN_MS);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (locked) return;
      wheel += e.deltaY;
      if (Math.abs(wheel) < WHEEL_PER_TURN) return;
      const dir = wheel > 0 ? 1 : -1;
      wheel = 0;
      turn(dir);
    };

    // Touch turns pages by swiping ACROSS them — the pages are side by side,
    // and a horizontal drag is the gesture that shape asks for.
    let from: number | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return;
      from = e.clientX;
    };
    const onUp = (e: PointerEvent) => {
      if (from === null) return;
      const travel = from - e.clientX;
      from = null;
      if (Math.abs(travel) >= SWIPE_PX) turn(travel > 0 ? 1 : -1);
    };

    // Without these the card is a trap for a keyboard reader: the overflowing
    // columns are clipped and there is no scrollbar to reach them with.
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      let dir: number | null = null;
      if (e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") dir = 1;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") dir = -1;
      else if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        goTo(e.key === "Home" ? 0 : pages.current - 1);
        return;
      }
      if (dir === null) return;
      e.preventDefault();
      turn(dir);
    };

    d.addEventListener("wheel", onWheel, { passive: false });
    d.addEventListener("pointerdown", onDown);
    d.addEventListener("pointerup", onUp);
    d.addEventListener("pointercancel", onUp);
    d.addEventListener("keydown", onKey);

    // A narrower box holds fewer words, so the page count is not a constant —
    // and neither is it settled until the webfonts have replaced the fallback.
    const ro = new ResizeObserver(() => measure());
    if (viewport.current) ro.observe(viewport.current);
    let live = true;
    document.fonts?.ready.then(() => {
      if (live && dialog.current?.open) measure();
    });

    return () => {
      live = false;
      ro.disconnect();
      d.removeEventListener("wheel", onWheel);
      d.removeEventListener("pointerdown", onDown);
      d.removeEventListener("pointerup", onUp);
      d.removeEventListener("pointercancel", onUp);
      d.removeEventListener("keydown", onKey);
    };
  }, [testo, goTo, measure]);

  const pager = `${arrowButton} size-[10vw] shrink-0 md:size-[3vw]`;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself.
        if (e.target === dialog.current) dialog.current?.close();
      }}
      /* The height of the screen, the width of a reading measure — two columns
         of it on a wide screen. Both UA caps go and `m-auto` centres it, as in
         LeafLightbox. No display utility here, ever: `display` is owned by
         .testo-card in globals.css — see .aside-card for why. */
      className="satin testo-card m-auto h-[100svh] max-h-none w-screen max-w-none overflow-hidden p-0 text-bone md:w-[72vw]"
    >
      {testo && (
        <>
          <div aria-hidden className="grain" />

          <header className="flex shrink-0 items-start justify-between gap-6 px-5 pb-[2svh] pt-5 md:px-[3vw] md:pt-[3svh]">
            <h2
              id={titleId}
              className="t-condensed text-[9vw] leading-[0.9] text-bone md:text-[3.2vw]"
            >
              <T c={testo.title} />
            </h2>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="t-meta shrink-0 cursor-pointer pt-[0.4em] text-bone/60 transition-colors hover:text-flesh focus-visible:text-flesh"
            >
              <T c={OPERE.close} /> <span aria-hidden>&times;</span>
            </button>
          </header>

          <div className="rule mx-5 w-auto shrink-0 md:mx-[3vw]" />

          {/* The inset lives on this wrapper, NOT on the clipping box below it:
              overflow clips at the padding box, so a box with its own side
              padding would show a sliver of the next page through it — and
              clientWidth would count that padding into the page step. */}
          <div className="min-h-0 flex-1 px-5 md:px-[3vw]">
            <div ref={viewport} className="testo-reader relative h-full py-[3svh]">
              <div ref={swing} className="h-full [will-change:transform]">
                {/* The type role sits on the flow so that a column measures the
                    serif actually being read — see the prose on the project page. */}
                <div
                  ref={flow}
                  className="testo-flow t-voice h-full whitespace-pre-line text-[4.8vw] text-bone/80 [will-change:transform] md:text-[1.45vw]"
                >
                  {testo.text.map((block, i) => (
                    <p key={i} lang="it" className="mb-[2svh]">
                      {block}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* The pager. Hidden whole when the text fits on one page: a poem
              needs no arrows. */}
          <footer
            data-paged={shown.pages > 1}
            className="flex shrink-0 items-center justify-center gap-5 px-5 pb-5 pt-[1svh] data-[paged=false]:invisible md:gap-[2vw] md:px-[3vw] md:pb-[3svh]"
          >
            <button
              type="button"
              onClick={() => goTo(shown.page - 1)}
              aria-disabled={shown.page === 0}
              className={pager}
            >
              <Arrow dir={-1} />
              <span className="sr-only">
                <T c={OPERE.prev} />
              </span>
            </button>
            <p aria-live="polite" className="t-meta text-bone/50">
              <span className="sr-only">
                <T c={OPERE.page} />{" "}
              </span>
              {shown.page + 1} / {shown.pages}
            </p>
            <button
              type="button"
              onClick={() => goTo(shown.page + 1)}
              aria-disabled={shown.page === shown.pages - 1}
              className={pager}
            >
              <span className="sr-only">
                <T c={OPERE.next} />
              </span>
              <Arrow dir={1} />
            </button>
          </footer>
        </>
      )}
    </dialog>
  );
}
