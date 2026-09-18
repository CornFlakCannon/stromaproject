# ENGINE — how a frame flows

Read this once before touching anything in `core/`. Everything below is already
implemented; the source comments carry the fine detail, this is the map.

---

## The pipeline

```
  wheel event  ─┐
                ├─→  scrollAccumulator (a ref, not state)      core/ScrollShell.tsx
  pointer drag ─┘     touch/pen scaled by TOUCH_SENSITIVITY

  ── one requestAnimationFrame tick ────────────────────────────────────────────
      dt = min(64, time − lastFrame)
      delta = accumulator;  accumulator = 0
      readAutoplay(store)         playing? delta += ±rate × dt/1000  (− when the destination is above)
      [step mode]                 input is INTENT, not delta: decaying sum, threshold → playTo(neighbour)

      consumeJump(store)          pending jump? land every panel, drop the delta, stop any playthrough
      advanceSection(store, …)    threshold crossed? active index += 1 (or −1)  (skipped while ON the destination)
      [destination reached?]      trim delta to the exact remaining distance; stop after integrating
      integrateIndexPos(store, …) add delta to the ACTIVE section's position
      offscreenSections(store, …) while settling: which panels may snap now
      store.notify({ … })         ◀── the single broadcast, once per frame
      scrollTop ← smoothLerp(…)   glide the container toward the active panel
  ──────────────────────────────────────────────────────────────────────────────

  every widget:  useScrollFrame(state)                 core/useScrollFrame.ts
                 useSequenceProgress(spec, onProgress) core/useSequenceProgress.ts
                     gate by section  →  read position  →  slice the window
                     →  smooth (core/smoothing.ts)  →  p ∈ [0,1]
                 styleAt / composeStyle               widgets/anim.ts
                 Object.assign(el.style, …)           ◀── DOM written directly
```

The delta has **two producers and one consumer**: input and the playthrough both add to
it, and nothing downstream can tell them apart. That is deliberate — it is why autoplay
needed no code of its own beyond a rate (`core/autoplay.ts`), and it is the seam a
speed *curve* would plug into later, by computing the rate from the global position.

A playthrough may carry a **destination** (`until`, `core/autoplay.ts`). It changes two
things and nothing else: the delta's *sign* (toward the destination, decided from the
pre-frame active index — the one the hand-off is decided from) and its *last value* (once
the destination is the active section, each frame's delta is trimmed to the distance left
to `landingClamped`, and the frame that covers it stops the playthrough). Everything in
between — the leaving panel playing out, the margin, the snap glide, the entrances — is the
ordinary pipeline consuming an ordinary delta. `playTo(store, from, to, ms)` is the
fixed-duration form: `rate = playDistance / seconds`, where `playDistance`
(`core/sections.ts`) sums exactly what the loop will consume, so a trip lands on time to
within a frame or two whatever the panels' budgets.

**Step mode** (`<ScrollShell step>`): the wheel and the finger stop producing delta. Their
input feeds a decaying *intent* sum instead; when it crosses `STEP_THRESHOLD` the loop
calls `playTo` toward the neighbouring panel (by ordinal), and the whole trip takes the
shell's `step` milliseconds. A trip does not lock the wheel: a crossing while one is in
flight (held to the higher `STEP_REAIM_THRESHOLD`) re-aims it one panel further — or back
— from where it was *heading*, and the rest of the trip takes `step` ms again from now.
Input is dropped for `STEP_COOLDOWN` after each fire, during a jump's settle, and once a
swipe has spent its one step; the decay is what keeps a trackpad's inertial tail from
firing on its own. Nothing below the input stage knows the mode exists.

**No React re-render happens in that path.** State lives in refs and a plain
subscription store (`core/store.ts`); the provider's value is stable, so context never
re-renders consumers. If you find yourself calling `setState` per frame, you have left
the architecture.

---

## Ownership: the core writes, widgets request

Only `ScrollShell` writes scroll state. A widget reads (`useScrollFrame`,
`useSequenceProgress`) and, when it needs to *change* the scroll, files a request the
core applies on its next tick:

```
widget → requestJump(store, i)     [core/nav.ts]      → core consumes it → lands the panels
widget → setAutoplay(store, rate)  [core/autoplay.ts] → core reads it every frame → feeds delta
```

The two differ only in lifetime: a jump is single-shot (`consumeJump` read-and-clears), a
playthrough is a mode that persists until the core clears it — at its destination, at the
bottom of the page, or the moment the reader scrolls and takes control back. A jump also
clears a running playthrough: the newer destination wins.

That is the only sanctioned direction. It's why `nav.ts` is a `WeakMap` request slot and
not a setter — the hand-off stays one-directional, so there is exactly one place that can
put the page in an inconsistent scroll state, and that place is the loop.

Add features the same way: a per-store `WeakMap` channel, consumed by the loop.

---

## The two coordinate spaces

This is the single biggest source of confusion. There are two scroll counters and they
measure different things.

| | **index position** | **global position** |
| --- | --- | --- |
| Scope | Per section index | Whole page |
| Resets | Yes — each section has its own, 0-based | Never |
| Clamped to | That index's ceiling (`max`) | Total extent (sum of all ceilings) |
| Advances when | Its section is the active one | Always |
| Measured by | `anim` + `budget` / `start` / `end` | `rawAnim`'s `at` |
| Read it live | `DevHud` → `scroll` | `DevHud` → `global` |

So:

- `<SDiv budget={1600} anim={…}>` plays over 1600 units **of its own section's** scroll,
  starting when that section becomes active. Section 3's `start={0}` and section 0's
  `start={0}` are different moments in the page but the same number.
- `<SDiv rawAnim={[{ at: 9200, … }]}>` plays at absolute page position 9200, whichever
  section happens to be active there. This is how an element persists across a hand-off.

A nested `<Section start={n}>` shifts the *index* space only: descendants' windows are
measured from `n`. `rawAnim` ignores it entirely — that's the point.

**To find a global `at`:** run the page, scroll to the moment, read `global` off `DevHud`.
Do not compute it. Section ceilings grow at runtime as widgets register, so arithmetic is
an estimate and the HUD is the truth.

---

## Sections and the hand-off

`core/sections.ts` keeps a per-store registry: index → `{ threshold, snapDuration, el }`.

- **Threshold** — the index position at which the section hands off forward. Declared as
  `end` / `budget`; if omitted it falls back to the furthest child window end, discovered
  at runtime.
- **Forward** when the position has been at the threshold for `HANDOFF_MARGIN` of further
  scroll *and* a section `index + 1` exists. **Back** when it has been at 0 for as much in
  reverse. Positions persist per index, so a section resumes exactly where it was left.
- **The margin is a dead zone at the edge**, and it is why a panel is somewhere you can sit.
  Without it there is none at all: the position is clamped to `[0, max]` and `max` *is* the
  threshold, so the frame a section reaches its end it already satisfies `pos >= threshold`
  and the next flick of a wheel hands off. The accumulator only grows while the position is
  already pinned against the edge being pushed, and any move back inside the section clears
  it — so it is a fresh push each time, never a debt from an earlier visit. It costs no
  responsiveness: it fills from the reader's own delta, so one decisive frame still crosses
  on that frame. A jump clears it (`resetHandoff`) because a backward jump *lands* on the
  ceiling, already at the edge.
- The decision uses the *previous* frame's position, so the hand-off lags one frame. This
  is deliberate and load-bearing — don't try to make it eager.

**Trailing** — the section you scroll *away* from keeps animating until it lands. Its
position always reaches the end (it is clamped to the index ceiling, and the hand-off only
fires past the threshold), but the *smoothed* progress lags that position by design: scroll
fast enough and the hand-off arrives while the animation is still mid-ramp. Gating the
widget off right there froze it there, in plain sight — the leaving panel is on screen for
the whole snap glide. So a widget whose section is no longer active keeps ticking, easing
toward the pose its now-frozen position implies, and stops itself once it converges (an
idle section costs one comparison a frame). It reads that position with `readIndexPos`,
never `sharedScroll`, which would integrate this frame's delta into a section that is not
the active one. Trailing stands down on a settling frame (the jump rule below wins) and for
a `loop` (an `auto` loop must pause off-section, holding its phase).

**`snap`** makes a section a panel that glides into view: over its `snapDuration` of
scroll, `sectionScrollTop` lerps the container's target from the previous panel's top to
this one's. Past that span it sits flush. A widget with `start >= snapDuration` therefore
plays only after the panel has landed — which is why every panel's contents live in a
nested `<Section start={SNAP.normal}>`.

The glide target is **continuous** — never null between panels. That continuity is what
lets the container ease `scrollTop` without stranding; the old stall bug was the target
vanishing at a hand-off, not the easing.

---

## Jumping, and why "settle" exists

`jumpTo(i)` cannot simply set `scrollTop`: every section's position would still hold its
old value, so widgets would be posed for wherever the reader used to be.

So the core lands **every** panel at once (`core/ScrollShell.tsx`):

- sections before the target → position `Infinity`, clamped to their max ("fully played")
- sections after the target → `0` ("not yet reached")
- the target itself → **where it reads**, not by direction of travel. That is its
  `landing` prop, or its ceiling when it declares none — everything arrived, which is
  what a panel of entrances wants. Landing on the snap span instead would be a blank
  screen: a panel keeps its contents in a nested `<Section start={SNAP.normal}>`, so the
  snap span *is* local 0 for every widget on it. A section whose end is not its readable
  state says so — `Galleria` lands after its header, with the strip still to pan; `Hero`
  lands at 0, since it plays on the way out. `jumpTo(i, "start")` overrides all of it and
  lands at the snap span — a wordmark meaning "back to the top" wants the panel's
  beginning
- the sum of those landed positions is written to the global counter, so `rawAnim` layers
  resolve to the same moment

Then the ordinary glide eases `scrollTop` there — so a jump is smooth and reversible, and
reuses all the existing machinery.

The catch: if every widget re-posed immediately, the panel still on screen would visibly
snap to a pose it was never scrolled to. Hence **settling**. While the glide is in flight
the loop broadcasts `state.settle` — the indices currently *off-screen*. A widget on a
listed section snaps straight to its new pose (bypassing the smoother, out of sight); a
widget on a still-visible section holds, and snaps the moment its panel scrolls out.
Settling ends when every non-active section is off-screen.

---

## Where each concern lives

| File | Owns |
| --- | --- |
| `core/ScrollShell.tsx` | Input capture, the rAF loop, the scroll glide, jump landing, settling |
| `core/store.ts` | The frame broadcast (`ScrollState`, `onFrame`, `notify`) |
| `core/context.tsx` | Store + section context providers and hooks |
| `core/useScrollFrame.ts` | Per-frame subscription, no re-render |
| `core/sections.ts` | Section registry, hand-off decision, snap glide target, `<Section>` |
| `core/useSequenceProgress.ts` | Both scroll counters, window slicing, loop phase, smoothing |
| `core/nav.ts` | The jump request bus |
| `core/autoplay.ts` | The playthrough rate bus |
| `core/smoothing.ts` | The smoothing law every animation passes through |
| `core/easing.ts` | Easing curves |
| `core/presets.ts` | Named magnitudes: `BUDGET` `SNAP` `EASE` `PERIOD` `SPEED` |
| `widgets/anim.ts` | The channel registry, keyframe compile, sampling, two-layer compose |
| `widgets/*.tsx` | Everything you actually compose a page from |

---

## Extending it

- **A new animatable channel** — one row in `CHANNELS` (`widgets/anim.ts`). `Anim`,
  `Keyframe` and `styleAt` derive from that table; nothing else changes.
- **A new smoothing law** — write a `Smoother` in `core/smoothing.ts`, point
  `defaultSmoother` at it. It applies to every animation at once.
- **A new widget** — build on `useSequenceProgress`, take `SequenceSpec & { … }`, mutate
  the DOM in `onProgress`. Mount `RawLayer` if it should support a `rawAnim` layer.
- **A new imperative command** — a `WeakMap` request bus like `core/nav.ts`, consumed in
  the loop. Never a setter called from a widget.
