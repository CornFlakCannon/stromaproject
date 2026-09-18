import type { CastMember } from "@/app/content";
import { filamentPaths } from "@/app/lib/filament";
import FounderPortrait from "./FounderPortrait";
import { T } from "./T";

/** Each thread a little fainter than the last, the way the tissue's halo
 *  tentacles stack: additive violet on carbon, never a solid ring. */
const THREAD_ALPHA = [0.75, 0.55, 0.38];

/**
 * The people behind a project, in one horizontal band: a circle for each face,
 * ringed by a filament in the manner of the tissue's cells, with the name and
 * the part they played underneath.
 *
 * A server component — the filament is pure geometry seeded from the name, so
 * there is nothing to compute in the browser and nothing that could disagree
 * between server and client. Only FounderPortrait inside brings a client
 * boundary, for next/image.
 *
 * On a phone the band scrolls sideways rather than wrapping: a cast stacked
 * two by two would push the way back off the bottom of the page. On a wide
 * screen it is a grid, six to a row: a sideways scroll there has no scrollbar
 * to show it and no wheel to drive it, so a crew of twelve read as six.
 */
export default function CastStrip({ cast }: { cast: CastMember[] }) {
  return (
    <ul className="no-scrollbar mt-[1svh] flex gap-[5vw] overflow-x-auto md:grid md:grid-cols-6 md:gap-x-[2.5vw] md:gap-y-[2svh] md:overflow-visible">
      {cast.map((m, i) => (
        // Index in the key on purpose: while the list is placeholders every
        // name is the same string, and a duplicate key would collapse them.
        <li key={`${m.name}-${i}`} className="w-[30vw] shrink-0 md:w-auto">
          {/* Room around the circle for the filament: the SVG reaches 22% past
              the face on every side (17% of this item's width), and the list
              scrolls, so it clips — the vertical margin is that overhang. */}
          <div className="relative mx-auto my-[17%] aspect-square w-[76%]">
            <FounderPortrait
              person={m}
              sizes="(max-width: 768px) 24vw, 8vw"
              className="h-full w-full rounded-full"
            />
            <svg
              aria-hidden
              viewBox="0 0 100 100"
              className="pointer-events-none absolute inset-[-22%] h-[144%] w-[144%] overflow-visible"
            >
              {filamentPaths(m.name + i).map((d, k) => (
                <path
                  key={k}
                  d={d}
                  fill="none"
                  className="stroke-viola"
                  strokeWidth={1}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  opacity={THREAD_ALPHA[k % THREAD_ALPHA.length]}
                />
              ))}
            </svg>
          </div>

          <p className="t-condensed truncate text-center text-[4vw] text-bone md:text-[1.15vw]">
            {m.name}
          </p>
          <p className="t-meta mt-1 text-center text-viola">
            <T c={m.role} />
          </p>
        </li>
      ))}
    </ul>
  );
}
