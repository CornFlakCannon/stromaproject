/**
 * Whether a lateral panel — today only the manifesto card — has taken the screen.
 *
 * A plain module-level box rather than React state, and deliberately not a
 * scrollkit request bus (`core/` is settled; see docs/INVARIANTS.md). It has one
 * writer and two readers, neither of which may re-render the page to do its job:
 *
 *   - `app/globals.css` reads the `html[data-aside]` attribute and slides the
 *     panel's content aside. Attribute + CSS is how this site already changes
 *     the page without React — see `html[data-lang]` and `app/lang.ts`.
 *   - `StromaCanvas` reads `ASIDE.open` inside its per-frame callback and pans
 *     the camera sideways to follow. A `setState` there would turn a compositor
 *     animation into a 60fps React render of the whole page.
 *
 * Both come off the same `setAside` call, so the slide and the camera cannot
 * disagree about whether the card is open.
 */

export const ASIDE = { open: false };

/** The one place either reader's source of truth is written. */
export function setAside(open: boolean): void {
  ASIDE.open = open;
  const root = document.documentElement;
  if (open) root.dataset.aside = "manifesto";
  else delete root.dataset.aside;
}
