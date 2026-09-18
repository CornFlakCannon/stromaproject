"use client";

import type { Source } from "@/app/content";

/**
 * A self-hosted clip that plays on its own, silently, forever: a trailer, a
 * moving plate. Muted, inline and looping are the three attributes autoplay
 * needs everywhere, iOS included.
 *
 * A client component for one reason: the ref repeats `muted` as a property.
 * React does not write `muted` into server-rendered markup, and a clip that
 * reaches the browser unmuted is one the browser refuses to start.
 */
export default function LoopVideo({ sources, className = "" }: { sources: Source[]; className?: string }) {
  return (
    <video
      ref={(v) => {
        if (v) v.muted = true;
      }}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      className={className}
    >
      {sources.map((s) => (
        <source key={s.src} src={s.src} type={s.type} />
      ))}
    </video>
  );
}
