"use client";

import Image from "next/image";
import type { Founder } from "@/app/content";

/**
 * A face — the photograph when it exists, and what stands in for it until it
 * does. One owner, because the founder's card, that card once opened, and the
 * cast strip on a project page all draw it, and a face that differed between
 * them would read as two people. Anything with a name and maybe a photo fits.
 *
 * The frame's shape is not ours: `className` sizes the box and this fills it.
 * The grid wants a 3:4 tile, the opened card the whole left edge, the cast a
 * circle — none is more correct than the others, only the face has to match.
 *
 * The placeholder is not a fallback for a failed load: `photo` being absent is
 * the signal. next/image pointed at a file that isn't there 404s and leaves a
 * broken box, so the missing case never reaches the network at all. All three
 * founders have their photograph; the branch stays for the fourth.
 */
export default function FounderPortrait({
  person,
  sizes,
  className = "",
}: {
  person: Pick<Founder, "name" | "photo">;
  sizes: string;
  className?: string;
}) {
  return (
    /* `@container`: the initial below is sized in cqw, so it scales with
       whatever box this has been given rather than with the viewport. */
    <div className={`@container relative overflow-hidden bg-ink ${className}`}>
      {person.photo ? (
        <Image
          src={person.photo.src}
          alt={person.name}
          fill
          sizes={sizes}
          className="object-cover"
        />
      ) : (
        /* The initial in the display face reads as a held place rather than as
           a failure. Hidden from the accessibility tree: the name is already
           right there in text, and an orphan letter announces nothing. */
        <div aria-hidden className="flex h-full w-full items-center justify-center">
          <span className="t-cubital text-[48cqw] leading-none text-viola/25">
            {person.name[0]}
          </span>
        </div>
      )}
    </div>
  );
}
