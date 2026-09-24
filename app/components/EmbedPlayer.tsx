"use client";

import { useState } from "react";
import { OPERE } from "@/app/content";
import { T } from "./T";

/** The name to put on the notice, from the embed's host; any other platform
 *  is named by its bare domain. */
function platformOf(embed: string): string {
  const host = new URL(embed).hostname.replace(/^www\./, "");
  if (/youtube(-nocookie)?\.com$/.test(host)) return "YouTube";
  if (host.endsWith("vimeo.com")) return "Vimeo";
  return host;
}

/**
 * A film hosted elsewhere, loaded only when asked for. Until the click the
 * frame is ours alone: no request leaves for the platform, so nothing of the
 * visitor reaches it without their say — the click is the consent, and the
 * notice under the button says what it consents to. After it, the <iframe>
 * arrives with autoplay on, so one press plays the film.
 */
export default function EmbedPlayer({ embed, title }: { embed: string; title: string }) {
  const [on, setOn] = useState(false);

  if (on) {
    const src = new URL(embed);
    src.searchParams.set("autoplay", "1");
    return (
      <iframe
        src={src.toString()}
        title={title}
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="h-full w-full"
      />
    );
  }

  const platform = platformOf(embed);
  return (
    <button
      type="button"
      onClick={() => setOn(true)}
      className="group flex h-full w-full cursor-pointer flex-col items-center justify-center gap-4 px-6 text-center text-bone"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-bone/30 bg-carbon/75 transition-colors group-hover:border-flesh group-hover:text-flesh group-focus-visible:border-flesh group-focus-visible:text-flesh">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="ml-1 h-6 w-6 fill-current">
          <path d="M7 4.5v15l12-7.5z" />
        </svg>
      </span>
      <span className="t-meta">
        <T c={OPERE.play} />
      </span>
      <span className="t-meta max-w-[46ch] text-bone/50 normal-case">
        <T c={{ it: OPERE.playNote.it.replace("{p}", platform), en: OPERE.playNote.en.replace("{p}", platform) }} />
      </span>
    </button>
  );
}
