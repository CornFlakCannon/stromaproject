/**
 * The one place the landing's URL and the Opere panel agree on a shape:
 * `/#opere` is the panel, `/#opere/<categoria>` is the panel with that
 * discipline open.
 *
 * A hash and not a route, because the landing is one ScrollShell that mounts
 * fresh at scroll 0 — there is no page to land on, only a panel to jump to
 * (`useScrollNav`) and a discipline to reopen (`select()` in Opere.tsx). And
 * deliberately NO `id="opere"` on the panel: an id that matched would make the
 * browser (and Next) scroll the anchor natively inside the container, fighting
 * the loop that writes `scrollTop` every frame. The hash is read by hand.
 *
 * Written with `replaceState`, not `pushState`: an open discipline is a state
 * of the panel, not a page of its own, and Back should leave the site the way
 * it came in — from the project page straight to the grid it was opened from.
 */

const PREFIX = "#opere";

export function opereHref(cat?: string): string {
  return cat ? `/${PREFIX}/${cat}` : `/${PREFIX}`;
}

/** The hash the landing was opened with, or null when it is not an opere one. */
export function readOpereHash(): { cat: string | null } | null {
  const h = window.location.hash;
  if (h === PREFIX) return { cat: null };
  if (h.startsWith(`${PREFIX}/`)) return { cat: h.slice(PREFIX.length + 1) || null };
  return null;
}

export function writeOpereHash(cat: string | null): void {
  window.history.replaceState(null, "", opereHref(cat ?? undefined));
}
