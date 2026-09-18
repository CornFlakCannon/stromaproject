"use client";

import type { Copy } from "../content";
import { LANG_KEY } from "../lang";

/**
 * Bilingual text. Both languages are in the DOM; `globals.css` hides the one
 * that does not match `<html data-lang>`, so switching language repaints
 * nothing through React — no SDiv snaps back to its p=0 pose for a frame.
 */
export function T({ c }: { c: Copy }) {
  return (
    <>
      <span data-t="it">{c.it}</span>
      <span data-t="en" lang="en">
        {c.en}
      </span>
    </>
  );
}

/**
 * The same, when the two languages need to be block-level (e.g. a line of verse).
 *
 * `display` is set with a class, never inline: the rule that hides the inactive
 * language is unlayered, so it outranks every Tailwind utility — but an inline
 * style would outrank it right back and show both languages at once.
 */
export function TBlock({ c, className = "" }: { c: Copy; className?: string }) {
  return (
    <>
      <span data-t="it" className={`block ${className}`}>
        {c.it}
      </span>
      <span data-t="en" lang="en" className={`block ${className}`}>
        {c.en}
      </span>
    </>
  );
}

const LANGS = ["it", "en"] as const;

/** Two real buttons rather than one ambiguous toggle: the current language is
 *  always visible, and the active state is CSS-driven off `<html data-lang>`. */
export function LangToggle({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {LANGS.map((l, i) => (
        <span key={l} className="flex items-center gap-1.5">
          {i > 0 && <span aria-hidden className="opacity-30">·</span>}
          <button
            type="button"
            data-lang-opt={l}
            lang={l}
            aria-label={l === "it" ? "Leggi in italiano" : "Read in English"}
            onClick={() => {
              document.documentElement.dataset.lang = l;
              document.documentElement.lang = l;
              // The site is more than one page now, so the choice has to
              // outlive the document. Private mode can throw on access alone.
              try {
                localStorage.setItem(LANG_KEY, l);
              } catch {}
            }}
            className="t-meta cursor-pointer transition hover:text-flesh hover:opacity-100"
          >
            {l.toUpperCase()}
          </button>
        </span>
      ))}
    </div>
  );
}
