"use client";

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import Image from "next/image";
import { OPERE, type Plate } from "@/app/content";
import { Arrow, arrowButton } from "./Arrow";
import LeafLightbox from "./LeafLightbox";
import { T } from "./T";

/** How long a page turn takes. */
const TURN_MS = 620;
/** Finger travel (px) that counts as a swipe rather than a tap. */
const SWIPE_PX = 60;
/** How far the sheet swings away from the reader at the midpoint of a turn. */
const SWING_DEG = 22;

/**
 * A project's leaves, read one at a time: the sheets of a verbo-visual
 * sequence.
 *
 * The page turn is the one the manifesto's reader had before the manifesto
 * became a plate (git: 3ce8fd4, ManifestoAside): the sheet swings through
 * perspective and dips, and at the midpoint — when it is edge-on — the content
 * swaps. There the pages were CSS columns that had to be measured; here they
 * are discrete leaves, so there is nothing to measure and nothing to slide.
 *
 * `page` is React state, and that is allowed HERE where it is not on the
 * landing: a project page sits outside ScrollShell, so there is no SDiv around
 * to snap back to its p=0 pose on a render. Only the current leaf is mounted.
 *
 * Input is scoped to the reader, never to the window: the page scrolls on the
 * browser's own scroll, so a global key handler would steal the arrows from
 * it. Left/Right and Home/End turn pages while the focus is inside; a
 * horizontal swipe turns them on touch (the sheet keeps `pan-y`, so a vertical
 * drag still scrolls the page); the two arrows beside the sheet do the rest.
 * A click on the sheet itself opens that leaf full screen (LeafLightbox).
 */
export default function Leaves({ items }: { items: Plate[] }) {
  const [page, setPage] = useState(0);
  /** The leaf open full screen, if any — a click on the sheet puts it here. */
  const [open, setOpen] = useState<Plate | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const locked = useRef(false);
  const timers = useRef<number[]>([]);

  useEffect(
    () => () => timers.current.forEach((t) => window.clearTimeout(t)),
    [],
  );

  const last = items.length - 1;

  const goTo = (next: number) => {
    const to = Math.max(0, Math.min(next, last));
    if (to === page || locked.current) return;
    const dir = to > page ? 1 : -1;

    const sw = sheet.current;
    if (!sw || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setPage(to);
      return;
    }

    locked.current = true;
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
    timers.current.push(
      window.setTimeout(() => setPage(to), TURN_MS / 2),
      window.setTimeout(() => {
        locked.current = false;
      }, TURN_MS),
    );
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    let to: number | null = null;
    if (e.key === "ArrowRight") to = page + 1;
    else if (e.key === "ArrowLeft") to = page - 1;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = last;
    if (to === null) return;
    e.preventDefault();
    goTo(to);
  };

  const from = useRef<number | null>(null);
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;
    from.current = e.clientX;
  };
  const onUp = (e: PointerEvent) => {
    if (from.current === null) return;
    const travel = from.current - e.clientX;
    from.current = null;
    if (Math.abs(travel) >= SWIPE_PX) goTo(page + (travel > 0 ? 1 : -1));
  };

  const leaf = items[page];

  const arrow = `${arrowButton} absolute top-1/2 size-[12vw] -translate-y-1/2 md:size-[var(--arrow)]`;

  return (
    <>
      <div
        role="group"
        aria-labelledby="leaves-label"
        onKeyDown={onKey}
        className="w-full [--arrow:3.6vw] [--arrow-room:calc(var(--arrow)+2.4vw)]"
      >
        {/* Room for the arrows: on a wide screen they sit OUTSIDE the sheet,
            one on each side, so the sheet gives up their width plus a gutter;
            on a phone the sheet keeps the full width and the arrows ride on
            its edges instead. */}
        <div className="mx-auto w-[min(100%,calc(82svh*0.707))] md:w-[min(calc(100%_-_2*var(--arrow-room)),calc(82svh*0.707))]">
          {/* The sheet and its two arrows: the arrows are siblings of the swing,
            not children, so they stay put while the page turns. */}
          <div className="relative">
            {/* The only place perspective is declared — one viewport of depth, so
              the swing reads as a page and not as a wobble. */}
            <div className="[perspective:120vw]">
              <div
                ref={sheet}
                onPointerDown={onDown}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                className="[touch-action:pan-y] [will-change:transform]"
              >
                {/* A white sheet — white, not bone: the plates carry their own
                    white and a bone sheet showed as a frame around it — at the
                    page's own proportions. */}
                <figure
                  key={leaf.src}
                  className="w-full bg-white"
                  style={{ aspectRatio: `${leaf.width} / ${leaf.height}` }}
                >
                  {/* The sheet is a button: a click opens it full screen. A
                      swipe ends with a pointerup, not a click, so the two
                      gestures do not collide. */}
                  <button
                    type="button"
                    onClick={() => setOpen(leaf)}
                    className="block w-full cursor-zoom-in"
                  >
                    <Image
                      src={leaf.src}
                      width={leaf.width}
                      height={leaf.height}
                      /* The caption names it; an attribute cannot carry two languages. */
                      alt=""
                      className="h-auto w-full"
                    />
                    <span className="sr-only">
                      <T c={OPERE.open} />
                    </span>
                  </button>
                  <figcaption className="sr-only">
                    <T c={leaf.caption} />
                  </figcaption>
                </figure>
              </div>
            </div>

            <button
              type="button"
              onClick={() => goTo(page - 1)}
              aria-disabled={page === 0}
              className={`${arrow} left-[2vw] md:left-auto md:right-full md:mr-[2.4vw]`}
            >
              <Arrow dir={-1} />
              <span className="sr-only">
                <T c={OPERE.prev} />
              </span>
            </button>
            <button
              type="button"
              onClick={() => goTo(page + 1)}
              aria-disabled={page === last}
              className={`${arrow} right-[2vw] md:left-full md:right-auto md:ml-[2.4vw]`}
            >
              <span className="sr-only">
                <T c={OPERE.next} />
              </span>
              <Arrow dir={1} />
            </button>
          </div>
        </div>

        <div className="mt-[3svh] flex items-center justify-center gap-4">
          <div aria-hidden className="flex items-center gap-1.5">
            {items.map((l, i) => (
              <span
                key={l.src}
                data-on={i === page}
                className="size-1.5 rounded-full bg-bone/25 transition-colors data-[on=true]:bg-flesh"
              />
            ))}
          </div>
          <p
            id="leaves-label"
            aria-live="polite"
            className="t-meta text-bone/50"
          >
            <span className="sr-only">
              <T c={OPERE.leaf} />{" "}
            </span>
            {page + 1} / {items.length}
          </p>
        </div>
      </div>

      {/* Beside the reader, not inside it: a key pressed in the dialog must not
        bubble up to the reader's own handler and turn a page behind it. */}
      <LeafLightbox leaf={open} onClose={() => setOpen(null)} />
    </>
  );
}
