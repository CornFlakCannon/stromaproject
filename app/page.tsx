"use client";

import { DevHud, ScrollShell } from "@/app/scrollkit";
import { useMounted } from "./components/useMounted";
import KeyboardNav from "./components/KeyboardNav";
import StromaCanvas from "./components/StromaCanvas";
import TopBar from "./components/TopBar";
import ChiSiamo from "./components/sections/ChiSiamo";
import Contatto from "./components/sections/Contatto";
import Hero from "./components/sections/Hero";
import Manifesto from "./components/sections/Manifesto";
import Opere from "./components/sections/Opere";
import Galleria from "./components/sections/Galleria";

/**
 * Six panels, one organism. Every direct child of ScrollShell is a full
 * viewport panel — except the canvas, which is `fixed`, and the three overlays,
 * which portal to <body> or render nothing at all.
 *
 * The page moves in BLOCKS (`step`): one wheel click or one swipe is one panel,
 * further input is ignored while the panel arrives and its contents settle, and
 * the whole trip takes the one duration below — the only knob for "how fast the
 * site feels". See the step mode in scrollkit/core/ScrollShell.tsx.
 *
 * The manifesto is not the sixth panel: it arrives sideways out of panel 1,
 * as a card in the top layer (components/ManifestoAside.tsx), so reading it
 * costs no scroll and moves no counter.
 *
 * "use client" is not optional here: `ease` and the anim specs are functions and
 * arrays that cannot cross the server boundary as props.
 */
export default function Page() {
  // The HUD overlaps the nav, so it is opt-in with ?hud rather than always-on.
  const mounted = useMounted();
  const hud =
    process.env.NODE_ENV === "development" &&
    mounted &&
    new URLSearchParams(window.location.search).has("hud");

  return (
    <ScrollShell step={1400}>
      <StromaCanvas />

      <Hero index={0} />
      <Manifesto index={1} />
      <ChiSiamo index={2} />
      <Opere index={3} />
      <Galleria index={4} />
      <Contatto index={5} />

      <TopBar />
      <KeyboardNav />
      {hud && <DevHud />}
    </ScrollShell>
  );
}
