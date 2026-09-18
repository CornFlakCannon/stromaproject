"use client";

import { useCallback, useEffect, useRef } from "react";
import { SDiv, SNAP, Section, useScrollNav } from "@/app/scrollkit";
import { OPERE } from "@/app/content";
import { readOpereHash, writeOpereHash } from "@/app/lib/opereHash";
import Back from "../Back";
import ProjectCard from "../ProjectCard";
import { T } from "../T";
import { BEAT, PLAY, fromLeft, rise } from "./motion";

const FIRST = BEAT * 2;
const SPAN = FIRST + BEAT * (OPERE.categories.length - 1) + PLAY;

/* The choreography of opening a discipline, in ms. The words that were not
   chosen leave first, one after another; only then does the layout swap, so the
   chosen word can fly from exactly where it stood to where the heading sits. */
const OUT_MS = 240;
const OUT_STAGGER = 45;
const RISE_MS = 620;
const BACK_MS = 340;
/** The grid follows the heading rather than racing it. */
const GRID_DELAY = 200;
const CARD_STAGGER = 70;
const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * The work, by discipline. Two words on a wall of violet — large, since two
 * have the panel to themselves; clicking one drops the other, promotes it to
 * the heading, and opens its grid underneath.
 *
 * **The selection is written to the DOM, not to React state**, and that is not
 * a flourish. This panel is built out of SDivs, and every one of them re-applies
 * its p=0 pose on render — a useState here would flash all four words back to
 * their entry pose the instant one was clicked. The site already solves this
 * twice: html[data-lang] swaps the language and html[data-aside] slides the
 * manifesto panel, both through an attribute and a CSS rule, neither through a
 * render. This is the same move, scoped to one panel.
 *
 * It also scales on its own: the rules key off `data-for`, so adding a
 * discipline in content.ts needs no CSS and no code here.
 *
 * The choice is also mirrored into the URL (`/#opere/<categoria>`, see
 * lib/opereHash.ts), and read back once on mount: a project page links here,
 * and so does the browser's Back button, and both have to land on the grid
 * the reader left rather than on the hero three panels up.
 */
export default function Opere({ index }: { index: number }) {
  const panel = useRef<HTMLDivElement>(null);
  const { jumpTo } = useScrollNav();

  /** The pending hand-off, so a second click (or Escape) mid-flight cannot land
   *  the layout twice. */
  const timer = useRef<number | null>(null);

  const select = useCallback((slug: string | null, from?: Element | null) => {
    const root = panel.current;
    if (!root) return;

    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }

    // The URL follows the choice, not the animation: written now, so a reader
    // who leaves for a project mid-flight still comes back to the right grid.
    writeOpereHash(slug);

    /** The swap itself: one attribute on the panel, one per discipline. */
    const apply = () => {
      if (slug) root.dataset.cat = slug;
      else delete root.dataset.cat;
      for (const el of root.querySelectorAll<HTMLElement>("[data-for]")) {
        el.dataset.shown = String(el.dataset.for === slug);
      }
    };

    const words = [...root.querySelectorAll<HTMLElement>(".opere-cats [data-word]")];
    // Whatever the outgoing words are still doing, stop it: their exit holds its
    // end pose (fill: forwards) so it cannot flash back for a frame, which means
    // it has to be released by hand before they are shown again.
    for (const w of words) for (const a of w.getAnimations()) a.cancel();

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!slug) {
      apply();
      // The four words come back the way they left, in order.
      //
      // `fill: "backwards"` is the whole trick, and leaving it out is what made
      // this flicker: without it a staggered word shows its RESTING style for the
      // length of its own delay, so the list appeared whole, blinked out one word
      // at a time as each animation reached its active phase, and only then faded
      // in. Backwards holds the from-pose across the delay — and releases itself
      // when the animation ends, so nothing has to be cancelled afterwards.
      if (!still) {
        words.forEach((w, i) =>
          w.animate(
            [{ opacity: 0, transform: "translate3d(-1vw, -0.3em, 0)" }, { opacity: 1, transform: "none" }],
            { duration: BACK_MS, delay: i * OUT_STAGGER, easing: EASE_OUT, fill: "backwards" },
          ),
        );
      }
      return;
    }

    if (!from || still) {
      apply();
      return;
    }

    // FLIP, first half: where the chosen word stands right now, measured before
    // anything moves.
    const first = from.getBoundingClientRect();

    const leaving = words.filter((w) => w !== from);
    leaving.forEach((w, i) =>
      w.animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translate3d(-1.5vw, -0.5em, 0)" },
        ],
        // `forwards` on the way out (hold the gone pose until the layout swaps),
        // `backwards` on the way back in — see the comment above.
        { duration: OUT_MS, delay: i * OUT_STAGGER, easing: "ease-in", fill: "forwards" },
      ),
    );

    timer.current = window.setTimeout(() => {
      timer.current = null;
      apply();

      // FLIP, second half: the heading is now in the layout, so the difference
      // between the two rectangles is exactly the distance the word has to
      // travel. Animating the invert away reads as one word rising into place
      // rather than one vanishing and another appearing.
      const title = root.querySelector<HTMLElement>(`[data-for="${slug}"] [data-word]`);
      if (!title) return;
      const last = title.getBoundingClientRect();
      if (last.height === 0) return;
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      const scale = first.height / last.height;
      title.animate(
        [
          { transform: `translate3d(${dx}px, ${dy}px, 0) scale(${scale})` },
          { transform: "none" },
        ],
        { duration: RISE_MS, easing: EASE_OUT },
      );
    }, OUT_MS + OUT_STAGGER * Math.max(0, leaving.length - 1));
  }, []);

  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  // Escape backs out of a discipline, the same as the arrow — but only when the
  // manifesto card is not the thing on screen, since a modal dialog's Escape is
  // its own and closing two things with one key would be a surprise.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector("dialog[open]")) return;
      if (!panel.current?.dataset.cat) return;
      select(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [select]);

  // Arriving by URL. Read once, on mount: the sections have registered by now
  // (their effects run first) and the jump is consumed on the next frame anyway.
  // Instant, not glided: a reader coming back from a project page never left this
  // grid, and three panels flying past would say they had. `select` without a
  // `from` swaps the layout instantly — nothing to fly from — and an unknown slug
  // just lands on the four words.
  useEffect(() => {
    const h = readOpereHash();
    if (!h) return;
    jumpTo(index, "auto", { instant: true });
    if (h.cat && OPERE.categories.some((c) => c.slug === h.cat)) select(h.cat);
    // Mount only: a later hash change is our own replaceState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Section index={index} snap end={SNAP.normal + SPAN}>
      {/* No bg-viola: the background canvas paints this panel's flood itself,
          and redraws the organism inside it in carbon. A CSS background would be
          opaque and the descent would vanish for a whole bifurcation. */}
      <div
        ref={panel}
        data-organ-invert
        className="opere relative z-10 flex min-h-[100svh] flex-col justify-center gap-[3svh] overflow-hidden px-5 py-24 text-carbon md:px-8"
      >
        <Section start={SNAP.normal}>
          <SDiv budget={PLAY} anim={rise} className="flex items-center gap-6">
            <h2 className="t-meta text-carbon/70">
              <T c={OPERE.eyebrow} />
            </h2>

            {/* The way back. Hidden by CSS until a discipline is open, so it
                never announces itself before there is anything to leave. */}
            <Back onClick={() => select(null)} label={OPERE.back} className="opere-back text-carbon" />
          </SDiv>

          {/* The four words. One list, hidden whole once a discipline is chosen. */}
          <ul className="opere-cats flex flex-col gap-[1.2svh]">
            {OPERE.categories.map((c, i) => (
              <li key={c.slug} className="t-condensed text-[15vw] md:text-[8vw]">
                <SDiv start={FIRST + BEAT * i} budget={PLAY} anim={fromLeft}>
                  <button
                    type="button"
                    onClick={(e) => select(c.slug, e.currentTarget.querySelector("[data-word]"))}
                    className="cursor-pointer text-left transition-colors duration-200 hover:text-flesh focus-visible:text-flesh"
                  >
                    <span aria-hidden className="mr-[0.4em] align-middle font-mono text-[0.28em] opacity-60">
                      &middot;
                    </span>
                    {/* The word is measured, not the button: the bullet sits in
                        the button's box and would offset the flight by its width.
                        The heading wraps its own copy the same way, so the two
                        rectangles describe the same glyphs. */}
                    <span data-word className="inline-block">
                      <T c={c.name} />
                    </span>
                  </button>
                </SDiv>
              </li>
            ))}
          </ul>

          <SDiv start={FIRST} budget={PLAY} anim={rise} className="opere-cats t-meta text-carbon/55">
            <span data-word className="inline-block">
              <T c={OPERE.hint} />
            </span>
          </SDiv>

          {/* One heading and one grid per discipline, all in the DOM, one pair
              shown at a time. `display: none` takes the hidden ones out of the
              accessibility tree too, so a screen reader meets exactly what is on
              screen. */}
          {OPERE.categories.map((c) => (
            <div key={c.slug} data-for={c.slug} data-shown="false" className="flex flex-col gap-[2svh]">
              {/* Same face, same size, same leading as the list item it flies out
                  of — that is what makes the FLIP read as one continuous word
                  instead of a cross-fade between two. */}
              <h3 className="t-condensed text-[15vw] leading-[0.9] text-flesh md:text-[8vw]">
                <span data-word className="inline-block [will-change:transform]">
                  <T c={c.name} />
                </span>
              </h3>

              {c.projects.length === 0 ? (
                <p className="t-meta text-carbon/55">
                  <T c={OPERE.empty} />
                </p>
              ) : (
                <ul className="grid grid-cols-2 gap-[3vw] md:grid-cols-3">
                  {c.projects.map((pr, i) => (
                    <li key={pr.slug}>
                      <ProjectCard
                        category={c}
                        project={pr}
                        delayMs={GRID_DELAY + i * CARD_STAGGER}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Section>
      </div>
    </Section>
  );
}
