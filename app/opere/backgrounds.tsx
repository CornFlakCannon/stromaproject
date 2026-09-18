import type { ReactNode } from "react";

/**
 * Per-project backgrounds.
 *
 * Every project page has the same structure; what changes is the ground it
 * stands on. That ground is chosen twice: a discipline has one by default, and
 * a single project may overrule it. So the lookup is project → category →
 * carbon, which is the site's default and a perfectly good answer.
 *
 * The category grounds are one mark each, drawn entirely by a CSS class (see
 * "THE GROUND UNDER EACH DISCIPLINE" in globals.css) — hence one component and
 * a table of class names rather than four near-identical components.
 *
 * A background that needs to move (a canvas, anything scroll-driven) brings its
 * own "use client" boundary in its own file; this map stays a server module so
 * the page can go on being statically rendered.
 */

/**
 * The mark, laid over the whole viewport.
 *
 * `fixed`, not `absolute`: these pages are outside ScrollShell on the browser's
 * own scroll, so the ground should stay put while the text moves over it. No
 * z-index — the <article> is already `relative` and comes later in the DOM, so
 * it paints on top by itself, whereas a negative z-index would drop this behind
 * the parent's own bg-carbon and disappear.
 */
function Ground({ mark }: { mark: string }) {
  return (
    <div aria-hidden className={`pointer-events-none fixed inset-0 ${mark}`} />
  );
}

/** One ground per discipline — the default for every project inside it. */
const BY_CATEGORY: Record<string, ReactNode> = {
  cinema: <Ground mark="ground-cinema" />,
  scrittura: <Ground mark="ground-scrittura" />,
  immagini: <Ground mark="ground-immagini" />,
  suono: <Ground mark="ground-suono" />,
};

/**
 * The verbo-visual page's ground: a handful of small blocks scattered over the
 * screen, wired to one another by hairlines — out of a block sideways along
 * its row, then straight down or up into the next — and, at the ends of the
 * chain, out to the edge of the screen. Static, so it is one inline SVG.
 *
 * Positions are per cent of the viewport and sizes are pixels, and the two
 * never have to be added: a block is placed by its CENTRE, so every wire runs
 * from centre to centre in per cent alone, and the block — opaque, barely
 * lighter than the ground, drawn last — hides the part of the wire under it.
 * That is what makes a wire read as stopping at the block's edge. No viewBox,
 * so a unit is a pixel and the lines stay one pixel wide on every screen.
 */
type Block = { id: string; x: number; y: number; w: number };

const BLOCKS: Block[] = [
  { id: "a", x: 15, y: 7, w: 36 },
  { id: "b", x: 64, y: 18, w: 20 },
  { id: "c", x: 71, y: 18, w: 52 },
  { id: "d", x: 39, y: 29, w: 28 },
  { id: "e", x: 85, y: 41, w: 44 },
  { id: "f", x: 23, y: 52, w: 16 },
  { id: "g", x: 26, y: 52, w: 16 },
  { id: "h", x: 29, y: 52, w: 16 },
  { id: "i", x: 59, y: 63, w: 60 },
  { id: "j", x: 10, y: 74, w: 24 },
  { id: "k", x: 76, y: 85, w: 32 },
  { id: "l", x: 81, y: 85, w: 12 },
  { id: "m", x: 47, y: 95, w: 40 },
];

/** Each wire leaves `from` along its own row and lands on `to` from above or
 *  below; "left" and "right" are the edges of the screen. Routed by hand so
 *  that no two wires cross. */
const WIRES: [string, string][] = [
  ["a", "left"],
  ["a", "d"],
  ["d", "b"],
  ["b", "c"],
  ["c", "right"],
  ["d", "f"],
  ["f", "g"],
  ["g", "h"],
  ["h", "i"],
  ["i", "e"],
  ["e", "right"],
  ["j", "left"],
  ["j", "k"],
  ["k", "l"],
  ["l", "right"],
  ["k", "m"],
];

/** Block height in px. */
const BLOCK_H = 10;

const BLOCK_FILL =
  "color-mix(in oklab, var(--color-viola) 22%, var(--color-carbon))";

function VerseGround() {
  const at = (id: string) => BLOCKS.find((b) => b.id === id);
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 h-full w-full text-viola"
    >
      <g stroke="currentColor" strokeOpacity={0.32} strokeWidth={1}>
        {WIRES.map(([fromId, toId]) => {
          const from = at(fromId);
          if (!from) return null;
          const to = at(toId);
          // To an edge: one horizontal run, off the screen.
          const endX = to ? to.x : toId === "left" ? 0 : 100;
          return (
            <g key={`${fromId}-${toId}`}>
              <line
                x1={`${from.x}%`}
                y1={`${from.y}%`}
                x2={`${endX}%`}
                y2={`${from.y}%`}
              />
              {to && to.y !== from.y && (
                <line
                  x1={`${to.x}%`}
                  y1={`${from.y}%`}
                  x2={`${to.x}%`}
                  y2={`${to.y}%`}
                />
              )}
            </g>
          );
        })}
      </g>
      {BLOCKS.map((b) => (
        /* Placed by its centre: the translate is the half-size, in pixels. */
        <rect
          key={b.id}
          x={`${b.x}%`}
          y={`${b.y}%`}
          width={b.w}
          height={BLOCK_H}
          transform={`translate(${-b.w / 2} ${-BLOCK_H / 2})`}
          style={{ fill: BLOCK_FILL }}
        />
      ))}
    </svg>
  );
}

/**
 * The poems' ground: a few soft lines drifting across the screen, each its own
 * slow wave, none of them straight.
 *
 * Curves cannot be drawn in per cent the way lines can — a path's `d` takes
 * bare numbers — so this one SVG has a viewBox of 100 by 100 stretched to the
 * viewport, and `vector-effect: non-scaling-stroke` keeps the hairline one
 * pixel wide whatever the stretch. Written by hand: each path starts just off
 * the left edge and ends just off the right, and the `S` segments continue
 * the previous curve smoothly, which is what keeps them soft.
 */
const WAVES: string[] = [
  "M -2 11 C 18 3, 30 25, 50 15 S 80 1, 102 13",
  "M -2 26 C 16 37, 34 17, 52 29 S 84 43, 102 31",
  "M -2 44 C 12 35, 28 57, 48 46 S 76 33, 102 49",
  "M -2 57 C 22 69, 40 49, 58 61 S 88 75, 102 59",
  "M -2 72 C 16 61, 30 83, 50 73 S 78 63, 102 77",
  "M -2 88 C 20 96, 36 80, 56 90 S 84 100, 102 86",
];

function WaveGround() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none fixed inset-0 h-full w-full text-viola"
    >
      <g
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.34}
        strokeWidth={1}
      >
        {WAVES.map((d) => (
          <path key={d} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}

/**
 * The prose's ground: lines that leave the left edge on a slant and, each at
 * its own moment, give it up and run level to the right edge — a thought
 * settling into a sentence. Two <line>s per run, in per cent like the
 * verbo-visual ground, so the hairlines stay a pixel wide with no viewBox.
 *
 * `y` is where a run enters, `bend` the per cent of the width at which it
 * turns, `drop` how far it has fallen by then. The bends were chosen by hand
 * to look scattered, and the drops trimmed so that no run crosses another.
 */
type Run = { y: number; bend: number; drop: number };

const RUNS: Run[] = [
  { y: 2, bend: 34, drop: 9 },
  { y: 9, bend: 61, drop: 9 },
  { y: 14, bend: 18, drop: 6 },
  { y: 21, bend: 47, drop: 11 },
  { y: 30, bend: 72, drop: 9 },
  { y: 36, bend: 26, drop: 5 },
  { y: 44, bend: 55, drop: 10 },
  { y: 52, bend: 12, drop: 4 },
  { y: 58, bend: 40, drop: 10 },
  { y: 66, bend: 83, drop: 13 },
  { y: 74, bend: 22, drop: 7 },
  { y: 81, bend: 49, drop: 12 },
  { y: 90, bend: 31, drop: 6 },
];

function ProseGround() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none fixed inset-0 h-full w-full text-viola"
    >
      <g stroke="currentColor" strokeOpacity={0.32} strokeWidth={1}>
        {RUNS.map(({ y, bend, drop }) => (
          <g key={y}>
            <line x1="0%" y1={`${y}%`} x2={`${bend}%`} y2={`${y + drop}%`} />
            <line
              x1={`${bend}%`}
              y1={`${y + drop}%`}
              x2="100%"
              y2={`${y + drop}%`}
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** A project that wants its own ground adds one row here, keyed by the two URL
 *  segments, and touches nothing else. It wins over its category's. */
const BY_PROJECT: Record<string, ReactNode> = {
  "scrittura/opere-verbo-visuali": <VerseGround />,
  "scrittura/poesie": <WaveGround />,
  "scrittura/prosa": <ProseGround />,
};

/** The background for one project, or null for the plain carbon ground. */
export function backgroundFor(categoria: string, slug: string): ReactNode {
  return BY_PROJECT[`${categoria}/${slug}`] ?? BY_CATEGORY[categoria] ?? null;
}
