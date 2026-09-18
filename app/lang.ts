/**
 * Where the chosen language is kept, and the two lines that put it back.
 *
 * Both languages ship in every page and CSS hides the inactive one off
 * `<html data-lang>` (see globals.css), so restoring a choice is one attribute —
 * but it has to be set BEFORE the first paint, or the reader watches the page
 * flip from Italian to English. An inline script run during parse is the
 * documented way: node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md
 *
 * This mattered the moment the site grew a second route: within one document the
 * attribute survives, but a reload or a link opened cold would not.
 */
export const LANG_KEY = "stroma-lang";

/** Runs synchronously in <head>. Reading localStorage can throw on its own in
 *  private mode, hence the try — a missing preference is not an error. */
export const LANG_BOOT = `(function(){try{var l=localStorage.getItem(${JSON.stringify(
  LANG_KEY,
)});if(l==="it"||l==="en"){var e=document.documentElement;e.dataset.lang=l;e.lang=l}}catch(e){}})()`;
