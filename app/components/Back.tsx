"use client";

import Link from "next/link";
import type { Copy } from "@/app/content";
import { Arrow } from "./Arrow";
import { T } from "./T";

/**
 * The way back, wherever there is one: out of an open discipline on the Opere
 * panel, and out of a project page (top left and at the foot). One shape for
 * all of them — the arrow in a ring and the label at a size that can be read —
 * so the reader learns it once.
 *
 * It takes its colour from the caller (`currentColor`): carbon on the violet
 * wall, bone on a project page. A `href` makes it a link; without one it is a
 * button and `onClick` does the leaving.
 */
export default function Back({
  label,
  href,
  onClick,
  className = "",
}: {
  label: Copy;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const cls = `group inline-flex cursor-pointer items-center gap-3 transition-colors hover:text-flesh focus-visible:text-flesh ${className}`;
  const body = (
    <>
      <span className="flex size-[2.4em] shrink-0 items-center justify-center rounded-full border border-current/40 transition-colors group-hover:border-flesh group-focus-visible:border-flesh">
        <Arrow dir={-1} className="size-[52%]" />
      </span>
      <span className="t-meta text-[0.8rem] md:text-[0.9rem]">
        <T c={label} />
      </span>
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {body}
    </button>
  );
}
