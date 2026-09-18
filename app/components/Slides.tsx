"use client";

import { useId, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import Image from "next/image";
import { OPERE, type Copy, type Photo } from "@/app/content";
import { Arrow, arrowButton } from "./Arrow";
import { T } from "./T";

/** Finger travel (px) that counts as a swipe rather than a tap. */
const SWIPE_PX = 60;

/**
 * Photographs, one at a time: the landing's gallery and a project's backstage
 * share this player. Two arrows, a counter, and nothing else to read.
 *
 * **The current photo is written to the DOM, not to React state.** The gallery
 * sits inside ScrollShell, where every SDiv re-applies its p=0 pose on a
 * render — a useState here would flash the whole panel back to its entry pose
 * on every arrow press. So the index lives in a ref and `show` patches the
 * attributes by hand: `data-on` on the slides (read by `.slides` in
 * globals.css), `aria-disabled` on the arrows, the counter's text. React never
 * touches them again, because the JSX they were rendered from does not change.
 * The same move as Opere's `select`, scoped to one widget.
 *
 * The photos sit side by side on one track, every card as tall as the stage
 * and as wide as its own picture wants (`aspect-ratio` from the file's
 * pixels), so a portrait stands whole beside a landscape and nothing is
 * letterboxed. Only a phone crops, where a landscape would be wider than the
 * screen (`max-w` + `object-cover`). The track slides so the current card is
 * centred, and the neighbours show at the edges — the next one on the right,
 * the last one on the left — so a turn reads as a continuation rather than a
 * cut. The cards differ in width, so the offset is measured, not computed:
 * `place` reads the card's box and writes it to `--x` on the track; the
 * transition lives in `.slides-track`. Measured again on resize, and once at
 * mount without the transition, so the first photo does not slide into place
 * on load. Over the cards, the site's film grain (`.grain`), and no duotone:
 * these are the photographs themselves.
 *
 * Input is scoped to the player, never to the window, for the reasons
 * components/Leaves gives: Left/Right and Home/End turn photos while the focus
 * is inside, the arrows do the rest. A horizontal swipe turns them on touch
 * where the page's own scroll does not claim the finger first — on a project
 * page it does not; on the landing ScrollShell captures every pointer, so there
 * the arrows are the whole control.
 */
export default function Slides({ items, label }: { items: Photo[]; label: Copy }) {
  const root = useRef<HTMLDivElement>(null);
  const at = useRef(0);
  const labelId = useId();
  const last = items.length - 1;

  /** Centre card `i`: its middle, measured from the track's left edge. */
  const place = (i: number) => {
    const track = root.current?.querySelector<HTMLElement>(".slides-track");
    const card = track?.children[i] as HTMLElement | undefined;
    if (!track || !card) return;
    track.style.setProperty("--x", `${card.offsetLeft + card.offsetWidth / 2}px`);
  };

  useLayoutEffect(() => {
    const track = root.current?.querySelector<HTMLElement>(".slides-track");
    if (!track) return;
    // The page arrives painted from the server with the track at rest: set
    // the first offset with the transition off, or it would glide in on load.
    track.style.transition = "none";
    place(at.current);
    void track.offsetWidth; // flush, so the next frame's transition sees a settled start
    track.style.transition = "";
    const onResize = () => place(at.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const show = (next: number) => {
    const to = Math.max(0, Math.min(next, last));
    const el = root.current;
    if (to === at.current || !el) return;
    at.current = to;
    place(to);
    el.querySelectorAll<HTMLElement>("[data-slide]").forEach((s, i) => {
      s.dataset.on = String(i === to);
    });
    el.querySelectorAll<HTMLElement>("[data-dot]").forEach((d, i) => {
      d.dataset.on = String(i === to);
    });
    const [prev, nxt] = el.querySelectorAll<HTMLElement>("[data-arrow]");
    prev?.setAttribute("aria-disabled", String(to === 0));
    nxt?.setAttribute("aria-disabled", String(to === last));
    const n = el.querySelector<HTMLElement>("[data-count]");
    if (n) n.textContent = `${to + 1} / ${items.length}`;
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    let to: number | null = null;
    if (e.key === "ArrowRight") to = at.current + 1;
    else if (e.key === "ArrowLeft") to = at.current - 1;
    else if (e.key === "Home") to = 0;
    else if (e.key === "End") to = last;
    if (to === null) return;
    e.preventDefault();
    show(to);
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
    if (Math.abs(travel) >= SWIPE_PX) show(at.current + (travel > 0 ? 1 : -1));
  };

  const arrow = `${arrowButton} absolute top-1/2 z-10 size-[12vw] -translate-y-1/2 md:size-[3.6vw]`;

  return (
    <div
      ref={root}
      role="group"
      aria-labelledby={labelId}
      onKeyDown={onKey}
      className="slides w-full"
    >
      <div className="relative">
        {/* The window: as wide as the player, clipping the track. */}
        <div
          onPointerDown={onDown}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="relative w-full overflow-hidden [touch-action:pan-y]"
        >
          <div className="slides-track relative left-1/2 flex w-max gap-[3vw] md:gap-[1.6vw]">
            {items.map((ph, i) => (
              <figure
                key={ph.src}
                data-slide
                data-on={i === 0}
                style={{ aspectRatio: `${ph.width} / ${ph.height}` }}
                className="relative isolate h-[50svh] max-w-[84vw] shrink-0 overflow-hidden bg-ink md:h-[66svh] md:max-w-[60vw]"
              >
                <Image
                  src={ph.src}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 84vw, 60vw"
                  /* The first photo is what the panel opens on; the rest are on
                     the track, off screen, and load as they slide near. */
                  priority={i === 0}
                  className="object-cover"
                />
                <div aria-hidden className="grain" />
              </figure>
            ))}
          </div>
        </div>

        <button
          type="button"
          data-arrow
          onClick={() => show(at.current - 1)}
          aria-disabled={true}
          className={`${arrow} left-[2vw]`}
        >
          <Arrow dir={-1} />
          <span className="sr-only">
            <T c={OPERE.prev} />
          </span>
        </button>
        <button
          type="button"
          data-arrow
          onClick={() => show(at.current + 1)}
          aria-disabled={last === 0}
          className={`${arrow} right-[2vw]`}
        >
          <span className="sr-only">
            <T c={OPERE.next} />
          </span>
          <Arrow dir={1} />
        </button>
      </div>

      <div className="mt-[2.4svh] flex items-center justify-center gap-4">
        <div aria-hidden className="flex items-center gap-1.5">
          {items.map((ph, i) => (
            <span
              key={ph.src}
              data-dot
              data-on={i === 0}
              className="size-1.5 rounded-full bg-bone/25 transition-colors data-[on=true]:bg-flesh"
            />
          ))}
        </div>
        <p id={labelId} aria-live="polite" className="t-meta text-bone/50">
          <span className="sr-only">
            <T c={label} />{" "}
          </span>
          <span data-count>1 / {items.length}</span>
        </p>
      </div>
    </div>
  );
}
