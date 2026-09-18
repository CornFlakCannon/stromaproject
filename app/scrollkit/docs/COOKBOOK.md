# COOKBOOK

Pasteable recipes. Headings are the words a person actually uses — the same terms the
lexicon in `PROMPT_CONVENTIONS.md` maps onto. All of these are working code from
`app/page.tsx`; go read it for the full assembled version.

Assume this import throughout:

```tsx
import {
  ScrollShell, Section, SDiv, SMask, ImageSequence, SectionNav, DevHud,
  BUDGET, SNAP, EASE, PERIOD, SPEED, useScrollNav, useAutoplay,
} from "@/app/scrollkit";
```

---

## "A new section"

One panel, one topic, one gating index. The inner `<div>` carries the background and
layout; the nested `<Section>` delays the contents until the panel has landed.

```tsx
<Section index={1} snap end={SNAP.normal + BUDGET.normal}>
  <div className="relative flex min-h-[100svh] items-center justify-center overflow-hidden bg-[#0b0b10]">
    <Section start={SNAP.normal}>
      {/* widgets: start={0} is "the moment this panel lands" */}
    </Section>
  </div>
</Section>
```

---

## "It fades up into place"

The default entrance. `EASE.settle` decelerates in.

```tsx
<SDiv
  start={0}
  budget={BUDGET.normal}
  anim={[
    { at: 0, y: "6svh", opacity: 0 },
    { at: 1, y: "0svh", opacity: 1, ease: EASE.settle },
  ]}
  className="font-display text-[8vw] text-white md:text-[4vw]"
>
  a heading
</SDiv>
```

---

## "One after the other" — staggered entrance

Same nested `<Section>`, different `start`. Every widget on an index shares one
integrated position, so reversing the scroll unwinds them in order rather than all at once.

```tsx
<Section start={SNAP.normal}>
  <SDiv start={0}            budget={BUDGET.normal} anim={rise} className="…">first</SDiv>
  <SDiv start={BUDGET.quick} budget={BUDGET.normal} anim={rise} className="…">second</SDiv>
  <SDiv start={BUDGET.quick * 2} budget={BUDGET.normal} anim={rise} className="…">third</SDiv>
</Section>
```

---

## "A subsection that slides in from the left"

A subsection is a nested `<Section>` — same panel, own origin. Two of them in one panel,
offset by a budget, read as one topic told in two beats.

```tsx
{/* first beat */}
<Section start={SNAP.normal}>
  <SDiv
    budget={BUDGET.normal}
    anim={[
      { at: 0, x: "-60vw", opacity: 0 },
      { at: 1, x: "0vw", opacity: 1, ease: EASE.swoop },
    ]}
    className="absolute w-[70vw] rounded-[1vw] bg-[#e8e3d9] p-[4vw] md:w-[30vw]"
  >
    …
  </SDiv>
</Section>

{/* second beat, one budget later, from the other side */}
<Section start={SNAP.normal + BUDGET.normal}>
  <SDiv budget={BUDGET.normal} anim={[
    { at: 0, x: "60vw", opacity: 0 },
    { at: 1, x: "4vw", opacity: 1, ease: EASE.swoop },
  ]} className="absolute …" >…</SDiv>
</Section>
```

---

## "It lifts, then drops into place" — the hovering illusion

Overshoot the scale and lift on `y` mid-window, then release. Pair with a real shadow in
`className` so the lift reads.

```tsx
anim={[
  { at: 0,   x: "60vw", y: "0svh",  scale: 1,    opacity: 0 },
  { at: 0.7, x: "6vw",  y: "-3svh", scale: 1.06, opacity: 1, ease: EASE.swoop },
  { at: 1,   x: "4vw",  y: "0svh",  scale: 1,                ease: EASE.settle },
]}
className="… shadow-2xl"
```

---

## "It gets carried down" / "stays fixed" / "doesn't leave"

A **non-leaving element**: `rawAnim` plays against the global scroll counter, ungated by
section, so it survives every hand-off. `fixed` pins it to the viewport.

Render it as a **direct child of `<ScrollShell>`**, not inside a panel — a transformed
ancestor would capture the `fixed` positioning.

```tsx
<SDiv
  rawAnim={[
    { at: 0,     y: "0svh",  opacity: 0, rotate: 0 },   // ← from rest
    { at: 3800,  y: "0svh",  opacity: 1, rotate: 0 },
    { at: 10400, y: "34svh", rotate: 180, ease: EASE.swoop },
    { at: 16400, y: "68svh", rotate: 360, ease: EASE.swoop },
  ]}
  className="pointer-events-none fixed right-[6vw] top-[14svh] z-[9997] h-[1vw] w-[1vw] rounded-full bg-white mix-blend-difference"
/>
```

**The `at` values come off `<DevHud>`'s `global` readout.** Scroll to the moment you want,
read the number, use it. Don't compute them.

---

## "Two things at once" — `anim` + `rawAnim` on one element

An `SDiv` can run both layers. The section layer handles the entrance; the raw layer takes
over later and keeps going across the hand-off. Author the raw layer **from rest** so it
contributes nothing until its window opens.

```tsx
<SDiv
  start={0} budget={BUDGET.normal}
  anim={[
    { at: 0, x: "10vw", width: 20, opacity: 0 },
    { at: 1, x: "10vw", width: 900, opacity: 1 },
  ]}
  rawAnim={[
    { at: 6500, width: 900, height: 20, rounding: 0, x: 0, y: 0 },  // ← matches where anim left off
    { at: 7000, width: 400, height: 400 },
    { at: 8000, rounding: 200, y: "-20svh" },
  ]}
  anchor={{ x: "start" }}
  className="bg-neutral-900"
/>
```

`x` `y` `rotate` `blur` **add** across layers; `scale` `opacity` **multiply**;
`width` `height` `rounding` `color` are single-owner — raw takes them only once engaged.

---

## "A line that morphs into a square, then a circle"

`rounding` animated up to half the smaller side is a circle. `anchor` fixes which edge
stays put while `width`/`height` change.

```tsx
<SDiv
  start={0} budget={BUDGET.slow}
  anim={[
    { at: 0,   width: 20,  height: 20,  rounding: 0 },
    { at: 0.4, width: 900, height: 20,  rounding: 0 },
    { at: 0.7, width: 400, height: 400, rounding: 0 },
    { at: 1,   rounding: 200, ease: EASE.swoop },
  ]}
  anchor={{ x: "start", y: "end" }}
  className="h-[20px] w-[20px] bg-neutral-900"
/>
```

`width`/`height` are px authored but applied as `scaleX/scaleY`, so they stretch content —
fine for a bare box, wrong for one containing text.

---

## "The text wipes in"

`<SMask>` punches a hole of transparency through its **DOM parent**. Park the hole over
the text (text hidden), slide it off to the right (text revealed, left to right).

```tsx
<SDiv start={0} budget={BUDGET.normal} className="relative overflow-hidden font-display text-[8vw]">
  <SMask
    start={0}
    budget={BUDGET.normal}
    anim={[
      { at: 0, x: 0,    y: -40, width: 2400, height: 400 },
      { at: 1, x: 2400,               ease: EASE.swoop },
    ]}
  />
  frame by frame
</SDiv>
```

SMask channels are **px numbers** in the parent's box — oversize the rectangle and let it
overhang. `invert` flips it: the parent then shows *only* through the shape, which is how
you do a spotlight or an iris-open.

---

## "Frame by frame" — a scrubbed image sequence

```tsx
<ImageSequence
  start={BUDGET.quick}
  budget={BUDGET.epic}
  frames={112}
  frameSrc={(n) => `/animations/cat/output_${String(n).padStart(3, "0")}.png`}
/>
```

The whole set preloads on mount, so scrubbing never flashes. Don't ease it — a sequence
should scrub linearly. Give it a generous budget: 112 frames over `BUDGET.quick` skips.

---

## "It animates by itself" / "it loops"

`loop` replays the anim as a repeating **phase** instead of a one-shot ramp. `by:"auto"`
advances on the wall clock; it is armed once the scroll reaches `start`, and pauses
(holding its phase) whenever another section is active.

```tsx
<SDiv
  start={0}
  loop={{ by: "auto", period: PERIOD.normal, mode: "pingpong" }}
  anim={[
    { at: 0, y: "0svh",   opacity: 0.35 },
    { at: 1, y: "1.4svh", opacity: 1, ease: EASE.gentle },
  ]}
  className="absolute bottom-[6svh] left-[8vw] font-mono text-[0.8vw] tracking-widest text-white/70"
>
  SCROLL ↓
</SDiv>
```

- `mode: "repeat"` restarts each cycle — author `at: 0` to match `at: 1` or it jumps.
- `mode: "pingpong"` bounces `0 → 1 → 0`; no seam to worry about.
- `times: 3` caps the cycles then holds the final pose. Omit for forever.
- `by: "wheel"` advances on scroll instead; `period` is then in scroll units.

---

## "A button that takes you there"

```tsx
<SectionNav target={3} label="Skip to the end" />
```

Or roll your own — the same request bus, any markup:

```tsx
const { jumpTo } = useScrollNav();
<button onClick={() => jumpTo(3)}>Get in touch</button>
```

A wordmark going home is the one case that wants the panel's *beginning* rather than
its end — otherwise jumping back lands section 0 fully played out:

```tsx
<button onClick={() => jumpTo(0, "start")}>Stroma</button>
```

A section menu is just one per index:

```tsx
{["Intro", "Work", "Contact"].map((label, i) => (
  <SectionNav key={i} target={i} label={label} className={`fixed left-6 top-[${5 + i * 3}svh] …`} />
))}
```

Both must render inside `<ScrollShell>`. `SectionNav` portals to `<body>`, so it stays
viewport-fixed and is never collected as a panel — context still reaches it through the
portal.

---

## "Let it play itself" — a playthrough

The site scrolls itself start to end, so it can just be watched. The kit ships the hook and
no widget; this is the reference control, lifted from `app/page.tsx`:

```tsx
function PlayThrough() {
  const { toggle, speed } = useAutoplay();

  const mounted = useSyncExternalStore(NEVER, () => true, () => false);
  if (!mounted) return null;

  return createPortal(
    <button
      type="button"
      onClick={() => toggle(SPEED.normal)}
      className="fixed right-6 top-5 z-[9998] font-sans text-sm tracking-wide text-white mix-blend-difference"
    >
      {speed !== null ? "Pause" : "Play it for me"}
    </button>,
    document.body,
  );
}
```

Or without any chrome — three lines anywhere under the shell:

```tsx
const { play, pause, speed } = useAutoplay();
<button onClick={() => (speed ? pause() : play(SPEED.slow))}>▶</button>
```

- **`SPEED` is units per second**, the same unit as `BUDGET` — so a widget takes exactly
  `budget / speed` seconds on screen, whatever the page's length. `SPEED.normal` plays a
  `BUDGET.normal` beat in two seconds.
- **Any wheel or swipe cancels it** and hands control straight back. There is no fighting
  the drift, and no need for a visible Pause.
- **It stops at the bottom and does not rewind.** `speed` goes back to `null` on that frame,
  so a control's label follows it without any wiring.
- Like every scroll hook it must be called **inside** `<ScrollShell>` — which is why this is
  its own component and not a few lines in the page body. Portal it, or being a direct child
  of the shell makes it a full-viewport panel.

---

## "Let me see the numbers"

```tsx
{process.env.NODE_ENV === "development" && <DevHud />}
```

Gives you fps, the active section, `scroll` (this section's position — what `budget` and
`start`/`end` are measured in) and `global` (the page-wide counter — what `rawAnim`'s `at`
is measured in), plus a jump button per section. Click the readout to copy it.

Keep it on while authoring. It is the difference between reading a number and guessing one.
