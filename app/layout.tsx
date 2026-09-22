import type { Metadata, Viewport } from "next";
import { Archivo, Geist_Mono, Instrument_Serif } from "next/font/google";
import { LANG_BOOT } from "./lang";
import "./globals.css";

/* The display face carries a width axis (wdth 62–125) as well as weight, and the
   whole type system rides it: headlines expanded, lists condensed, one family. */
const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
});

/* The voice — used only for the manifesto and the word *creativi*. */
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "STROMA",
  description:
    "STROMA è il tessuto dei nostri organi. Sogniamo che diventi il tessuto di un corpo più grande di noi: un tessuto di creativi.",
  openGraph: {
    title: "STROMA",
    description: "Costruiamo assieme un nuovo organo che pulsi per l'arte e la vita.",
    locale: "it_IT",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#050505",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="it"
      data-lang="it"
      /* The boot script below rewrites lang and data-lang before React sees the
         document; without this React reports the difference as a mismatch. */
      suppressHydrationWarning
      className={`${archivo.variable} ${instrumentSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOT }} />
      </head>
      <body className="min-h-full bg-carbon text-bone">{children}</body>
    </html>
  );
}
