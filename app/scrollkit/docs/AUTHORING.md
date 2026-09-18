# AUTHORING — I want X, so I use Y

The decision table first, then the rules that stop you having to ask.
Recipes live in `COOKBOOK.md`; the vocabulary that maps a person's words onto this table
lives in `PROMPT_CONVENTIONS.md` at the repo root.

---

## Decision table

| I want | Use | Notes |
| --- | --- | --- |
| A new topic / panel / "section" | `<Section index={n} snap end={…}>` | Top level only; must be a direct child of `<ScrollShell>` |
| A "subsection" — same panel, own timeline | nested `<Section start={…}>` | Coordinate-only; emits no box, never advances |
| Move / fade / scale / rotate / blur content | `<SDiv anim>` | The default answer |
| Something that keeps playing across sections | `<SDiv rawAnim>` | Global scroll; add `fixed` for "doesn't leave" |
| Reveal, wipe, or morph a shape | `<SMask anim>` | Clips its DOM **parent**. One per parent |
| Frame-by-frame footage | `<ImageSequence frames frameSrc>` | Scrub linearly; don't ease it |
| Motion that runs on its own | `loop={{ by: "auto", period: PERIOD.normal }}` | Scroll-armed, section-gated, pauses off-section |
| Motion that repeats as you scroll | `loop={{ by: "wheel", period: BUDGET.quick }}` | `period` is in scroll units here |
| A CTA that scrolls somewhere | `<SectionNav target label>` or `useScrollNav().jumpTo(i)` | Teleports: the target arrives already posed |
| An arrow key / "next panel" that PLAYS there | `useScrollNav().playTo(i, ms?)` | Forward or back, entrances play; stops where the section reads (`landing`) |
| One click = one panel, played in | `<ScrollShell step={1400}>` | Every trip takes `step` ms whatever the budgets; a click mid-trip aims one further; the wheel/swipe is intent, not scroll |
| The site to play itself, start to end | `useAutoplay().play(SPEED.normal)` | Any user scroll cancels it; stops at the bottom. Build your own control — the kit ships no widget |
| Stagger several things | Same nested `<Section>`, different `start` | They share one position, so reversing unwinds in order |
| An element to grow from an edge | `anchor={{ x: "start" }}` | Sets `transform-origin` |
| To find a `rawAnim` `at` value | Scroll there, read `global` off `<DevHud>` | **Never** compute it |
| To tune how something feels | `BUDGET.*` / `SNAP.*` / `EASE.*` / `SPEED.*` | Change the preset, not the call site |
| A brand-new kind of animated thing | `useSequenceProgress(spec, onProgress)` | See `ENGINE.md` → Extending it |

---

## Units: relative, always

**Author every distance in `vw`, `svh`, `%` or `ch`. Never in desktop pixels.**

One authoring pass then fits every screen and there is no second mobile version to keep
in sync. The keyframe parser honours any CSS unit on a string endpoint:

```tsx
anim={[
  { at: 0, x: "-60vw", y: "6svh", opacity: 0 },   // ✅ fits any viewport
  { at: 1, x: "0vw",   y: "0svh", opacity: 1 },
]}
```

- `svh`, not `vh` — `svh` is stable while a mobile browser's URL bar shows and hides.
- `%` on `x` / `y` resolves against the **element's own** size, so `x: "-100%"` means "one
  full width to the left" regardless of screen.
- Font sizes and box sizes in `className` follow the same rule: `text-[8vw]`, `w-[70vw]`.
  Pair with a `md:` variant when a phone value would be absurd on a desktop.

Three exceptions, all because they are not CSS lengths:

| Not a length | What it is |
| --- | --- |
| `budget` / `start` / `end` / `rawAnim` `at` | Accumulated scroll delta. Absolute by design — the same amount of scrolling on any device |
| `<SMask>` channels | A px clip rectangle in the parent's box; units are parsed but ignored. Oversize it and let it overhang |
| `rounding`, `blur` | Effect radii in px |

---

## Defaults — assume these unless told otherwise

| | |
| --- | --- |
| Every top-level section | gets `snap` |
| Every panel's contents | live in a nested `<Section start={SNAP.normal}>` so they play after it lands |
| A widget's window | `budget={BUDGET.normal}` |
| Arriving somewhere | `ease: EASE.settle` |
| Travelling across screen | `ease: EASE.swoop` |
| An auto loop | `period: PERIOD.normal`, no `times` (forever) |
| A playthrough | `SPEED.normal` — units/sec, so a widget's duration is `budget / speed` |
| An image sequence | no easing — scrub linearly |
| Section `end` | `SNAP.normal + (what its widgets need after landing)` |
| Section `landing` | omitted — a jump lands on the finished panel. Declare it only when the end of the span is not what the panel reads as |
| `<DevHud>` | present in development, gated on `NODE_ENV` |

Use the preset names, not the numbers behind them. `budget={BUDGET.slow}` says what was
meant; `budget={3200}` says what was typed, and the next person can't tell whether the
value was chosen or defaulted.

---

## The shapes to keep in your head

**A section.** `end` is measured in that section's own space, and the snap span is part of
it — so a section that glides in and then plays one normal budget ends at
`SNAP.normal + BUDGET.normal`.

```tsx
<Section index={1} snap end={SNAP.normal + BUDGET.normal}>
  <div className="relative flex min-h-[100svh] items-center justify-center bg-[#0b0b10]">
    <Section start={SNAP.normal}>
      {/* widgets — `start={0}` here means "the moment the panel lands" */}
    </Section>
  </div>
</Section>
```

The inner `<div>` is yours: it is where the background, layout and `overflow-hidden` go.
`<Section>` only supplies the panel box and the coordinate space.

**A section a jump should not land at the end of.** `jumpTo` (the top bar, the arrow keys)
puts the panel in the state it reads in, which by default is "every widget arrived". When
the span ends somewhere else — a strip that has finished panning, a hero that has finished
*leaving* — say where instead. It is measured in the same space as `end`, and on a `snap`
panel it must be at least the snap span.

```tsx
<Section index={4} snap end={SNAP.normal + PLAY + BUDGET.slow} landing={SNAP.normal + PLAY}>
  {/* the header has landed; the strip has not panned yet — the reader does that */}
</Section>
```

**A widget.** `[start, start + budget]` in the enclosing section's local space; `anim`
keyframes are poses at normalized `at ∈ [0,1]` across that window.

```tsx
<SDiv
  start={0}
  budget={BUDGET.normal}
  anim={[
    { at: 0, y: "6svh", opacity: 0 },
    { at: 1, y: "0svh", opacity: 1, ease: EASE.settle },
  ]}
  className="…"
>
```

`ease` shapes the transition *into* the keyframe that carries it. Channels interpolate
independently: a channel holds its first value before its first keyframe and its last
after its last, so different keyframes may set different subsets.

**Two layers at once.** An `SDiv` may run `anim` and `rawAnim` together. They merge per
channel: `x` `y` `rotate` `blur` add, `scale` `opacity` multiply, and
`width` `height` `rounding` `color` `background` are single-owner (the raw layer takes
them only once its window opens).

> **Author `rawAnim` from rest** — `x: 0`, `scale: 1`, `opacity: 1` in its first keyframe,
> and match single-owner channels to wherever `anim` leaves them. Otherwise it snaps the
> element the moment its window opens.

---

## Channels

| Channel | Unit | Composes | Notes |
| --- | --- | --- | --- |
| `opacity` | — | multiply | |
| `scale` | — | multiply | Content-relative; adapts as content changes |
| `x`, `y` | px, or any CSS unit | add | `%` is relative to the element's own size |
| `rotate` | deg | add | |
| `width`, `height` | px | single-owner | Authored in px, applied as `scaleX/scaleY` against the measured box — compositor-cheap, but it stretches content. For content-relative sizing use `scale` |
| `rounding` | px | single-owner | `border-radius`; animate it to morph a square into a circle |
| `blur` | px | add | |
| `color`, `background` | CSS color | single-owner | Mixed perceptually via `color-mix`. `background` also accepts a two-colour `linear-gradient(a, b)` |

Adding one is a single row in `CHANNELS` (`widgets/anim.ts`) — types and rendering follow.

---

## Working loop

1. **Storyboard first.** Agree the table before writing code — one row per section:
   `index | label | snap | budget | widgets | channels | notes`. Correcting a table is
   cheap; correcting a built page is not.
2. Build it with presets, relative units, `<DevHud>` on.
3. Verify: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
4. **Hand it to the user to look at.** Never drive a browser to check — see
   `INVARIANTS.md`.
5. Tune numbers from what they say; record any new phrasing in `PROMPT_CONVENTIONS.md`.
