/**
 * Bring a pinch-zoomed page back to scale 1.
 *
 * The landing cannot be zoomed out by hand: ScrollShell is `touch-action: none`.
 * The manifesto card zooms inside its own box now (components/useZoomPan), so
 * the page should never get zoomed there in the first place — this is the net
 * for a reader who is already stuck, including after a reload, where the
 * browser restores the zoom it had.
 *
 * There is no API to set the visual viewport's scale. The known trick is to cap
 * it: rewrite the viewport meta with `maximum-scale=1`, which makes the browser
 * clamp the current zoom, then put the original back so zooming stays allowed
 * everywhere else. Works on iOS Safari and Chrome for Android in practice; it is
 * not a guarantee any spec makes.
 */
export function resetPageZoom(): void {
  const vv = window.visualViewport;
  if (!vv || vv.scale <= 1.01) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!meta) return;
  const original = meta.content;
  meta.content = "width=device-width, initial-scale=1, maximum-scale=1";
  window.setTimeout(() => {
    meta.content = original;
  }, 300);
}
