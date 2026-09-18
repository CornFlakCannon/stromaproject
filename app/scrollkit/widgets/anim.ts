import type { CSSProperties } from "react";
import { linear, type Easing } from "../core/easing";

/**
 * A keyframe channel value may be a plain number (uses the channel's default unit —
 * see `format` in `CHANNELS`) or a unit-bearing string carrying an explicit CSS unit
 * (`"100%"`, `"50vw"`, `"10rem"`, `"-90deg"`). An explicit unit overrides the channel
 * default; for `translate` (x/y), `%` is resolved by CSS against the widget's OWN
 * size, so e.g. `{ at: 0, x: "-100%" }` starts it one full width to the left.
 */
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** A sampled endpoint: its magnitude, plus an explicit CSS unit (or `null` when
 *  plain-numeric, in which case the channel's default `format` unit applies). */
type Sample = { value: number; unit: string | null };

/** Split an endpoint into magnitude + unit. Plain numbers and unitless numeric
 *  strings (`"100"`) yield `unit: null`; a trailing unit (`"100%"`) is kept. */
const parse = (x: number | string): Sample => {
  if (typeof x === "number") return { value: x, unit: null };
  const m = /^(-?[\d.]+)(.*)$/.exec(x.trim());
  const unit = m && m[2].trim() ? m[2].trim() : null;
  return { value: m ? parseFloat(m[1]) : parseFloat(x), unit };
};

/** How one animatable channel maps onto CSS. A *scalar* channel lerps a number
 *  (+ optional unit) and `format`s it; a *color* channel lerps between CSS colors
 *  perceptually via `color-mix`. */
type ScalarChannel = {
  /** CSS property this channel writes. */
  prop: keyof CSSProperties;
  /** Lerped number → CSS token; the channel's DEFAULT unit lives here. Used only
   *  when neither tween endpoint carries an explicit unit string. */
  format: (v: number) => string;
  /** When several channels share a `prop` (translate: `x y`), the token to emit
   *  for this channel while a sibling is animated but this one is not. */
  fallback?: string;
  /** When set, this channel is authored in PX and applied as a scale: the sampled
   *  value is divided by the element's measured base size on this axis before
   *  `format` (which wraps it in scaleX/scaleY). See `styleAt`'s `base` argument. */
  basis?: "width" | "height";
  /** How two coexisting layers (an SDiv's `anim` + `rawAnim`) combine on this
   *  channel: `add` sums (identity 0 — translate/rotate/blur), `mul` multiplies
   *  (identity 1 — scale/opacity). Omitted ⇒ single-owner: the raw layer wins
   *  where it defines the channel, else the anim layer (see `composeStyle`). */
  compose?: "add" | "mul";
  kind?: "scalar";
};
/** A color channel: endpoints are CSS color strings (`"#f00"`, `"rgb(...)"`,
 *  `"tomato"`), interpolated with `color-mix(in oklab, …)` — the browser does the
 *  perceptual mixing, so any CSS color works and no parsing is needed. */
type ColorChannel = {
  prop: keyof CSSProperties;
  kind: "color";
  fallback?: string;
};
type Channel = ScalarChannel | ColorChannel;

/**
 * The channel registry — the single source of truth for what can be animated and
 * how each maps to CSS. **To add a channel (e.g. `skewX`, `brightness`), add one
 * row here** (with `kind: "color"` for colors); `Anim`/`Keyframe` gain the key
 * and `styleAt` picks it up with no other change. Channels sharing a `prop` are
 * emitted together in this declaration order (their tokens space-joined), so x/y
 * compose into one `translate`, width/height into one `transform`, and any future
 * filter channels into one `filter`. Position, rotation and uniform scale use the
 * independent translate/rotate/scale properties; per-axis width/height use the
 * `transform` shorthand, which the browser applies *after* those independent
 * properties — so everything composes and nothing clobbers.
 */
const CHANNELS = {
  opacity: { prop: "opacity", format: (v) => String(v), compose: "mul" },
  scale: { prop: "scale", format: (v) => String(v), compose: "mul" },
  x: { prop: "translate", format: (v) => `${v}px`, fallback: "0px", compose: "add" },
  y: { prop: "translate", format: (v) => `${v}px`, fallback: "0px", compose: "add" },
  rotate: { prop: "rotate", format: (v) => `${v}deg`, compose: "add" },
  // Box channels. width/height are authored in PX — the target rendered size on
  // that axis — but applied on the GPU as `transform: scaleX/scaleY` (NOT CSS
  // width/height): the widget measures its own base box size and each frame emits
  // `scaleX(targetPx / baseWidth)` (see `basis` below + `styleAt`'s `base`). So they
  // stay compositor-cheap (no reflow) and honor `transform-origin`/`anchor`, at the
  // cost of stretching the box's content like any scale. `basis` names the axis
  // whose measured size divides the px value. For a content-relative (unitless)
  // scale that adapts to content, use the `scale` channel instead. rounding is
  // border-radius (paint; no transform exists for it), default unit px.
  width: { prop: "transform", format: (v) => `scaleX(${v})`, fallback: "scaleX(1)", basis: "width" },
  height: { prop: "transform", format: (v) => `scaleY(${v})`, fallback: "scaleY(1)", basis: "height" },
  rounding: { prop: "borderRadius", format: (v) => `${v}px` },
  // Effect channels. blur is the out-of-focus filter (default unit px). color /
  // background are color channels — endpoints are CSS colors, mixed perceptually.
  // `background` writes the `background` shorthand (not just `background-color`), so
  // an endpoint may also be a two-color `linear-gradient(a, b)`, interpolated per
  // color-stop (see `sampleToken`).
  blur: { prop: "filter", format: (v) => `blur(${v}px)`, fallback: "blur(0)", compose: "add" },
  color: { prop: "color", kind: "color" },
  background: { prop: "background", kind: "color" },
} satisfies Record<string, Channel>;

type ChannelKey = keyof typeof CHANNELS;
const CHANNEL_KEYS = Object.keys(CHANNELS) as ChannelKey[];

/** CSS prop → its channels, in registry order. Grouped once at module load so
 *  `styleAt` can assemble multi-channel props (translate) without special cases. */
const PROP_CHANNELS = (() => {
  const groups = new Map<string, ChannelKey[]>();
  for (const key of CHANNEL_KEYS) {
    const prop = CHANNELS[key].prop as string;
    (groups.get(prop) ?? groups.set(prop, []).get(prop)!).push(key);
  }
  return [...groups];
})();

/**
 * One pose in an animation: target values for any subset of channels at normalized
 * progress `at` ∈ [0,1]. `ease` shapes the transition *leading into* this keyframe
 * (from each channel's previous defining keyframe).
 */
export type Keyframe = { at: number; ease?: Easing } & {
  [K in ChannelKey]?: number | string;
};

/**
 * What SDiv/SMask accept: a list of keyframe poses the element passes through, in
 * order. Per channel, values interpolate across only the keyframes that define that
 * channel — holding its first value before its first stop and its last value after —
 * so different keyframes may set different subsets of channels at different times.
 */
export type AnimSpec = Keyframe[];

/**
 * Which point of the box stays fixed as its width/height (and scale/rotate)
 * apply — i.e. CSS `transform-origin`. `start` = left/top, `end` = right/bottom.
 * For width (scaleX): `start` grows rightward (left edge fixed), `end` grows
 * leftward (right edge fixed). For height (scaleY): `start` grows down, `end` up.
 */
export type Anchor = "start" | "center" | "end";

const ANCHOR_PCT: Record<Anchor, string> = { start: "0%", center: "50%", end: "100%" };

/** Build a `transform-origin` from per-axis anchors (each defaults to center).
 *  `x` anchors width/scaleX; `y` anchors height/scaleY. */
export function transformOrigin({ x = "center", y = "center" }: { x?: Anchor; y?: Anchor }): string {
  return `${ANCHOR_PCT[x]} ${ANCHOR_PCT[y]}`;
}

/** A pre-parsed stop on a channel's timeline. `ease` shapes the transition INTO
 *  this stop from the previous one (undefined ⇒ linear). Scalar stops carry a
 *  magnitude + unit; color stops carry a raw CSS color string. */
type ScalarStop = { at: number; value: number; unit: string | null; ease?: Easing };
type ColorStop = { at: number; color: string; ease?: Easing };
type Stop = ScalarStop | ColorStop;

/** Per-channel, sorted, pre-parsed stop lists — the compiled form `styleAt` reads. */
export type Compiled = Partial<Record<ChannelKey, Stop[]>>;

/** A widget's measured base box size (px). `basis` channels (width/height) divide
 *  their authored px value by the matching dimension to get their scale factor. */
export type BoxBase = { width: number; height: number };

/**
 * Normalize the keyframe list into per-channel, pre-parsed, sorted stop lists.
 * Do this ONCE per anim (SDiv memoizes it on the `anim` prop) so the per-frame
 * `styleAt` only lerps + formats — no re-parsing or re-sorting each frame.
 */
export function compileAnim(spec: AnimSpec): Compiled {
  const out: Compiled = {};
  // Append a stop, choosing the color or scalar representation for the channel.
  const add = (k: ChannelKey, at: number, raw: number | string, ease?: Easing) => {
    const ch: Channel = CHANNELS[k];
    const stop: Stop =
      ch.kind === "color"
        ? { at, color: String(raw), ease }
        : { at, ...parse(raw), ease };
    (out[k] ??= []).push(stop);
  };
  for (const kf of spec) {
    for (const k of CHANNEL_KEYS) {
      if (kf[k] !== undefined) add(k, kf.at, kf[k]!, kf.ease);
    }
  }
  for (const k of CHANNEL_KEYS) out[k]?.sort((a, b) => a.at - b.at);
  return out;
}

/**
 * A **raw** keyframe timeline: the same {@link Keyframe} poses, but each `at` is an
 * ABSOLUTE scroll position (the wheel-delta units used by `budget`/`end`), not a
 * normalized [0,1] progress. This is what a widget's `rawAnim` accepts — it plays
 * against the GLOBAL scroll position, ungated by section (see `useSequenceProgress`'s
 * `raw` mode). Normalize it here so the ordinary compile/style path can drive it:
 * the keyframes' `at` are rescaled into [0,1] across their own extent, and that
 * extent is returned as the `[start, end]` window to hand the (raw) scroll hook.
 * Needs ≥2 keyframes for a non-degenerate window.
 */
export function compileRaw(frames: Keyframe[]): { start: number; end: number; spec: Keyframe[] } {
  const ats = frames.map((f) => f.at);
  const start = Math.min(...ats);
  const end = Math.max(...ats);
  const span = end - start || 1; // guard a degenerate (single-position) window
  return {
    start,
    end,
    spec: frames.map((f) => ({ ...f, at: (f.at - start) / span })),
  };
}

/** Locate the bracketing stop pair for progress `p` and the eased fraction `t`
 *  between them — holding the first value before the first stop and the last after
 *  the last. The arriving stop's `ease` shapes each segment. Shared by the token
 *  (CSS) and scalar (numeric) samplers so the interpolation lives in one place. */
function bracket(stops: Stop[], p: number): { a: Stop; b: Stop; t: number } {
  const first = stops[0];
  const last = stops[stops.length - 1];
  if (stops.length === 1 || p <= first.at) return { a: first, b: first, t: 0 };
  if (p >= last.at) return { a: last, b: last, t: 1 };
  for (let i = 1; i < stops.length; i++) {
    if (p <= stops[i].at) {
      const a = stops[i - 1];
      const b = stops[i];
      const span = b.at - a.at;
      return { a, b, t: (b.ease ?? linear)(span > 0 ? (p - a.at) / span : 1) };
    }
  }
  return { a: first, b: last, t: 1 };
}

/** Split a comma list at top level, keeping commas nested in parens (`rgb(…)`)
 *  intact and trimming each part. Used to read a gradient's color stops. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "(") depth++;
    else if (c === ")") depth--;
    else if (c === "," && depth === 0) {
      out.push(s.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(s.slice(start).trim());
  return out;
}

/** The color stops of a bare `linear-gradient(colorA, colorB[, …])`, or null when
 *  the value isn't one. Simplest form only: each part is a whole color, so no angle/
 *  keyword first argument and no per-stop positions. */
function gradientStops(v: string): string[] | null {
  const m = /^linear-gradient\((.*)\)$/.exec(v.trim());
  return m ? splitTopLevel(m[1]) : null;
}

/** The CSS token for one channel at progress `p`: bracket the pair, then
 *  interpolate. Scalar channels lerp magnitude + format; color channels mix the
 *  two endpoints perceptually with `color-mix` — or, when an endpoint is a
 *  `linear-gradient(a, b)`, mix each color-stop and re-wrap as a gradient. */
function sampleToken(ch: Channel, stops: Stop[], p: number, base?: BoxBase): string {
  const { a, b, t } = bracket(stops, p);

  if (ch.kind === "color") {
    const ca = (a as ColorStop).color;
    const cb = (b as ColorStop).color;
    if (a === b) return ca; // clamped end / single stop
    // 0..100, 2 dp; clamped so an overshoot easing can't make color-mix invalid.
    const pct = Math.max(0, Math.min(100, Math.round(t * 10000) / 100));
    const mix = (x: string, y: string) => `color-mix(in oklab, ${y} ${pct}%, ${x})`;
    // Gradient endpoints interpolate per color-stop; a plain color paired with a
    // gradient is read as a uniform gradient of itself, so solid↔gradient still blends.
    const ga = gradientStops(ca);
    const gb = gradientStops(cb);
    if (ga || gb) {
      const n = Math.max(ga?.length ?? 0, gb?.length ?? 0);
      const stopAt = (g: string[] | null, solid: string, i: number) =>
        g ? (g[i] ?? g[g.length - 1]) : solid;
      const mixed = Array.from({ length: n }, (_, i) => mix(stopAt(ga, ca, i), stopAt(gb, cb, i)));
      return `linear-gradient(${mixed.join(", ")})`;
    }
    return mix(ca, cb);
  }

  const sa = a as ScalarStop;
  const sb = b as ScalarStop;
  const value = a === b ? sa.value : lerp(sa.value, sb.value, t);
  // A `basis` channel authors PX: divide by the measured base size on that axis to
  // get the scale factor `format` wraps (scaleX/scaleY). Until measured (or a zero
  // box) hold natural size via the fallback rather than emit a NaN/∞ token.
  if (ch.basis) {
    const dim = base?.[ch.basis];
    return dim ? ch.format(value / dim) : (ch.fallback ?? ch.format(1));
  }
  const unit = sa.unit ?? sb.unit;
  // Explicit unit overrides the channel default; otherwise use `format`.
  return unit ? `${value}${unit}` : ch.format(value);
}

/**
 * Numeric value of a scalar channel at progress `p` — the raw interpolated
 * magnitude, before any unit/format. Units are ignored: callers that need plain
 * numbers (e.g. SMask's hole rectangle in px) author these channels as numbers.
 * Returns `fallback` when the channel isn't animated. Reuses the same bracketing
 * as `sampleToken`, so keyframe interpolation stays defined in one place.
 */
export function sampleScalar(
  compiled: Compiled,
  key: keyof Compiled,
  p: number,
  fallback = 0,
): number {
  const stops = compiled[key];
  if (!stops || stops.length === 0) return fallback;
  const { a, b, t } = bracket(stops, p);
  const sa = a as ScalarStop;
  const sb = b as ScalarStop;
  return a === b ? sa.value : lerp(sa.value, sb.value, t);
}

/**
 * Style for a given progress; omits channels that aren't animated. Shared by the
 * initial (no-flash) render and the per-frame imperative update in SDiv. Takes
 * the compiled form (see `compileAnim`). `base` is the element's measured box size,
 * needed to resolve px `basis` channels (width/height) into a scale factor; when
 * omitted (e.g. the pre-measure initial render) those channels hold natural size.
 */
export function styleAt(anim: Compiled, p: number, base?: BoxBase): CSSProperties {
  const style: Record<string, string> = {};
  for (const [prop, keys] of PROP_CHANNELS) {
    if (!keys.some((k) => anim[k])) continue; // nothing animated for this prop
    style[prop] = keys
      .map((k) => {
        const ch: Channel = CHANNELS[k];
        const stops = anim[k];
        if (!stops) return ch.fallback ?? "0"; // sibling animated, this one isn't
        return sampleToken(ch, stops, p, base);
      })
      .join(" ");
  }
  return style;
}

/**
 * Two-layer additive composition — the style for an SDiv that runs BOTH a section
 * `anim` (`a`, progress `pa`) and a `rawAnim` (`b`, progress `pb`) at once, merged
 * so neither tramples the other. Merging happens per CHANNEL, then props are
 * assembled once, so channels that share a CSS prop (x/y → `translate`) each
 * contribute instead of clobbering.
 *
 * Per channel: a `compose` channel (see the registry) combines the two layers'
 * numeric samples — `add` (identity 0) or `mul` (identity 1) — using each layer's
 * identity where it is silent, so a layer authored from rest (x:0, scale:1) adds
 * nothing until its window opens ("kicks in later", no snap). Single-owner channels
 * (width/height/rounding/color) can't blend, so one layer owns each at a time: the
 * raw layer owns it only once ENGAGED (its window open, `pb > 0`), otherwise the anim
 * layer — so raw never hijacks a single-owner channel globally. A raw-ONLY such
 * channel holds its first value until engaged, so the hand-off is seamless when that
 * first keyframe matches where the anim layer leaves the channel. Composed channels
 * are numeric only (units ignored); author unit endpoints on a single-`anim` SDiv,
 * which routes through `styleAt`.
 */
export function composeStyle(
  a: Compiled,
  pa: number,
  b: Compiled,
  pb: number,
  base?: BoxBase,
): CSSProperties {
  const style: Record<string, string> = {};
  for (const [prop, keys] of PROP_CHANNELS) {
    if (!keys.some((k) => a[k] || b[k])) continue; // neither layer touches this prop
    style[prop] = keys
      .map((k) => {
        const ch: Channel = CHANNELS[k];
        const inA = !!a[k];
        const inB = !!b[k];
        if (!inA && !inB) return ch.fallback ?? "0"; // sibling drives the prop, not this
        // Single-owner (color, width/height, rounding): these can't blend, so ONE
        // layer owns the channel at a time. The raw layer owns it only once ENGAGED
        // (its window has opened, pb > 0); before that the anim layer owns it, so raw
        // never hijacks the channel globally. A raw-only channel holds its first
        // (rest) value until then — author that first keyframe to match where the anim
        // layer leaves off for a seamless hand-off. (basis px→scale works via `base`.)
        if (ch.kind === "color" || !ch.compose) {
          if (inB && pb > 0) return sampleToken(ch, b[k]!, pb, base);
          if (inA) return sampleToken(ch, a[k]!, pa, base);
          return sampleToken(ch, b[k]!, 0, base); // raw defines it but is idle → rest value
        }
        // Composable: blend the two numeric samples, identity where a layer is silent.
        const id = ch.compose === "add" ? 0 : 1;
        const va = inA ? sampleScalar(a, k, pa, id) : id;
        const vb = inB ? sampleScalar(b, k, pb, id) : id;
        return ch.format(ch.compose === "add" ? va + vb : va * vb);
      })
      .join(" ");
  }
  return style;
}
