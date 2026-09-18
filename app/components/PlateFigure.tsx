"use client";

import { useState } from "react";
import Image from "next/image";
import { OPERE, type Plate } from "@/app/content";
import LeafLightbox from "./LeafLightbox";
import { T } from "./T";

/**
 * A plate set into the prose: a white sheet with its caption under it, as tall
 * as most of a screen, centred in whatever it is given — and a click on it
 * opens it full screen, the same way a sheet in the reader does. Small on the
 * page beside a paragraph, the sheets are for looking at, not for reading;
 * the lightbox is where they are read.
 *
 * A client component for the click and the dialog it opens, nothing else; the
 * page that lays it out stays a server component.
 */
export default function PlateFigure({
  plate,
  className = "",
}: {
  plate: Plate;
  className?: string;
}) {
  const [open, setOpen] = useState<Plate | null>(null);
  return (
    <>
      <figure
        className={`my-[4svh] flex flex-col items-center gap-[1.6svh] md:my-0 ${className}`}
      >
        <button
          type="button"
          onClick={() => setOpen(plate)}
          className="block w-[min(100%,calc(70svh*0.707))] cursor-zoom-in bg-white"
          style={{ aspectRatio: `${plate.width} / ${plate.height}` }}
        >
          <Image
            src={plate.src}
            width={plate.width}
            height={plate.height}
            /* The caption names it; an attribute cannot carry two languages. */
            alt=""
            className="h-auto w-full"
          />
          <span className="sr-only">
            <T c={OPERE.open} />
          </span>
        </button>
        <figcaption className="t-meta text-bone/60">
          <T c={plate.caption} />
        </figcaption>
      </figure>
      <LeafLightbox leaf={open} onClose={() => setOpen(null)} />
    </>
  );
}
