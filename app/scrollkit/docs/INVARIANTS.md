# INVARIANTS — what must not change

Each rule states the failure it prevents. If you are about to break one, you have found
either a bug or a feature that belongs in the core — not a call site.

**`core/` is settled.** Do not restructure, "clean up", or refactor it unless a task
explicitly targets the engine. Build features *around* it.

---

## Rendering

**Never `setState` in a per-frame callback** — `onProgress`, `useScrollFrame`, or anything
the loop calls. Mutate refs and the DOM. A single `setState` per frame turns a 60fps
compositor animation into a 60fps React render of the whole subtree, and the page stutters.

**Never add a dependency to animate something.** React 19 + Next 16 + Tailwind v4 is the
whole stack. The engine exists so a motion library isn't needed; adding one reintroduces
the render-per-frame cost the architecture was built to avoid.

**One `<ScrollShell>` per page.** It captures wheel and pointer events globally for its
container and owns the only rAF loop. Two of them fight over the same input.

---

## Ownership

**A widget never writes scroll state.** It reads (`useScrollFrame`, `useSequenceProgress`)
and files requests (`requestJump` / `useScrollNav`). The core applies them on its next
tick. One writer means one place where the scroll can go inconsistent.

**Extend by request bus, not by setter.** A new imperative command is a per-store
`WeakMap` slot consumed in the loop — copy `core/nav.ts`. Exposing a setter to widgets
lets two of them contradict each other mid-frame.

**A playthrough feeds the accumulator and nothing else.** `core/autoplay.ts` stores a rate
(and, optionally, a destination); the loop turns it into this frame's delta. It must never
write `scrollTop`, start a timer, or set index positions directly — a second driver of the
scroll would fight the glide and drift the two counters apart. If autoplay ever needs to do
more than produce a delta, the answer is a different delta, not a second path. The
destination is exactly that: it changes only the delta's sign and its final, trimmed value.
A fixed-duration step is a rate computed once from the distance, not a timer.

**Step mode changes the input stage only.** In `<ScrollShell step>` the wheel and the finger
feed an intent sum instead of the delta, and a step is a `playTo`. Nothing below that —
hand-offs, glide, widgets, canvas — may learn which mode is on; the moment it does, the two
modes start needing separate fixes.

**Never write `store.state.x = …` from a component.** Go through `store.notify(patch)`.
The mutation has to stay inside the store or the React compiler lint rejects it.

---

## Structure

**Every direct child of `<ScrollShell>` is a panel.** The shell adds `min-h-[100svh]` to
each DOM child at runtime and treats it as a full-viewport box. Put anything else through
a portal (like `DevHud` and `SectionNav`) or accept that it occupies a screen. Portaled
children still read the scroll store — React context flows through portals.

**Only top-level `<Section>`s advance.** A nested one is coordinate-only: it emits no
layout box, purely shifting its descendants' scroll origin. It must stay that way — a
`min-h` box in the middle of an absolutely-composed scene inflates the container and
dislocates the layout.

**`min-h-[100svh]` on a panel is load-bearing**, and it is applied by `<Section>` itself
rather than at runtime: in a flex column, a hair under `100vh` lets the last panel's top
strand out of reach.

**The scroll container must be the panels' `offsetParent`.** `ScrollShell` is `relative`
for exactly this reason — `sectionScrollTop` reads `el.offsetTop` and assumes it. Do not
make a panel wrapper `relative`, `absolute` or transformed.

---

## Portability

**Inside `app/scrollkit/`, imports are relative only.** No `@/…` alias, ever. The folder
must survive being copied into a project with a different alias, or a different location.

- Kit widgets import from `../core` (the internal barrel).
- Core modules import each other by direct relative path — never through `./index`, which
  re-exports `ScrollShell` and would loop.
- Site code imports `@/app/scrollkit` (the public barrel) and never a deep path, so the
  folder can move without touching a call site.

**The kit takes no dependency on the site.** No project fonts, colours, copy, routes or
assets. `ImageSequence`'s default `frameSrc` points at `/animations/cat/` as a convenience
only — always pass your own.

---

## Authoring

**`rawAnim` is authored from rest.** First keyframe at identity — `x: 0`, `scale: 1`,
`opacity: 1` — and single-owner channels (`width`/`height`/`rounding`/`color`) matched to
wherever the `anim` layer leaves them. A raw layer coexists with the section layer, so a
non-rest first keyframe snaps the element the instant its window opens.

**One `<SMask>` per parent.** It owns the parent's `clip-path` outright; a second one
silently wins. It must be a direct child of the element being clipped.

**`<SMask>` geometry is px numbers.** Its channels are a clip rectangle in the parent's
box, not a transform — units parse but are ignored. Oversize the rectangle and let it
overhang rather than trying to match content exactly.

**Distances are relative units** (`vw` / `svh` / `%`), never desktop pixels — see
`AUTHORING.md`. Scroll magnitudes (`budget`, `start`, `end`, `at`) are the exception:
they are accumulated delta and are absolute by design.

**Global `at` values are read off `<DevHud>`, not computed.** Section ceilings grow at
runtime as widgets register, so arithmetic is an estimate.

---

## Verification

**Never drive the running UI.** No Puppeteer, Playwright, headless Chromium, DevTools
Protocol, screenshots, or `npm run dev` driven from an agent. Verification stops at:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Then hand it back — **the user looks at the page**. Motion is judged by eye, and an agent
reporting "it works" from a screenshot is reporting on something it cannot actually
assess.

---

## Known gaps

**No native-scroll opt-out.** `ScrollShell` sets `touch-action: none`, pointer-captures
touch and `preventDefault`s the wheel. A region that needs *native* scrolling or easy
focus — a long form, a scrollable text panel — cannot get it on mobile.

Workaround today: the region attaches its own `wheel` / `pointerdown` listeners that
`stopPropagation` before the event reaches the container, plus `touch-action: pan-y`.

The clean fix is a `[data-native]` opt-out in the shell's handlers:

```ts
const isNative = (e: Event) =>
  e.target instanceof Element && !!e.target.closest("[data-native]");
// then bail early in handleWheel and handlePointerDown
```

Not applied — it changes core input handling and wants its own focused pass.

**No horizontal scroll.** The accumulator is `deltaY` / vertical finger travel only.

**`width` / `height` stretch content.** They are applied as `scaleX/scaleY` for
compositor cost, so a box animated on them distorts its children. Use `scale` for uniform
content-relative sizing, or animate a wrapper.
