"use client";

import { useId, useRef } from "react";
import { createPortal } from "react-dom";
import { sectionIndices, useScrollFrame, useScrollNav, useScrollStore } from "@/app/scrollkit";
import { MENU, NAV } from "../content";
import { LangToggle, T } from "./T";
import { useMounted } from "./useMounted";

/**
 * The whole chrome of the site: a wordmark, five destinations, the language,
 * and a hairline that reports how far down the organism you are.
 *
 * Portalled to <body> on purpose — ScrollShell preventDefaults wheel events
 * inside its own container, and the bar has no business swallowing them. Active
 * state and progress are written straight to the DOM from the frame callback,
 * so the bar never re-renders.
 *
 * On a phone the destinations do not fit in the bar, so they fold behind a
 * burger into a panel that slides in from the right, full height (`.menu-card`
 * in globals.css). It is a native modal <dialog>, like every other card on the
 * site — the focus trap, Escape and the inert page behind are the platform's —
 * and it is opened and closed by hand, never through state, so nothing here
 * renders when it moves. A sibling of the header rather than a child: the
 * header is pointer-events-none, and the dialog would inherit it.
 */
export default function TopBar() {
  const mounted = useMounted();
  const { jumpTo } = useScrollNav();
  const store = useScrollStore();
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const menuItems = useRef<(HTMLButtonElement | null)[]>([]);
  const menu = useRef<HTMLDialogElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const lastActive = useRef(-1);
  const menuTitle = useId();

  useScrollFrame((s) => {
    if (s.sectionIndex !== lastActive.current) {
      lastActive.current = s.sectionIndex;
      NAV.forEach((n, i) => {
        const on = String(s.sectionIndex === n.target);
        for (const el of [items.current[i], menuItems.current[i]]) {
          if (el) el.dataset.active = on;
        }
      });
    }
    if (bar.current) {
      // The hairline tracks panels, not pixels — one clean step per panel reads
      // better than a jittery sub-panel measure, and it never lies about where
      // the end is.
      const last = sectionIndices(store).length - 1;
      const p = last > 0 ? Math.min(1, s.sectionIndex / last) : 0;
      bar.current.style.transform = `scaleX(${p})`;
    }
  });

  if (!mounted) return null;

  // Plain bone rather than mix-blend-difference: over the violet panel the
  // difference blend turned the whole bar neon green. Emphasis is carried by
  // FLESH against muted bone rather than by opacity — one colour for "you are
  // here" and "this is live under your cursor", everywhere on the site.
  return createPortal(
    <>
      <header className="pointer-events-none fixed inset-x-0 top-0 z-[9998]">
        <div className="flex items-center justify-between px-5 py-4 md:px-8">
          <button
            type="button"
            onClick={() => jumpTo(0, "start")}
            className="t-meta pointer-events-auto cursor-pointer text-bone transition-colors hover:text-flesh"
          >
            Stroma
          </button>

          <nav className="flex items-center gap-4 md:gap-6">
            <ul className="hidden items-center gap-4 md:flex md:gap-6">
              {NAV.map((n, i) => (
                <li key={n.target}>
                  <button
                    type="button"
                    ref={(el) => {
                      items.current[i] = el;
                    }}
                    data-active="false"
                    onClick={() => jumpTo(n.target)}
                    className="t-meta pointer-events-auto cursor-pointer text-bone/55 transition-colors hover:text-flesh data-[active=true]:text-flesh"
                  >
                    <T c={n.label} />
                  </button>
                </li>
              ))}
            </ul>
            <LangToggle className="pointer-events-auto text-bone" />
            {/* Three hairlines, the weight of the type in the panel they open. */}
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => menu.current?.showModal()}
              className="pointer-events-auto -my-2 -mr-2 flex cursor-pointer flex-col gap-[5px] p-2 text-bone transition-colors hover:text-flesh md:hidden"
            >
              <span aria-hidden className="block h-px w-6 bg-current" />
              <span aria-hidden className="block h-px w-6 bg-current" />
              <span aria-hidden className="block h-px w-6 bg-current" />
              <span className="sr-only">
                <T c={MENU.name} />
              </span>
            </button>
          </nav>
        </div>

        <div
          ref={bar}
          aria-hidden
          className="h-px w-full origin-left scale-x-0 bg-flesh [will-change:transform]"
        />
      </header>

      <dialog
        ref={menu}
        aria-labelledby={menuTitle}
        onClick={(e) => {
          // A click on the backdrop lands on the dialog element itself; the
          // panel's own surface is the full-size div inside it.
          if (e.target === menu.current) menu.current?.close();
        }}
        /* Pinned to the right edge and as tall as the screen. No display
           utility here, ever: `display` is owned by .menu-card in globals.css —
           see .aside-card for why. */
        className="satin menu-card my-0 mr-0 ml-auto h-[100dvh] max-h-none w-[85vw] max-w-none overflow-y-auto overscroll-contain p-0 text-bone"
      >
        <div className="flex min-h-full flex-col px-8 pb-10 pt-4">
          <div aria-hidden className="grain" />
          <h2 id={menuTitle} className="sr-only">
            <T c={MENU.name} />
          </h2>
          <button
            type="button"
            onClick={() => menu.current?.close()}
            className="t-meta cursor-pointer self-end py-[0.2em] text-bone/60 transition-colors hover:text-flesh focus-visible:text-flesh"
          >
            <T c={MENU.close} /> <span aria-hidden>&times;</span>
          </button>

          <nav className="flex flex-1 flex-col justify-center">
            <ul className="flex flex-col gap-[2.4svh]">
              {NAV.map((n, i) => (
                <li key={n.target}>
                  <button
                    type="button"
                    ref={(el) => {
                      menuItems.current[i] = el;
                    }}
                    data-active="false"
                    onClick={() => {
                      menu.current?.close();
                      jumpTo(n.target);
                    }}
                    className="cursor-pointer text-left font-display text-[11vw] font-thin uppercase leading-none tracking-[-0.01em] text-bone transition-colors hover:text-flesh focus-visible:text-flesh data-[active=true]:text-flesh"
                  >
                    <T c={n.label} />
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </dialog>
    </>,
    document.body,
  );
}
