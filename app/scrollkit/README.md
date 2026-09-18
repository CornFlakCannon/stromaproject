# scrollkit

A scroll-driven animation engine for Next.js App Router. It replaces the page's native
scroll with an accumulator: wheel and touch feed a single `requestAnimationFrame` loop,
which broadcasts a frame to every widget. Widgets map that scroll position onto keyframed
CSS and write it to the DOM directly — **nothing re-renders per frame**.

Built for authoring by prompt. The vocabulary is small and fixed on purpose, so a
description in plain language maps onto it without invention.

---

## Read in this order

| File | What it gives you |
| --- | --- |
| `README.md` (this) | Install, hello world, the whole vocabulary in one table |
| `docs/ENGINE.md` | How a frame flows, and the two coordinate spaces |
| `docs/AUTHORING.md` | "I want X → use Y", plus the unit policy and defaults |
| `docs/INVARIANTS.md` | What breaks the engine. Read before editing anything in `core/` |
| `docs/COOKBOOK.md` | Pasteable recipes, keyed to the words a person actually uses |

`app/page.tsx` in this repo is the canonical demo: every construct, once, annotated.

---

## Install into a fresh project

Requires React 19+, Next 16+ (App Router), Tailwind v4. No other dependencies — the kit
adds none, and shouldn't.

```bash
cp -r path/to/app/scrollkit  your-project/app/scrollkit
cp -r path/to/public/animations/cat  your-project/public/animations/cat   # demo asset, optional
```

Then, in `app/globals.css`, add the one utility the shell relies on:

```css
@utility no-scrollbar {
  &::-webkit-scrollbar { display: none; }
  -ms-overflow-style: none;
  scrollbar-width: none;
}
```

That's the whole install. The folder uses **relative imports internally**, so it works
under any path or alias. If `@/*` isn't aliased to your repo root, import from wherever
you dropped it — nothing inside needs changing.

There is a `/scroll-port` skill that does all of this and verifies the build.

---

## Hello world

```tsx
"use client";
import { ScrollShell, Section, SDiv, BUDGET, EASE, SNAP } from "@/app/scrollkit";

export default function Page() {
  return (
    <ScrollShell>
      <Section index={0} snap end={SNAP.normal + BUDGET.normal}>
        <div className="flex min-h-[100dvh] items-center justify-center bg-black">
          <Section start={SNAP.normal}>
            <SDiv
              budget={BUDGET.normal}
              anim={[
                { at: 0, y: "6svh", opacity: 0 },
                { at: 1, y: "0svh", opacity: 1, ease: EASE.settle },
              ]}
              className="font-display text-[8vw] text-white"
            >
              hello
            </SDiv>
          </Section>
        </div>
      </Section>
    </ScrollShell>
  );
}
```

Add `{process.env.NODE_ENV === "development" && <DevHud />}` as the last child while you
work — it is how you find scroll numbers instead of guessing them.

---

## The whole vocabulary

Everything imports from `@/app/scrollkit`. There is no deeper import path.

### Structure

| | |
| --- | --- |
| `<ScrollShell>` | Owns the loop and the input. Its direct children are panels. One per page. |
| `<Section index snap end>` | **Top level:** one full-viewport panel, one gating index. Advances. |
| `<Section start>` | **Nested:** coordinate-only. Shifts descendants' scroll origin. Emits no box. |

### Widgets

Every widget shares one prop vocabulary — `SequenceSpec`: `index`, `budget`, `start`,
`end`, `loop` — and adds its own on top.

| | |
| --- | --- |
| `<SDiv anim rawAnim anchor>` | Scroll-driven wrapper for any content. The workhorse. |
| `<SMask anim rawAnim invert>` | Punches a moving hole through its DOM parent. Wipes, reveals, morphs. |
| `<ImageSequence frames frameSrc>` | Scrubs a folder of stills. |
| `<SectionNav target label>` | Fixed button that jumps to a section. |
| `<DevHud>` | fps · per-section scroll · global scroll · jump buttons. Dev only. |

### Authoring

| | |
| --- | --- |
| `anim` | `Keyframe[]` at normalized `at ∈ [0,1]` across the widget's own window. |
| `rawAnim` | `Keyframe[]` at **absolute** `at` on the global scroll counter. Ungated by section. |
| `loop={{ by, period, times, mode }}` | Replay the anim as a repeating phase. `by:"auto"` runs on the clock. |
| Channels | `opacity scale x y rotate width height rounding blur color background` |
| `BUDGET` `SNAP` `EASE` `PERIOD` `SPEED` | Named magnitudes. Prefer these over bare numbers. |
| `useScrollNav().jumpTo(i, at?, opts?)` | Ask the core to scroll to a section. `at="start"` lands at its beginning rather than by direction — what a "back to the top" wordmark wants. `{ instant: true }` skips the scroll glide — what arriving by URL wants. |
| `useScrollNav().playTo(i, ms?)` | PLAY to a section — forward or back, through every hand-off, entrances and all — in `ms` (default: the shell's `step`). What an arrow key wants. |
| `<ScrollShell step>` / `step={ms}` | Step mode: one wheel click or swipe = one panel, played in; a click mid-trip aims one panel further. Every trip `ms` long. Off = scrub. |
| `useAutoplay().play(SPEED.normal)` | Play the whole site start to end. Any scroll cancels it. |
| `useScrollFrame(fn)` | Subscribe to the frame broadcast, for widgets you write yourself. |
| `useSequenceProgress(spec, fn)` | The hook every widget is built on: gives you `p ∈ [0,1]`. |

To add an animatable channel, add **one row** to `CHANNELS` in `widgets/anim.ts`. Types
and rendering pick it up everywhere with no other change.
