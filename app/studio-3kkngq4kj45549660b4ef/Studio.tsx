"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  FORMATS,
  MAX_SLIDES,
  createStudio,
  type Settings,
  type Studio as Engine,
} from "./engine";
import { withDateTaken } from "./exif";

const INITIAL: Settings = {
  format: 0,
  slides: 1,
  invert: false,
  sealed: false,
  growth: 0.3,
  thick: 1,
  veil: 0,
};

type Shot = { file: File; url: string };

const pad2 = (n: number) => String(n).padStart(2, "0");

/** `stroma_post-4x5_20261117-143205_02-di-05.jpg`: the export's time keeps two
 *  batches apart, and the slide number comes last so a folder sorted by name
 *  is the carousel in order. */
function fileNames(st: Settings, n: number, d: Date): string[] {
  const stamp =
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-` +
    `${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  const base = `stroma_${FORMATS[st.format].id}_${stamp}`;
  return Array.from({ length: n }, (_, i) =>
    n === 1 ? `${base}.jpg` : `${base}_${pad2(i + 1)}-di-${pad2(n)}.jpg`,
  );
}

/** When slide `i` of `n` was "taken": one second apart, the last one now, so a
 *  gallery sorting by date files them in slide order (see exif.ts). */
const takenAt = (now: Date, i: number, n: number) =>
  new Date(now.getTime() - (n - 1 - i) * 1000);

/**
 * The post studio: the site's background, posed by hand and saved at an
 * Instagram size. Made for a phone — the preview takes the top of the screen
 * and the controls scroll underneath; in landscape they move to the side.
 *
 * The tissue, the camera and the export are the engine's (engine.ts); this is
 * the panel around it.
 */
export default function Studio() {
  const area = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const frameEl = useRef<HTMLDivElement>(null);
  const fail = useRef<HTMLParagraphElement>(null);
  const engine = useRef<Engine | null>(null);
  const [s, setS] = useState<Settings>(INITIAL);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[] | null>(null);

  useEffect(() => {
    if (!area.current || !canvas.current || !frameEl.current) return;
    const e = createStudio(area.current, canvas.current, frameEl.current, INITIAL);
    if (!e) {
      if (fail.current) fail.current.hidden = false;
      return;
    }
    engine.current = e;
    return () => {
      e.dispose();
      engine.current = null;
    };
  }, []);

  useEffect(() => {
    engine.current?.set(s);
  }, [s]);

  const up = (patch: Partial<Settings>) => setS((p) => ({ ...p, ...patch }));
  const f = FORMATS[s.format];

  const run = async () => {
    const e = engine.current;
    if (!e || busy) return;
    setError(null);
    setBusy("Preparo…");
    try {
      const blobs = await e.exportSlides((i, n) =>
        setBusy(n > 1 ? `Slide ${i + 1} di ${n}…` : "Esporto…"),
      );
      const now = new Date();
      const n = blobs.length;
      const names = fileNames(s, n, now);
      setShots(
        await Promise.all(
          blobs.map(async (b, i) => {
            const taken = takenAt(now, i, n);
            const file = new File([await withDateTaken(b, taken)], names[i], {
              type: "image/jpeg",
              lastModified: taken.getTime(),
            });
            return { file, url: URL.createObjectURL(file) };
          }),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const close = () => {
    shots?.forEach((x) => URL.revokeObjectURL(x.url));
    setShots(null);
  };

  // The share sheet is the quick way into Instagram on a phone ("Salva
  // immagini" puts them in the camera roll, filed in order by the date each
  // one carries); downloads keep the numbered names.
  const files = shots?.map((x) => x.file) ?? [];
  const canShare =
    shots !== null && typeof navigator.canShare === "function" && navigator.canShare({ files });

  const share = async () => {
    try {
      await navigator.share({ files });
    } catch (err) {
      if (!(err instanceof Error && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  const downloadAll = () => {
    // Spaced out: browsers drop a burst of downloads fired in one go. Over a
    // second apart, so an app that files by the time a file was saved, not by
    // the date inside it, still finds them in slide order.
    shots?.forEach((x, i) =>
      setTimeout(() => {
        const a = document.createElement("a");
        a.href = x.url;
        a.download = x.file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 1100),
    );
  };

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-carbon text-bone landscape:flex-row">
      <div
        ref={area}
        className="relative min-h-0 flex-1 cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
      >
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" />
        {/* The veil: the ground's own colour over the tissue — the export lays
            the same layer, at the same opacity. */}
        <div
          className={`pointer-events-none absolute inset-0 ${s.invert ? "bg-viola" : "bg-carbon"}`}
          style={{ opacity: s.veil }}
        />
        {/* The crop. Its shadow dims everything outside it; placed by the engine. */}
        <div
          ref={frameEl}
          className="pointer-events-none absolute shadow-[0_0_0_100vmax_rgba(5,5,5,0.78)] outline outline-1 outline-bone/50"
        >
          {Array.from({ length: s.slides }, (_, i) => (
            <span
              key={i}
              className="absolute top-0 h-full"
              style={{ left: `${(i / s.slides) * 100}%`, width: `${100 / s.slides}%` }}
            >
              {i > 0 && <span className="absolute inset-y-0 left-0 border-l border-dashed border-bone/60" />}
              {s.slides > 1 && (
                <span className="absolute left-1 top-1 font-mono text-[10px] text-bone/80">
                  {pad2(i + 1)}
                </span>
              )}
            </span>
          ))}
        </div>
        <p className="pointer-events-none absolute inset-x-0 bottom-1.5 text-center font-mono text-[10px] uppercase tracking-wider text-bone/45">
          <span className="pointer-fine:hidden">1 dito ruota · 2 dita spostano e zoomano</span>
          <span className="hidden pointer-fine:inline">
            trascina ruota · tasto destro sposta · rotella zoom
          </span>
        </p>
        <p
          ref={fail}
          hidden
          className="absolute inset-0 grid place-items-center p-8 text-center text-sm text-flesh"
        >
          Questo browser non ha WebGL2: lo studio non può disegnare il tessuto.
        </p>
      </div>

      <div className="max-h-[48dvh] shrink-0 space-y-4 overflow-y-auto overscroll-contain border-t border-bone/10 px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] landscape:max-h-none landscape:w-[22rem] landscape:border-t-0 landscape:border-l">
        <Group label="Formato">
          <div className="grid grid-cols-4 gap-1.5">
            {FORMATS.map((x, i) => (
              <Chip key={x.id} on={s.format === i} onClick={() => up({ format: i })}>
                <span className="block">{x.label}</span>
                <span className="block font-mono text-[10px] opacity-70">{x.ratio}</span>
              </Chip>
            ))}
          </div>
        </Group>

        <Group label="Slide">
          <div className="flex items-center gap-2">
            <Chip
              aria-label="Una slide in meno"
              disabled={s.slides <= 1}
              onClick={() => up({ slides: Math.max(1, s.slides - 1) })}
            >
              −
            </Chip>
            <span className="w-6 text-center font-mono">{s.slides}</span>
            <Chip
              aria-label="Una slide in più"
              disabled={s.slides >= MAX_SLIDES}
              onClick={() => up({ slides: Math.min(MAX_SLIDES, s.slides + 1) })}
            >
              +
            </Chip>
            <span className="ml-auto text-right font-mono text-[10px] leading-tight text-bone/60">
              {s.slides > 1 ? "carosello: un'immagine divisa in" : "immagine singola"}
              <br />
              {s.slides} × {f.w}×{f.h} px
            </span>
          </div>
        </Group>

        <div className="grid grid-cols-2 gap-1.5">
          <Chip on={s.invert} onClick={() => up({ invert: !s.invert })}>
            Inverti colori
          </Chip>
          <Chip on={s.sealed} onClick={() => up({ sealed: !s.sealed })}>
            Chiudi l&apos;organo
          </Chip>
        </div>

        <Slider
          label="Crescita"
          shown={`${Math.round(s.growth * 100)}%`}
          min={0.02}
          max={1}
          step={0.005}
          value={s.growth}
          onChange={(v) => up({ growth: v })}
        />
        <Slider
          label="Spessore linee"
          shown={`${s.thick.toFixed(2)}×`}
          min={0.5}
          max={2.5}
          step={0.05}
          value={s.thick}
          onChange={(v) => up({ thick: v })}
        />
        <Slider
          label="Velo per il testo"
          shown={`${Math.round(s.veil * 100)}%`}
          min={0}
          max={0.95}
          step={0.01}
          value={s.veil}
          onChange={(v) => up({ veil: v })}
        />

        <Group label="Inquadra">
          <div className="grid grid-cols-3 gap-1.5">
            <Chip onClick={() => engine.current?.frame("discesa")}>Discesa</Chip>
            <Chip onClick={() => engine.current?.frame("tutto")}>Tutto</Chip>
            <Chip onClick={() => engine.current?.frame("dritto")}>Raddrizza</Chip>
          </div>
        </Group>

        <div className="space-y-1.5">
          <button
            type="button"
            disabled={busy !== null}
            onClick={run}
            className="w-full rounded-md bg-viola py-3 text-sm font-semibold uppercase tracking-wider disabled:opacity-60"
          >
            {busy ?? (s.slides > 1 ? `Esporta ${s.slides} immagini` : "Esporta immagine")}
          </button>
          {error && <p className="text-xs text-flesh">{error}</p>}
        </div>
      </div>

      {shots && (
        <div
          role="dialog"
          aria-modal
          aria-label="Immagini pronte"
          className="fixed inset-0 z-50 flex flex-col bg-carbon/95 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-2">
            <p className="font-mono text-xs uppercase tracking-widest text-bone/70">
              {shots.length === 1 ? "1 immagine pronta" : `${shots.length} immagini pronte`}
            </p>
            <button type="button" onClick={close} className="font-mono text-xs uppercase tracking-widest">
              Chiudi
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center gap-2 overflow-x-auto px-4 py-2">
            {shots.map((x, i) => (
              <a
                key={x.url}
                href={x.url}
                download={x.file.name}
                className="relative h-full max-h-[62dvh] shrink-0"
                style={{ aspectRatio: `${f.w} / ${f.h}` }}
              >
                {/* A blob URL: there is nothing for next/image to optimise. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={x.url} alt={`Slide ${i + 1}`} className="h-full w-full object-contain" />
                {shots.length > 1 && (
                  <span className="absolute left-1 top-1 rounded bg-carbon/80 px-1.5 font-mono text-[11px]">
                    {pad2(i + 1)}
                  </span>
                )}
              </a>
            ))}
          </div>
          <div className="grid gap-2 px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {canShare && (
              <button
                type="button"
                onClick={share}
                className="w-full rounded-md bg-viola py-3 text-sm font-semibold uppercase tracking-wider"
              >
                Salva in Foto / Condividi
              </button>
            )}
            <button
              type="button"
              onClick={downloadAll}
              className="w-full rounded-md border border-bone/30 py-3 text-sm font-semibold uppercase tracking-wider"
            >
              {shots.length > 1 ? "Scarica tutte (numerate)" : "Scarica"}
            </button>
            <p className="text-center font-mono text-[10px] text-bone/50">
              Tocca un&apos;immagine per scaricare solo quella.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="font-mono text-[10px] uppercase tracking-widest text-bone/50">{label}</p>
      {children}
    </div>
  );
}

function Chip({
  on,
  children,
  ...rest
}: { on?: boolean; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`min-h-10 min-w-10 rounded-md border px-2 py-1.5 text-xs leading-tight transition-colors disabled:opacity-30 ${
        on ? "border-viola bg-viola text-bone" : "border-bone/20 bg-transparent text-bone/85"
      }`}
      {...rest}
    >
      {children}
    </button>
  );
}

function Slider({
  label,
  shown,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  shown: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="flex justify-between font-mono text-[10px] uppercase tracking-widest text-bone/50">
        <span>{label}</span>
        <span className="text-bone/80">{shown}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-viola"
      />
    </label>
  );
}
