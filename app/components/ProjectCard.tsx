"use client";

import Image from "next/image";
import Link from "next/link";
import type { Category, Project } from "@/app/content";
import { T } from "./T";

/**
 * One project in the Opere grid, and the link to its page.
 *
 * The card is a satin frame — the manifesto card's own ground, carbon at 82%
 * with the grain over it — set on the violet wall: the picture sits inside it
 * and the title and meta under the picture read in bone on the frame, where
 * carbon on violet did not.
 *
 * `cover` is optional, and a missing one is drawn rather than repaired: the
 * card renders its own title as the picture. That is the same bargain
 * FounderPortrait strikes with the founders' photographs — next/image pointed
 * at a file that does not exist 404s and leaves a broken box, so absence is
 * treated as a state and not as a failure. Dropping the image into public/ and
 * filling the field in content.ts is the whole handover; nothing here changes.
 *
 * The picture is shown as it is, no duotone: the posters and plates are the
 * works' own colours, and the flesh remap turned a black-and-white poster into
 * a pink one. Where the picture's subject is off-centre, `cover.position` says
 * which part the 4:3 crop keeps.
 *
 * A project made of texts and nothing else has no picture to give, so its card
 * shows a sheet instead: the first text, set small on white and cut where the
 * frame ends, the way a page looks from across a room. The sheet is a glimpse,
 * so it is hidden from assistive tech; the title under it is the name.
 */
export default function ProjectCard({
  category,
  project,
  delayMs,
}: {
  category: Category;
  project: Project;
  /** Stagger for the entry, in ms — the grid arrives one card at a time. */
  delayMs: number;
}) {
  const sheet = !project.cover && project.testi?.[0]?.items[0];
  return (
    <Link
      href={`/opere/${category.slug}/${project.slug}`}
      /* `enter-card` is a CSS animation, not an SDiv, and that is the point: this
         grid arrives because someone clicked, not because the page scrolled, and
         four grids of scroll widgets would inflate the section's ceiling with
         windows nobody ever travels. The delay is the stagger. */
      className="enter-card group block"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="satin relative p-[2.4vw] text-bone md:p-[0.9vw]">
        <div aria-hidden className="grain" />

        <div className="relative aspect-[4/3] w-full overflow-hidden border border-bone/15 bg-bone/5">
          {project.cover ? (
            <Image
              src={project.cover.src}
              alt=""
              fill
              sizes="(max-width: 768px) 90vw, 30vw"
              style={{ objectPosition: project.cover.position }}
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03] group-focus-visible:scale-[1.03]"
            />
          ) : sheet ? (
            <div
              aria-hidden
              className="t-voice absolute inset-0 overflow-hidden whitespace-pre-line bg-white px-[6vw] py-[5vw] text-[3vw] leading-[1.3] text-carbon transition-transform duration-500 group-hover:scale-[1.03] group-focus-visible:scale-[1.03] md:px-[2vw] md:py-[1.6vw] md:text-[0.95vw]"
            >
              {sheet.text.join("\n\n")}
            </div>
          ) : (
            <span
              aria-hidden
              className="t-condensed absolute inset-0 flex items-end p-[1.2vw] text-[3.4vw] leading-[0.9] text-bone/25 md:text-[2vw]"
            >
              <T c={project.title} />
            </span>
          )}
        </div>

        <p className="t-condensed mt-[1.2svh] text-[4.4vw] transition-colors group-hover:text-flesh group-focus-visible:text-flesh md:text-[1.5vw]">
          <T c={project.title} />
        </p>
        <p className="t-meta text-bone/60">
          <T c={project.meta} />
        </p>
      </div>
    </Link>
  );
}
