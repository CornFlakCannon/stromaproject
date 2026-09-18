"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { sectionIndices, useScrollFrame, useScrollNav, useScrollStore } from "@/app/scrollkit";
import { NAV } from "../content";
import { LangToggle, T } from "./T";
import { useMounted } from "./useMounted";

/**
 * The whole chrome of the site: a wordmark, four destinations, the language,
 * and a hairline that reports how far down the organism you are.
 *
 * Portalled to <body> on purpose — ScrollShell preventDefaults wheel events
 * inside its own container, and the bar has no business swallowing them. Active
 * state and progress are written straight to the DOM from the frame callback,
 * so the bar never re-renders.
 */
export default function TopBar() {
  const mounted = useMounted();
  const { jumpTo } = useScrollNav();
  const store = useScrollStore();
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  const lastActive = useRef(-1);

  useScrollFrame((s) => {
    if (s.sectionIndex !== lastActive.current) {
      lastActive.current = s.sectionIndex;
      NAV.forEach((n, i) => {
        const el = items.current[i];
        if (el) el.dataset.active = String(s.sectionIndex === n.target);
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
          <button
            type="button"
            onClick={() => jumpTo(NAV[NAV.length - 1].target)}
            className="t-meta pointer-events-auto cursor-pointer text-bone transition-colors hover:text-flesh md:hidden"
          >
            <T c={NAV[NAV.length - 1].label} />
          </button>
          <LangToggle className="pointer-events-auto text-bone" />
        </nav>
      </div>

      <div
        ref={bar}
        aria-hidden
        className="h-px w-full origin-left scale-x-0 bg-flesh [will-change:transform]"
      />
    </header>,
    document.body,
  );
}
