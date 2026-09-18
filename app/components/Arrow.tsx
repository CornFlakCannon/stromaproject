/**
 * The site's one arrow, drawn rather than typed: a glyph brings its own side
 * bearings and baseline and never sits at the centre of a circle, a path on a
 * square viewBox does. Lucide's arrow, in-line — the site carries no icon
 * package for one arrow. `dir` flips it: 1 points right, -1 left.
 */
export function Arrow({
  dir,
  className = "size-[42%]",
}: {
  dir: 1 | -1;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={dir < 0 ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

/**
 * The round button an arrow sits in — the reader's page-turn buttons and the
 * text popup's pager share it. Size and position are the caller's: it expects
 * `size-…` (or the `--arrow` variable) and a placement class beside it.
 */
export const arrowButton =
  "flex cursor-pointer items-center justify-center rounded-full border border-bone/30 bg-carbon/75 text-bone backdrop-blur-[2px] transition-colors hover:border-flesh hover:text-flesh focus-visible:border-flesh focus-visible:text-flesh aria-disabled:cursor-default aria-disabled:opacity-25 aria-disabled:hover:border-bone/30 aria-disabled:hover:text-bone";
