import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GALLERIA, OPERE, findProject, type Block } from "@/app/content";
import Back from "@/app/components/Back";
import CastStrip from "@/app/components/CastStrip";
import EmbedPlayer from "@/app/components/EmbedPlayer";
import Leaves from "@/app/components/Leaves";
import LoopVideo from "@/app/components/LoopVideo";
import PlateFigure from "@/app/components/PlateFigure";
import Slides from "@/app/components/Slides";
import Testi from "@/app/components/Testi";
import { LangToggle, T } from "@/app/components/T";
import { opereHref } from "@/app/lib/opereHash";
import { backgroundFor } from "../../backgrounds";

type Params = { categoria: string; slug: string };

/** Every project, prerendered: the whole manifest is a local constant, so there
 *  is nothing to fetch and no reason for any of these to be dynamic. */
export function generateStaticParams(): Params[] {
  return OPERE.categories.flatMap((c) =>
    c.projects.map((p) => ({ categoria: c.slug, slug: p.slug })),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { categoria, slug } = await params;
  const found = findProject(categoria, slug);
  if (!found) return {};
  // A tab title cannot carry two languages the way <T> can, so it takes the
  // Italian — the same choice the root layout already makes with lang="it".
  return { title: `${found.project.title.it} — STROMA` };
}

/**
 * The blocks of a project's prose. A paragraph followed by a plate makes a
 * pair, and a pair sits in two columns on a wide screen — text and plate side
 * by side, the sides swapping from one pair to the next, so the eye zigzags
 * down the page instead of reading a column and then a column. On a phone the
 * plate simply follows its paragraph. Anything not in a pair runs the frame:
 * a lone paragraph, a lone plate, a quotation.
 */
function Prose({ body }: { body: Block[] }) {
  const rows: ReactNode[] = [];
  let pairs = 0;
  for (let i = 0; i < body.length; i++) {
    const block = body[i];
    const next = body[i + 1];
    if ("quote" in block) {
      rows.push(
        <blockquote
          key={block.quote.it}
          className="my-[2svh] border-l border-bone/25 pl-[4vw] md:pl-[1.5vw]"
        >
          <p className="italic text-bone/80">
            <span aria-hidden>&ldquo;</span>
            <T c={block.quote} />
            <span aria-hidden>&rdquo;</span>
          </p>
          <footer className="t-meta mt-[1svh] text-bone/50">
            &mdash; {block.cite}
          </footer>
        </blockquote>,
      );
    } else if ("figure" in block) {
      rows.push(<PlateFigure key={block.figure.src} plate={block.figure} />);
    } else if (next && "figure" in next) {
      const flip = pairs++ % 2 === 1;
      rows.push(
        <div
          key={next.figure.src}
          className="md:grid md:grid-cols-2 md:items-center md:gap-[4vw]"
        >
          <p className={flip ? "md:order-2" : undefined}>
            <T c={block} />
          </p>
          <PlateFigure
            plate={next.figure}
            className={flip ? "md:order-1" : undefined}
          />
        </div>,
      );
      i++;
    } else {
      rows.push(
        <p key={block.it}>
          <T c={block} />
        </p>,
      );
    }
  }
  return rows;
}

/**
 * One project.
 *
 * Deliberately outside ScrollShell, and therefore on the browser's own scroll:
 * a panel that snaps is no place to read. That also rules out TopBar, which is
 * built on the scroll store — the page carries its own thin chrome instead, a
 * way back and the language. The wordmark is "home"; the way back, top left
 * and again at the foot, goes to the grid this page was opened from
 * (`/#opere/<categoria>`), so a reader browsing a discipline never has to
 * descend the landing again.
 *
 * A server component: <T> and <LangToggle> bring their own client boundary, and
 * the language itself arrives before first paint from LANG_BOOT plus the CSS
 * rule on html[data-lang]. Nothing here needs to know which one is showing.
 *
 * Beyond the prose, everything is optional per project and simply absent when
 * the manifest does not carry it: a player (`video`), the work's own picture
 * beside the text (`cover`), a reader to leaf through the work itself
 * (`leaves`), a grid of texts read one at a time in a popup (`testi`), a
 * closing piece set apart at the foot (`coda`), and the strip of faces
 * (`cast`). A text or a series of images gets none of these and reads exactly
 * as before.
 */
export default async function ProjectPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { categoria, slug } = await params;
  const found = findProject(categoria, slug);
  if (!found) notFound();
  const { category, project } = found;

  // `overflow-x-clip`: a turning leaf slides partly off the side of a phone
  // (Leaves), and the page must not grow a sideways scroll while it does.
  return (
    <div className="relative min-h-[100svh] overflow-x-clip bg-carbon">
      {backgroundFor(categoria, slug)}

      {/* The way back first, top left, where a reader looks for it; the
          wordmark ("home") and the language on the right. */}
      <header className="mx-auto flex max-w-[90rem] items-center justify-between gap-6 px-5 py-6 md:px-8">
        <Back href={opereHref(categoria)} label={OPERE.toWorks} className="text-bone" />
        <div className="flex items-center gap-5 md:gap-8">
          <Link
            href="/"
            className="t-meta text-bone transition-colors hover:text-flesh focus-visible:text-flesh"
          >
            Stroma
          </Link>
          <LangToggle className="text-bone" />
        </div>
      </header>

      {/* A wide frame, not a wide column: the eyebrow, the title, the author and
          the two rules run the whole 90rem, and only the prose keeps a reading
          measure — flush left inside it rather than boxed in the middle. */}
      <article className="relative mx-auto max-w-[90rem] px-5 pb-[16svh] md:px-8">
        <p className="t-meta text-bone/60">
          <T c={category.name} />
        </p>

        <h1 className="t-cubital mt-[2svh] text-[13vw] md:text-[4.2vw]">
          <T c={project.title} />
        </h1>

        {/* Who made it. The medium (`meta`) is the grid card's line, not the
            page's: the eyebrow and the title already say what this is. */}
        {project.author && (
          <p className="t-meta mt-[1.6svh] text-bone/80">{project.author}</p>
        )}

        <div className="rule mt-[4svh] w-full" />

        {/* The player. The frame is reserved by `video` being there at all; what
            fills it may still be missing, in which case the frame says so
            rather than standing empty. A clip of our own plays in a <video> on
            a loop; a link plays in an <iframe> with the platform's own embed
            URL, loaded only once the visitor presses play (see EmbedPlayer). */}
        {project.video && (
          <figure className="mt-[4svh] aspect-video w-full border border-bone/15 bg-ink">
            {project.video.sources ? (
              <LoopVideo
                sources={project.video.sources}
                className="h-full w-full object-cover"
              />
            ) : project.video.embed ? (
              <EmbedPlayer embed={project.video.embed} title={project.title.it} />
            ) : (
              <div className="t-meta flex h-full w-full items-center justify-center text-bone/40">
                <T c={OPERE.soon} />
              </div>
            )}
          </figure>
        )}

        {/* The prose. With the work's own picture beside it — a poster — the
            text keeps a reading measure on the left and the picture takes the
            right-hand column, pushed to its far edge (on a phone it follows
            the text). Without one, the prose runs the whole frame, and a plate
            set between two paragraphs runs it too. Not when the project has
            leaves: then the cover is the grid card's picture only, and the
            sheets below are the work itself. */}
        {project.cover && !project.leaves ? (
          <div className="mt-[4svh] md:grid md:grid-cols-[minmax(0,62ch)_1fr] md:items-start md:gap-[4vw]">
            {/* The type role lives on the wrapper, not on each paragraph,
                because `ch` measures the font of the element it sits on: left
                on a bare div this would have been 62 characters of the 16px
                system sans (~500px), not of the serif actually being read.
                Paragraphs inherit it. Same for the grid column above: `62ch`
                is resolved on the grid, so it inherits the role too. */}
            <div className="t-voice flex max-w-[62ch] flex-col gap-[2svh] text-[4.8vw] text-bone/80 md:text-[1.45vw]">
              <Prose body={project.body} />
            </div>

            <figure className="mt-[6svh] w-[70vw] md:mt-0 md:w-[22vw] md:justify-self-end">
              <Image
                src={project.cover.src}
                width={project.cover.width}
                height={project.cover.height}
                sizes="(max-width: 768px) 70vw, 22vw"
                /* The caption names it; an attribute cannot carry two languages. */
                alt=""
                className="h-auto w-full"
              />
              <figcaption className="sr-only">
                <T c={project.title} />
              </figcaption>
            </figure>
          </div>
        ) : (
          <div className="t-voice mt-[4svh] flex flex-col gap-[2svh] text-[4.8vw] text-bone/80 md:gap-[6svh] md:text-[1.45vw]">
            <Prose body={project.body} />
          </div>
        )}

        {/* The work, leafed through one sheet at a time, under its own name and
            a few lines about it. */}
        {project.leaves && (
          <section className="mt-[10svh]">
            <h2 className="t-condensed text-[9vw] leading-[0.9] text-bone md:text-[3.2vw]">
              <T c={project.leaves.title} />
            </h2>
            {project.leaves.intro.length > 0 && (
              <div className="t-voice mt-[2.4svh] flex flex-col gap-[2svh] text-[4.8vw] text-bone/80 md:text-[1.45vw]">
                {project.leaves.intro.map((para) => (
                  <p key={para.it}>
                    <T c={para} />
                  </p>
                ))}
              </div>
            )}
            <div className="mt-[5svh]">
              <Leaves items={project.leaves.items} />
            </div>
          </section>
        )}

        {/* The texts, in their groups: a grid of titles under each group's own
            heading — or under none, when the page's title already names the
            lot — each opening full screen to be read. */}
        {project.testi?.map((group, i) => (
          <section
            key={group.title?.it ?? i}
            className={group.title ? "mt-[10svh]" : "mt-[8svh]"}
          >
            {group.title && (
              <h2 className="t-condensed mb-[5svh] text-[9vw] leading-[0.9] text-bone md:text-[3.2vw]">
                <T c={group.title} />
              </h2>
            )}
            <Testi items={group.items} />
          </section>
        ))}

        {/* The closing piece, set apart: the clip on a loop, and its text. */}
        {project.coda && (
          <section className="mt-[10svh]">
            <div className="rule w-full" />
            <h2 className="t-condensed mt-[4svh] text-[9vw] leading-[0.9] text-bone md:text-[3.2vw]">
              <T c={project.coda.title} />
            </h2>
            <LoopVideo
              sources={project.coda.sources}
              className="mt-[4svh] aspect-video w-full bg-white"
            />
            <div className="t-voice mt-[4svh] flex max-w-[62ch] flex-col gap-[2svh] whitespace-pre-line text-[4.8vw] text-bone/80 md:text-[1.45vw]">
              {project.coda.text.map((stanza) => (
                <p key={stanza} lang="it">
                  {stanza}
                </p>
              ))}
            </div>
          </section>
        )}

        {project.cast && project.cast.length > 0 && (
          <>
            <p className="t-meta mt-[8svh] text-bone/60">
              <T c={OPERE.cast} />
            </p>
            <CastStrip cast={project.cast} />
          </>
        )}

        {/* From the set: the photographs, one at a time, under their own name. */}
        {project.backstage && (
          <section className="mt-[10svh]">
            <h2 className="t-condensed text-[9vw] leading-[0.9] text-bone md:text-[3.2vw]">
              <T c={project.backstage.title} />
            </h2>
            <div className="mt-[5svh]">
              <Slides items={project.backstage.items} label={GALLERIA.photo} />
            </div>
          </section>
        )}

        <div className="rule mt-[9svh] w-full" />
        <Back href={opereHref(categoria)} label={OPERE.toWorks} className="mt-[3svh] text-bone" />
      </article>
    </div>
  );
}
