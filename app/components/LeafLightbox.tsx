"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import Image from "next/image";
import { OPERE, type Plate } from "@/app/content";
import { T } from "./T";

/** The range of the zoom, 1 being "fits the card", and one step of it. */
const MIN = 1;
const MAX = 6;
const STEP = 1.6;
/** Where a click lands, from the fit. */
const CLICK_ZOOM = 2.5;
/** Pointer travel (px) under which a press-and-release is a click, not a pan. */
const CLICK_PX = 6;
/** The satin frame around the leaf, as a share of the viewport's height. */
const FRAME = "3svh";

const clamp = (z: number) => Math.min(MAX, Math.max(MIN, z));

/**
 * One leaf, to be looked at closely: a card the height of the screen, as wide
 * as the leaf needs at that height, on the satin ground. Click beside it and
 * it closes.
 *
 * A native <dialog>, for the same reasons FounderDialog is one: the focus trap,
 * Escape, the inert page behind and the top layer are the platform's. Not
 * portalled, because it does not need to be — a project page is outside
 * ScrollShell, so nothing here eats its wheel — and it is rendered next to the
 * reader, not inside it, so a key pressed in here never reaches the reader's
 * own handler.
 *
 * The zoom is a width. The leaf is laid out at the size that fits the box,
 * times `z`, inside a box that scrolls: panning is therefore the browser's own
 * scrolling — a finger, a trackpad, the wheel — and only two gestures are ours,
 * a mouse drag (which scrolls the box by hand) and ctrl+wheel, which is what a
 * trackpad pinch arrives as and would otherwise zoom the whole page. A finger
 * pinch on a phone is left to the browser, which zooms the viewport as it does
 * on any picture. Zooming keeps the point under the pointer where it is: the
 * fraction of the leaf that sat under it is measured before the change and the
 * scroll is set to match after it, in a layout effect, so nothing jumps.
 *
 * A click zooms in on the point clicked, and the next click comes back out.
 * "Click" is decided at pointerup by how far the pointer travelled since
 * pointerdown — a drag pans and must not also zoom when it lets go — so the
 * same two handlers serve both gestures.
 *
 * `margin: auto` on the leaf inside a flex box is not decoration: it centres the
 * leaf while it fits, and — unlike place-items — resolves to zero once it
 * overflows, so the top-left corner stays reachable by scrolling.
 */
export default function LeafLightbox({
  leaf,
  onClose,
}: {
  leaf: Plate | null;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const box = useRef<HTMLDivElement>(null);
  /** More than one lightbox can sit on a page — one per plate in the prose,
   *  one for the reader — so the title's id cannot be a constant. */
  const titleId = useId();
  const body = useRef<HTMLDivElement>(null);

  const [z, setZ] = useState(MIN);
  const zRef = useRef(MIN);
  /** The point to hold still across the next zoom: its fraction of the leaf,
   *  and where it sits in the box. Consumed by the layout effect below. */
  const anchor = useRef<{
    fx: number;
    fy: number;
    x: number;
    y: number;
  } | null>(null);

  // Open only once the content is committed — showModal() straight from the
  // click would run before the re-render and flash an empty dialog. Every
  // opening starts from the fit.
  useEffect(() => {
    const d = dialog.current;
    if (!d || !leaf) return;
    zRef.current = MIN;
    setZ(MIN);
    if (!d.open) d.showModal();
  }, [leaf]);

  const zoomTo = (next: number, clientX?: number, clientY?: number) => {
    const b = box.current;
    const c = body.current;
    const nz = clamp(next);
    if (!b || !c || nz === zRef.current) return;
    const r = b.getBoundingClientRect();
    const x = (clientX ?? r.left + r.width / 2) - r.left;
    const y = (clientY ?? r.top + r.height / 2) - r.top;
    anchor.current = {
      fx: (b.scrollLeft + x) / c.offsetWidth,
      fy: (b.scrollTop + y) / c.offsetHeight,
      x,
      y,
    };
    zRef.current = nz;
    setZ(nz);
  };

  useLayoutEffect(() => {
    const a = anchor.current;
    const b = box.current;
    const c = body.current;
    if (!a || !b || !c) return;
    anchor.current = null;
    b.scrollLeft = a.fx * c.offsetWidth - a.x;
    b.scrollTop = a.fy * c.offsetHeight - a.y;
  }, [z]);

  // Bound by hand, not through onWheel: React's wheel listener is passive, and a
  // passive listener cannot preventDefault — and ctrl+wheel left to the browser
  // zooms the page, not the leaf.
  useEffect(() => {
    const b = box.current;
    if (!b) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      zoomTo(zRef.current * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };
    b.addEventListener("wheel", onWheel, { passive: false });
    return () => b.removeEventListener("wheel", onWheel);
    // Re-bound per leaf: the box only exists while one is open.
  }, [leaf]);

  const onKey = (e: KeyboardEvent<HTMLDialogElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "+" || e.key === "=") zoomTo(zRef.current * STEP);
    else if (e.key === "-") zoomTo(zRef.current / STEP);
    else if (e.key === "0") zoomTo(MIN);
    else return;
    e.preventDefault();
  };

  // One press, two outcomes. A mouse press pans by scrolling the box while it
  // moves; any pointer that lets go where it landed is a click and toggles the
  // zoom at that point. A finger already pans natively, so it is only ever the
  // second.
  const press = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
  } | null>(null);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    const b = box.current;
    if (!b || e.button !== 0) return;
    press.current = {
      x: e.clientX,
      y: e.clientY,
      left: b.scrollLeft,
      top: b.scrollTop,
      moved: false,
    };
    if (e.pointerType === "mouse") b.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const b = box.current;
    const p = press.current;
    if (!b || !p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.hypot(dx, dy) >= CLICK_PX) p.moved = true;
    if (e.pointerType !== "mouse") return;
    b.scrollLeft = p.left - dx;
    b.scrollTop = p.top - dy;
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p) return;
    press.current = null;
    const b = box.current;
    if (b?.hasPointerCapture(e.pointerId)) b.releasePointerCapture(e.pointerId);
    if (e.type === "pointercancel" || p.moved) return;
    zoomTo(zRef.current > MIN ? MIN : CLICK_ZOOM, e.clientX, e.clientY);
  };

  const ratio = leaf ? leaf.width / leaf.height : 1;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onKeyDown={onKey}
      onClick={(e) => {
        // A click on the backdrop lands on the dialog element itself; the
        // frame inside is a child, so a click on it does not.
        if (e.target === dialog.current) dialog.current?.close();
      }}
      /* The height of the screen and no wider than the leaf needs: the UA caps
         a dialog just short of the viewport, so both caps go, and `m-auto`
         centres it — a modal dialog gets `inset: 0`, and Tailwind's preflight
         zeroes the margin it would be centred by. `w-fit`, not `w-auto`: with
         `inset: 0` an auto width stretches to both edges. No display utility
         here, ever: see .aside-card in globals.css. */
      className="satin m-auto h-[100svh] max-h-none w-fit max-w-none overflow-hidden p-0 text-bone"
    >
      {leaf && (
        /* The frame. The padding lives here and not on the dialog, so that a
           click on the satin around the leaf is a click inside the card. */
        <div className="relative h-full" style={{ padding: FRAME }}>
          <div
            ref={box}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            data-zoomed={z > MIN}
            className="no-scrollbar flex h-full overflow-auto overscroll-contain cursor-zoom-in data-[zoomed=true]:cursor-zoom-out"
            /* The fit: as wide as the leaf is at the frame's height, or as
               wide as the screen allows, whichever is smaller. */
            style={{
              width: `min(calc(100vw - 2 * ${FRAME}), calc((100svh - 2 * ${FRAME}) * ${ratio}))`,
            }}
          >
            <div
              ref={body}
              className="m-auto shrink-0"
              style={{ width: `${z * 100}%` }}
            >
              <figure className="w-full bg-white">
                <Image
                  src={leaf.src}
                  width={leaf.width}
                  height={leaf.height}
                  alt=""
                  /* Eager and first: this is the one thing on screen. */
                  priority
                  className="h-auto w-full"
                />
                <figcaption id={titleId} className="sr-only">
                  <T c={leaf.caption} />
                </figcaption>
              </figure>
            </div>
          </div>

          {/* The one control rides over the leaf, top right, on a carbon tab
              so it reads on white. */}
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="t-meta absolute right-4 top-4 cursor-pointer bg-carbon/80 px-3 py-2 text-bone/70 transition-colors hover:text-flesh focus-visible:text-flesh md:right-6 md:top-6"
          >
            <T c={OPERE.close} /> <span aria-hidden>&times;</span>
          </button>
        </div>
      )}
    </dialog>
  );
}
