/**
 * Every word on the site, in both languages, plus the contact details and the
 * gallery manifest. One file so a change of address or a new work is a one-stop
 * edit — nothing here is duplicated inside a component.
 */

import { FRAMMENTI, POESIE, RACCONTI, ROMANZI } from "./testi";

/** A bilingual string. Rendered by <T> as two spans; CSS shows one. */
export type Copy = { it: string; en: string };

export const CONTACT = {
  email: "stroma.production@gmail.com",
  /* Instagram is off the page for now (sections/Contatto): back in when the
     collective's handle exists. */
  // instagram: "stroma",
  // instagramUrl: "https://instagram.com/stroma",
} as const;
/* ─────────────────────────────────────────────────────────────────────────── */

export const NAV: { label: Copy; target: number }[] = [
  { label: { it: "Manifesto", en: "Manifesto" }, target: 1 },
  { label: { it: "Chi siamo", en: "Who we are" }, target: 2 },
  { label: { it: "Opere", en: "Works" }, target: 3 },
  { label: { it: "Galleria", en: "Gallery" }, target: 4 },
  { label: { it: "Contatto", en: "Contact" }, target: 5 },
];

/** The phone's menu (TopBar): the burger's name and the way out of the panel. */
export const MENU = {
  name: { it: "Menu", en: "Menu" } satisfies Copy,
  close: { it: "Chiudi", en: "Close" } satisfies Copy,
};

export const HERO = {
  seed: {
    it: '"Ciò che costituisce la trama fondamentale o la matrice di sostegno di un organo, di un tessuto o di una cellula."',
    en: '"What constitutes the fundamental loom or the sustaining matrix of an organ, a tissue or a cell"',
  } satisfies Copy,
  scroll: { it: "Scorri", en: "Scroll" } satisfies Copy,
};

export const MANIFESTO = {
  eyebrow: { it: "", en: "" } satisfies Copy,
  /** The headline, split so the two halves can arrive on different beats. */
  headline: [
    { it: "Leggi il nostro", en: "If you got" },
    { it: "manifesto", en: "this far, listen" },
  ] satisfies Copy[],
  /* TODO — copy definitiva. Una riga sola: il senso della parola, non il manifesto.
     Il testo lungo è la tavola in MANIFESTO_PAGE.image, sotto. */
  teaser: {
    it: "Stroma è un",
    en: "Stroma is the",
  } satisfies Copy,
  teaser_emphasis: {
    it: " percorso",
    en: " path",
  },
  teaser_rest: {
    it: ", la trama del nostro organismo",
    en: ", the loom of our organism",
  },
  cta: { it: "Leggi il manifesto", en: "Read the manifesto" } satisfies Copy,
};

/**
 * The manifesto itself. The panel on the home page is a taste; this is the text,
 * read in the card that slides in beside that panel (ManifestoAside) — and the
 * text is a PLATE, not copy: it was set by hand as one SVG, white ink on
 * nothing, type outlined to paths, with its own title set into it — so the card shows the picture and
 * nothing else, and content.ts carries only the caption and the close. The
 * words themselves live in manifesto.md at the repo root.
 */
export const MANIFESTO_PAGE = {
  image: {
    src: "/MANIFESTION.svg",
    /** What a screen reader gets instead of the picture. */
    alt: {
      it: "Il manifesto di STROMA, composto a mano su una tavola.",
      en: "The STROMA manifesto, typeset by hand on a single plate.",
    } satisfies Copy,
  },
  close: { it: "Chiudi", en: "Close" } satisfies Copy,
};

/**
 * A founder. `name` is deliberately not bilingual — a name is a name.
 *
 * All three photographs exist, and `photo` stays optional anyway: a fourth name
 * can arrive before their portrait does without next/image 404ing on a file
 * that isn't there and leaving a broken box. Until the field is filled, the
 * card draws that founder's initial instead. Dropping the file into
 * public/people/ and filling this in is the whole handover — no component
 * changes. Portrait 3:4, at least 900×1200, EXIF rotation baked into the pixels
 * and the metadata stripped. Nothing recolours it downstream, so framing and
 * light are on the photograph.
 */
export type Founder = {
  /** Also the photo's filename: public/people/<id>.jpg */
  id: string;
  name: string;
  role: Copy;
  photo?: { src: string; width: number; height: number };
  bio: Copy;
  /** Three to five lines. Not a CV — the parts of one that matter here. */
  cv: Copy[];
};

/* TODO — copy definitiva: ruolo, bio e percorso di ciascuno. Il ruolo è la riga
   che compare passando sopra la foto, quindi è il posto per la disciplina di
   ognuno, non per la carica. */
export const CHI_SIAMO = {
  eyebrow: { it: "Chi siamo", en: "Who we are" } satisfies Copy,
  headline: [
    { it: "I volti che", en: "The faces" },
    { it: "lo animano", en: "behind it" },
  ] satisfies Copy[],
  hint: { it: "Apri la scheda", en: "Open a card" } satisfies Copy,
  items: [
    {
      id: "mattia",
      name: "Mattia Dagli Orti",
      role: { it: "Fondatore", en: "Founder" },
      photo: { src: "/people/mattia.jpg", width: 1200, height: 1600 },
      bio: {
        it: "La possibilità dell'arte si nasconde nella capacità dell'autore di coincidere con il medium che sceglie.",
        en: "The possibility of art hides in the author's ability to coincide with the chose medium.",
      },
      cv: [
        {
          it: "Lettere Moderne e Scienze delle Religioni tracciano alcune tappe della mia formazione.",
          en: "'Lettere Moderne' e 'Scienze delle Religioni' tracciano alcune tappe della mia formazione.",
        },
        {
          it: "Eclettico autodidatta, accetto sfide che mi spingono al di fuori delle mie competenze coinvolgendo teatro, programmazione, matematica, arte visiva digitale, arte generativa.",
          en: "Eclettico autodidatta, accetto sfide che mi spingono al di fuori delle mie competenze coinvolgendo teatro, programmazione, matematica, arte visiva digitale, arte generativa.",
        },
      ],
    },
    {
      id: "alexandra",
      name: "Alexandra Frabetti",
      role: { it: "Fondatrice", en: "Founder" },
      photo: { src: "/people/alexandra.jpg", width: 1200, height: 1600 },
      bio: {
        it: "I am wearing dark glasses today because I am seeing the future and it's looking very bright.",
        en: "I am wearing dark glasses today because I am seeing the future and it's looking very bright.",
      },
      cv: [
        {
          it: "Psicologa di formazione, regista per vocazione, appassionata di politica, cinema e giustizia sociale.",
          en: "Psicologa di formazione, regista per vocazione, appassionata di politica, cinema e giustizia sociale.",
        },
        {
          it: "Amo navigare luoghi d'apprendimento inclusivi e creare enpowerment per comunità diversificate attraverso progetti collaborativi.",
          en: "Amo navigare luoghi d'apprendimento inclusivi e creare enpowerment per comunità diversificate attraverso progetti collaborativi.",
        },
      ],
    },
    /* Ted è fuori dalla lista per ora — da riaggiungere dopo una data futura,
       scommentando e rimettendo la foto in public/people/ted.jpg (tolta perché
       tutto ciò che sta in public/ viene pubblicato; è nella storia del repo
       privato d'archivio). La griglia di ChiSiamo conta le colonne da sola. */
    // {
    //   id: "ted",
    //   name: "Ted Alushani",
    //   role: { it: "Fondatore", en: "Founder" },
    //   photo: { src: "/people/ted.jpg", width: 1200, height: 1600 },
    //   bio: {
    //     it: "Chi non crede alle storie non piange.",
    //     en: "Those who do not believe in stories do not cry.",
    //   },
    //   cv: [
    //     { it: "TODO — formazione", en: "TODO — education" },
    //     { it: "TODO — esperienza principale", en: "TODO — main experience" },
    //     { it: "TODO — un lavoro di cui va fiero", en: "TODO — one work they are proud of" },
    //     { it: "TODO — che cosa porta al gruppo", en: "TODO — what they bring to the group" },
    //   ],
    // },
  ] satisfies Founder[],
  close: { it: "Chiudi", en: "Close" } satisfies Copy,
  percorso: { it: "Percorso", en: "Path" } satisfies Copy,
};

/** One concept image in the Galleria strip. Not a project — see `Project` below. */
/** One photograph, at the pixel size of the file in public/. No caption: the
 *  gallery and the backstage are looked at, not read, and the counter under
 *  the player is the only word beside them. */
export type Photo = { src: string; width: number; height: number };

/**
 * The register, shown rather than stated: the collective at work, one
 * photograph at a time. They used to sit under the Opere heading; Opere is the
 * work now, and this is the gallery beside it.
 *
 * The files are the masters in ~/Desktop/PROGRAMMING/stroma_assets/GALLERY/
 * (kept outside the repo) reduced to 1800px on the long side; next/image cuts
 * the srcset from these. The order of `items` is the order of the player —
 * shuffled by hand, so no two of a kind sit side by side. DSC09144 (the two in
 * the kitchen) is turned a quarter clockwise on purpose: the wall is the floor.
 */
export const GALLERIA = {
  eyebrow: { it: "Galleria", en: "Gallery" } satisfies Copy,
  note: { it: "Fotografie", en: "Photographs" } satisfies Copy,
  /** The word in front of the player's counter: "Foto 1 / 18". */
  photo: { it: "Foto", en: "Photo" } satisfies Copy,
  items: [
    { src: "/media/galleria/dsc00794.webp", width: 1800, height: 1200 },
    {
      src: "/media/galleria/po-lines-3840x2160.webp",
      width: 1800,
      height: 1013,
    },
    { src: "/media/galleria/dsc09144.webp", width: 1800, height: 1200 },
    {
      src: "/media/galleria/colombari-rappresentazione.webp",
      width: 1600,
      height: 1314,
    },
    { src: "/media/galleria/p1110721.webp", width: 1800, height: 1352 },
    { src: "/media/galleria/dsc00963.webp", width: 1800, height: 1200 },
    { src: "/media/galleria/dsc07902.webp", width: 1800, height: 1200 },
    { src: "/media/galleria/stroma2.webp", width: 996, height: 660 },
    { src: "/media/galleria/dsc09743.webp", width: 1800, height: 1200 },
    { src: "/media/galleria/dsc00324.webp", width: 1800, height: 1200 },
    {
      src: "/media/galleria/po-lines-2160x3840.webp",
      width: 1013,
      height: 1800,
    },
    { src: "/media/galleria/dsc09686.webp", width: 1800, height: 1200 },
    { src: "/media/galleria/dsc01016.webp", width: 1800, height: 1200 },
    { src: "/media/galleria/p1110820.webp", width: 1800, height: 1352 },
    { src: "/media/galleria/dsc09912.webp", width: 1800, height: 1200 },
    { src: "/media/galleria/dsc07679.webp", width: 1616, height: 1080 },
    {
      src: "/media/galleria/po-lines-4320x7680.webp",
      width: 1013,
      height: 1800,
    },
    { src: "/media/galleria/dsc00913.webp", width: 1800, height: 1200 },
  ] satisfies Photo[],
};

/**
 * A single project, and the page at /opere/<category>/<project>.
 *
 * `cover` is optional for the same reason `Founder.photo` is: the pictures do
 * not exist yet, and next/image pointed at a missing file 404s and leaves a
 * broken box. Without one, ProjectCard draws its own typographic placeholder —
 * dropping the file in and filling this field is the whole handover.
 */
export type Project = {
  /** The URL segment inside its category. TODO — these are placeholders, and a
   *  slug is a public address: rename them with the projects' real names before
   *  anything is shared. */
  slug: string;
  title: Copy;
  /** Who made it, as a line under the title on the project's page. Names, so
   *  not bilingual — the same rule as `Founder.name`. */
  author?: string;
  /** The line under the title: year, medium, whatever names the thing. */
  meta: Copy;
  /** The grid shows it in duotone; the project's page shows it whole, beside
   *  the text — a poster, a plate, whatever the work's own picture is.
   *  `position` is the CSS object-position of the grid card's 4:3 crop, for a
   *  picture whose subject is not at its centre; absent means centre. */
  cover?: { src: string; width: number; height: number; position?: string };
  /** The page's own prose: paragraphs, and — where a work is best shown
   *  mid-argument — a plate with its caption between them. */
  body: Block[];
  /**
   * A film. The object being here is what reserves the player on the page; the
   * link inside it can arrive later. `embed` is the URL an <iframe> plays —
   * `https://www.youtube-nocookie.com/embed/<id>`, `https://player.vimeo.com/video/<id>`,
   * or whatever another platform hands out as its embed address. `sources`
   * instead is a clip served from public/, in the order the browser should try
   * them, played muted on a loop — a trailer. Until one of the two is filled
   * the page holds the space and says so.
   */
  video?: { embed?: string; sources?: Source[] };
  /** Who made it, shown as a strip of faces under the text. */
  cast?: CastMember[];
  /**
   * A sequence the reader leafs through, one sheet at a time, under the prose
   * — see components/Leaves — with the sequence's own name and a few lines
   * about it above the sheets. The order of `items` is the order of the
   * pages. When a project carries leaves its `cover` serves the grid card
   * only: the sheets are already the work's own picture, and the page does not
   * repeat it beside the text.
   */
  leaves?: { title: Copy; intro: Copy[]; items: Plate[] };
  /**
   * The piece the page closes on, set apart at the foot: a clip on a loop and
   * the text of the work under it. `text` is not bilingual on purpose — a poem
   * is the work, and is no more translated than a name is. One string per
   * stanza, lines joined with "\n".
   */
  coda?: { title: Copy; sources: Source[]; text: string[] };
  /**
   * Texts read one at a time in a popup — see components/Testi — laid out
   * under the prose as a grid of titles, in one or more groups. A group with a
   * title gets a heading; one without none, for a page whose h1 already names
   * the lot. The order of `items` is the order of the grid.
   */
  testi?: TestoGroup[];
  /**
   * Photographs from the set, at the foot of the page, looked at one at a time
   * — see components/Slides, the same player as the landing's gallery. The
   * order of `items` is the order of the player.
   */
  backstage?: { title: Copy; items: Photo[] };
};

/** One text read in the popup. `text` is monolingual for the same reason as
 *  `coda.text`: one string per stanza or paragraph, lines joined with "\n". */
export type Testo = { title: Copy; text: string[] };

export type TestoGroup = { title?: Copy; items: Testo[] };

/** One <source> of a self-hosted clip: the file and its MIME type. */
export type Source = { src: string; type: string };

/**
 * One typeset sheet: the poet's PDF turned into a single vector SVG
 * (`pdftocairo -svg`, glyphs outlined to paths, no background — the same shape
 * as the manifesto's plate), shown on a white sheet at the page's own
 * proportions. The caption names it; on the page it is the line under it.
 */
export type Plate = {
  src: string;
  width: number;
  height: number;
  caption: Copy;
};

/** A block of a project's prose: a paragraph, a plate set between two, or a
 *  line quoted in the author's own voice, with the name it is quoted from. */
export type Block = Copy | { figure: Plate } | { quote: Copy; cite: string };

/**
 * One name in a project's cast. `photo` follows the same rule as
 * `Founder.photo`: absent means "draw the initial", never a file that 404s.
 * Square or portrait, the face near the middle — it is shown in a circle.
 */
export type CastMember = {
  name: string;
  /** What they did on this work: regia, fotografia, montaggio… */
  role: Copy;
  photo?: { src: string; width: number; height: number };
};

export type Category = { slug: string; name: Copy; projects: Project[] };

/* TODO — copy definitiva. Ogni progetto ha uno slug (che finisce nell'URL), un
   titolo, una riga di meta e i paragrafi della sua pagina. Aggiungerne uno qui
   crea la sua route: non c'è nient'altro da toccare. */
/** TENEBRE, the clip: webm first (the smaller decode), mp4 for whoever lacks it. */
const TENEBRE_SOURCES: Source[] = [
  { src: "/media/orrori/tenebre.webm", type: "video/webm" },
  { src: "/media/orrori/tenebre.mp4", type: "video/mp4" },
];

/* The placeholder prose of a project that has none yet. Only the disciplines
   commented out below (immagini, suono) use it; back in with them. */
// const todoBody = (): Copy[] => [
//   {
//     it: "TODO — che cos'è il progetto, in due o tre righe.",
//     en: "TODO — what the project is, in two or three lines.",
//   },
//   {
//     it: "TODO — come è nato, con chi, e che cosa ci lega.",
//     en: "TODO — how it came about, with whom, and what ties us to it.",
//   },
// ];

/**
 * The work, by discipline. Four words on the panel; clicking one drops the other
 * three, makes it the heading, and opens its grid — see components/sections/Opere.
 */
export const OPERE = {
  eyebrow: { it: "Opere", en: "Works" } satisfies Copy,
  hint: { it: "Scegli una disciplina", en: "Pick a discipline" } satisfies Copy,
  back: { it: "Tutte le opere", en: "All works" } satisfies Copy,
  empty: { it: "In costruzione", en: "Under construction" } satisfies Copy,
  /** The way out of a project's own page: back to the Opere panel with the
   *  same discipline open (`/#opere/<categoria>`, see app/lib/opereHash.ts),
   *  so it promises the section it actually lands on. */
  toWorks: { it: "Torna alle opere", en: "Back to works" } satisfies Copy,
  /** What the reserved player says while a project's `video.embed` is missing. */
  soon: { it: "Prossimamente", en: "Coming soon" } satisfies Copy,
  /** The eyebrow over a project's strip of faces. */
  cast: { it: "Cast", en: "Cast" } satisfies Copy,
  /** The two arrows of a pager — the leaves' reader (components/Leaves) and
   *  the text popup (components/TestoDialog) — and the word in front of each
   *  one's counter: "Foglio 1 / 5", "Pagina 1 / 5". */
  prev: { it: "Indietro", en: "Back" } satisfies Copy,
  next: { it: "Avanti", en: "Forward" } satisfies Copy,
  leaf: { it: "Foglio", en: "Leaf" } satisfies Copy,
  page: { it: "Pagina", en: "Page" } satisfies Copy,
  /** The full-screen view of one leaf (components/LeafLightbox): the name of
   *  the click that opens it, and its one control. */
  open: { it: "Apri a schermo intero", en: "Open full screen" } satisfies Copy,
  close: { it: "Chiudi", en: "Close" } satisfies Copy,
  /** The name of the click on a text's card (components/Testi). */
  read: { it: "Leggi", en: "Read" } satisfies Copy,
  categories: [
    {
      slug: "cinema",
      name: { it: "Cinema", en: "Cinema" },
      projects: [
        {
          slug: "i_giorni_della_vertigine",
          title: {
            it: "I GIORNI DELLA VERTIGINE",
            en: "I GIORNI DELLA VERTIGINE",
          },
          author: "Alexandra Frabetti, Mattia Dagli Orti",
          meta: { it: "Cortometraggio", en: "Short film" },
          /* The poster, reduced from the 4320×7680 master (kept outside the
             repo) to a web size: next/image cuts the srcset from this. The
             grid card shows its foot: the title sits mid-poster and a centred
             crop cut through the lettering. */
          cover: {
            src: "/media/vertigine-locandina.webp",
            width: 1600,
            height: 2844,
            position: "50% 100%",
          },
          body: [
            {
              it: "Quando ti sporgi dal quarto piano e guardi in basso una persona ha le stesse dimensioni di una formica. Ma la vertigine non è solo la nausea, le mani sudate pronte a mollare la presa da un istante all'altro... no, è una paura atavica: l'anticipazione della morte.",
              en: "Lean out from the fourth floor and look down: a person is the size of an ant. But vertigo is not only the nausea, the sweating hands ready to lose their grip from one moment to the next... no, it is an ancestral fear: the anticipation of death.",
            },
            {
              it: "\"I giorni della Vertigine\" vuole svelare il volto nascosto della quotidianità, affrontando le diverse forme che la vertigine sa assumere. La prigionia ci pervade sin nel profondo, ci stringe all'interno di quattro piccole mura e, fuori, in mura infinitamente più grandi, quelle di un sistema alienante che racchiude tutti noi all'interno di loculi.",
              en: '"I giorni della Vertigine" sets out to unveil the hidden face of everyday life, confronting the many forms vertigo can take. Captivity pervades us to the core: it holds us within four small walls and, outside, within walls infinitely larger, those of an alienating system that shuts each of us inside a burial niche.',
            },
            { it: "Ogni fuga è vana.", en: "Every escape is in vain." },
            {
              it: "Non ha importanza il luogo o il tempo, questa è una condizione che attanaglia tutti indistintamente. Abbiamo scelto le Colombare come simbolo di questo male che noi stessi viviamo in prima persona.",
              en: "Place and time make no difference: this is a condition that grips everyone alike. We chose the Colombare, the columbaria, as the symbol of an ailment we ourselves live through first-hand.",
            },
          ],
          /* TODO — il link del corto: `embed` con l'URL da incorporare
             (youtube-nocookie.com/embed/<id>, player.vimeo.com/video/<id>…).
             Finché manca, il player dice "Prossimamente". */
          video: { embed: "https://www.youtube-nocookie.com/embed/_TyAzsLyIlg?si=4_ojxuytJoEpaiew" },
          /* The faces are square crops in public/people/cast/, cut around the
             face with some air from the masters in stroma_assets/ (the two
             founders and Ted from the portraits already in public/people/,
             Morgan from the gallery's DSC00963, Noemi the one on the right in
             DSC09272). */
          cast: [
            {
              name: "Mattia Dagli Orti",
              role: { it: "Director, actor", en: "Director, actor" },
              photo: {
                src: "/people/cast/mattia.webp",
                width: 800,
                height: 800,
              },
            },
            {
              name: "Alexandra Frabetti",
              role: { it: "Director, actor", en: "Director, actor" },
              photo: {
                src: "/people/cast/alexandra.webp",
                width: 800,
                height: 800,
              },
            },
            {
              name: "Morgan Bonanno",
              role: { it: "Actor", en: "Actor" },
              photo: {
                src: "/people/cast/morgan.webp",
                width: 800,
                height: 800,
              },
            },
            {
              name: "Nicola Brescacin",
              role: {
                it: "Director of photography, camera operator",
                en: "Director of photography, camera operator",
              },
              photo: {
                src: "/people/cast/nicola.webp",
                width: 800,
                height: 800,
              },
            },
            {
              name: "Ted Alushani",
              role: {
                it: "Sound design, boom operator",
                en: "Sound design, boom operator",
              },
              photo: { src: "/people/cast/ted.webp", width: 800, height: 800 },
            },
            {
              name: "Emma Berto",
              role: {
                it: "Additional gaffer",
                en: "Sound design, boom operator",
              },
              photo: { src: "/people/cast/emma.webp", width: 800, height: 800 },
            },
            {
              name: "Giovanni Barresi",
              role: {
                it: "Gaffer, camera operator",
                en: "Gaffer, camera operator",
              },
              photo: {
                src: "/people/cast/giovanni.webp",
                width: 800,
                height: 800,
              },
            },
            {
              name: "Matilde Bosco",
              role: {
                it: "Continuity supervisor",
                en: "Continuity supervisor",
              },
              photo: {
                src: "/people/cast/matilde.webp",
                width: 800,
                height: 800,
              },
            },
            {
              name: "Noemi Belluzzo",
              role: {
                it: "Continuity supervisor, backstage photography",
                en: "Continuity supervisor, backstage photography",
              },
              photo: {
                src: "/people/cast/noemi.webp",
                width: 800,
                height: 800,
              },
            },
            {
              name: "Andrea Berardi",
              role: {
                it: "Backstage photography",
                en: "Backstage photography",
              },
              photo: {
                src: "/people/cast/andrea.webp",
                width: 800,
                height: 800,
              },
            },
            {
              name: "Lucia Meroni",
              role: { it: "Catering", en: "Catering" },
              photo: {
                src: "/people/cast/lucia.webp",
                width: 800,
                height: 800,
              },
            },
            {
              name: "Sebastiano Scapinello",
              role: {
                it: "Microfonista aggiunto",
                en: "Additional boom operator",
              },
              photo: {
                src: "/people/cast/sebastiano.webp",
                width: 800,
                height: 800,
              },
            },
            {
              name: "Gianmarco Dolino",
              role: {
                it: "Additional boom operator",
                en: "Additional boom operator",
              },
              photo: {
                src: "/people/cast/gianmarco.webp",
                width: 800,
                height: 800,
              },
            },
          ],
          /* From the set. The masters are in stroma_assets/BACKSTAGE/ (outside
             the repo), reduced to 1800px on the long side. */
          backstage: {
            title: { it: "Backstage", en: "Backstage" },
            items: [
              {
                src: "/media/backstage/2025-06-01.webp",
                width: 1800,
                height: 855,
              },
              {
                src: "/media/backstage/ad-carnem-redeo.webp",
                width: 1800,
                height: 1273,
              },
              {
                src: "/media/backstage/dsc00642.webp",
                width: 1800,
                height: 1200,
              },
              {
                src: "/media/backstage/dsc00938.webp",
                width: 1800,
                height: 1200,
              },
              {
                src: "/media/backstage/dsc07640.webp",
                width: 1616,
                height: 1080,
              },
              {
                src: "/media/backstage/dsc07684.webp",
                width: 1616,
                height: 1080,
              },
              {
                src: "/media/backstage/dsc07838.webp",
                width: 1800,
                height: 1200,
              },
              {
                src: "/media/backstage/dsc09145.webp",
                width: 1800,
                height: 1200,
              },
              {
                src: "/media/backstage/dsc09163.webp",
                width: 1800,
                height: 1200,
              },
              {
                src: "/media/backstage/dsc09377.webp",
                width: 1800,
                height: 1200,
              },
              {
                src: "/media/backstage/dsc09875.webp",
                width: 1800,
                height: 1200,
              },
              {
                src: "/media/backstage/dsc09938.webp",
                width: 1800,
                height: 1200,
              },
              {
                src: "/media/backstage/p1110826.webp",
                width: 1800,
                height: 1352,
              },
              {
                src: "/media/backstage/p1120036.webp",
                width: 1800,
                height: 1352,
              },
            ],
          },
        },
      ],
    },
    {
      slug: "scrittura",
      name: { it: "Scrittura", en: "Writing" },
      projects: [
        {
          slug: "opere-verbo-visuali",
          title: { it: "Opere verbo-visuali", en: "Verbo-visual works" },
          author: "Mattia Dagli Orti",
          /* TODO — copy definitiva della riga sotto il titolo. */
          meta: { it: "Poesia visiva", en: "Visual poetry" },
          /* The grid card only (see `leaves` on Project): one frame of TENEBRE
             at 2 s, cropped 4:3 around the eye and its black point at the
             clip's own pixels — the whole frame shrunk to a card went to mush. */
          cover: {
            src: "/media/orrori/tenebre-eye.webp",
            width: 1000,
            height: 750,
          },
          /* TENEBRE as the trailer, the same clip the page closes on. */
          video: { sources: TENEBRE_SOURCES },
          body: [
            {
              it: "Opera verbo-visuale è di per sé una provocazione. La parola suscita l'immagine e l'immagine spesso suscita la parola. L'opposta tendenza di queste due direttrici apre un campo d'azione dove i contrasti e le sinergie si accentuano vicendevolmente, diramando sentieri imprevisti e nuove frontiere espressive. La parola viene scomposta, il linguaggio decostruito, la forma dissezionata e si osa la creazione di un nuovo organismo ibrido, con logiche proprie e nuove significazioni.",
              en: "A verbo-visual work is a provocation in itself. The word calls up the image, and the image often calls up the word. The opposite pull of these two lines opens a field of action where contrasts and synergies sharpen one another, branching into unforeseen paths and new expressive frontiers. The word is taken apart, language deconstructed, form dissected, and a new hybrid organism is dared into being, with a logic of its own and new meanings.",
            },
            {
              figure: {
                src: "/media/orrori/frammento-2.svg",
                width: 595,
                height: 842,
                caption: {
                  it: "Quando? — estratto da Frammenti di Orrori",
                  en: "Quando? — from Frammenti di Orrori",
                },
              },
            },
            {
              it: 'L\'esito è un linguaggio che si avviluppa attorno a sé stesso e si apre al contempo, riferendosi alle parole di cui è composto, alle lettere da cui sono composte le parole stesse e alla condizione umana del lettore. Così si pone, irrisolto, il problema grammatologico di un mondo come testo e una caduta di soggetto-oggetto tra lettore e testo letto, in un annientamento del "Gegenstand" come oggetto che sta contro il soggetto.',
              en: 'The outcome is a language that coils around itself and opens up at the same time, referring to the words it is made of, to the letters those words are made of, and to the human condition of the reader. So the grammatological problem of a world as text is posed, and left unresolved, together with a collapse of subject and object between the reader and the text being read, in an annihilation of the "Gegenstand" as the object that stands against the subject.',
            },
            {
              figure: {
                src: "/media/orrori/frammento-1.svg",
                width: 595,
                height: 842,
                caption: {
                  it: "Chi? — estratto da Frammenti di Orrori",
                  en: "Chi? — from Frammenti di Orrori",
                },
              },
            },
            {
              quote: {
                it: "Nelle mie opere cerco di sposare matematica, programmazione e linguaggio, cercando un nuovo canone inter-mediatico aperto a sperimentazioni",
                en: "In my works I try to wed mathematics, programming and language, in search of a new inter-media canon open to experimentation",
              },
              cite: "Mattia Dagli Orti",
            },
          ],
          /* The four sheets carry their own titles where they have one; the
             fourth is numbered. The sources are the four PDFs, kept outside the
             repo in ~/Desktop/PROGRAMMING/stroma_assets/orrori/. */
          leaves: {
            title: { it: "Frammenti di Orrori", en: "Frammenti di Orrori" },
            intro: [
              {
                it: 'Frammenti di Orrori sono dei componimenti estratti dalla raccolta inedita "Gli orrori" di Mattia Dagli Orti. Si tratta di opere verbo-visive statiche e in movimento dove si esplorano le relazioni tra forme e linguaggio in esperimenti testuali dove il verso, le parole, l\'io del lettore, vengono decostruiti e ricomposti in una catabasi dal sapore grammatologico ed esistenzialista.',
                en: 'Frammenti di Orrori are pieces drawn from the unpublished collection "Gli orrori" by Mattia Dagli Orti. They are verbo-visual works, still and in motion, exploring the relations between form and language in textual experiments where the verse, the words and the reader\'s I are taken apart and put back together in a katabasis of a grammatological and existentialist flavour.',
              },
            ],
            /* The questions first, in the order one asks them; then the rest. */
            items: [
              {
                src: "/media/orrori/frammento-1.svg",
                width: 595,
                height: 842,
                caption: { it: "Chi?", en: "Chi?" },
              },
              {
                src: "/media/orrori/frammento-2.svg",
                width: 595,
                height: 842,
                caption: { it: "Quando?", en: "Quando?" },
              },
              {
                src: "/media/orrori/dove.svg",
                width: 595,
                height: 842,
                caption: { it: "Dove?", en: "Dove?" },
              },
              {
                src: "/media/orrori/come.svg",
                width: 595,
                height: 842,
                caption: { it: "Come?", en: "Come?" },
              },
              {
                src: "/media/orrori/perche.svg",
                width: 595,
                height: 842,
                caption: { it: "Perché?", en: "Perché?" },
              },
              {
                src: "/media/orrori/quattro-morti.svg",
                width: 595,
                height: 842,
                caption: { it: "Quattro morti", en: "Quattro morti" },
              },
              {
                src: "/media/orrori/frammento-3.svg",
                width: 595,
                height: 842,
                caption: { it: "Stroma", en: "Stroma" },
              },
              {
                src: "/media/orrori/frammento-4.svg",
                width: 595,
                height: 842,
                caption: { it: "Frammento IV", en: "Fragment IV" },
              },
            ],
          },
          coda: {
            title: { it: "Tenebre", en: "Tenebre" },
            sources: TENEBRE_SOURCES,
            text: [
              "Andai, tornai, e fu così per ore,\ne tenebre nel mio cuore.",
              "Tornai in una livida coltre,\nandai lontano, poi mi spinsi oltre,\noltre gli un tempo frequentati bivi,\ndove si parla senza niente dire\ndove sta immobile la gente\ncome in un campo\ngli ulivi.",
              "M’accolsero amene\nattorno le più molli tenebre\ne di là dei colli il celebre\nastro celermente eccelse\nsulle celesti nebbie.",
              "Ed io tornai, ma mai senza terrore\ne tenebre nel mio cuore.",
              "Seppi nella mia torre\nlàtere per lunghi giorni\nl’ombra del verbo.\nSe il nostro dire ai suoi dintorni aperto\nha un silenzio in serbo\nè un silenzio di eterni ritorni.",
              "E ritorno in una livida coltre\nDov’è tutto indiviso.\nMuto traggo i miei doni votivi.\nÈ l’ombra del mio viso\nla mia faccia\ncome ogni foto è traccia\ndi negativi.",
              "Non c’è luogo ove io trovi parole\ne tenebre nel mio sole.",
            ],
          },
        },
        {
          slug: "poesie",
          title: { it: "Poesie", en: "Poems" },
          author: "Mattia Dagli Orti",
          /* TODO — copy definitiva della riga sotto il titolo. */
          meta: { it: "Raccolta inedita", en: "Unpublished collection" },
          body: [
            {
              it: "L'esplorazione dell'autore, parallelamente alle sperimentazioni verbo-visuali, si espande anche in una direzione più classica, rifacendosi a forme metriche tradizionali come il sonetto, senza abbandonare la possibilità del verso libero.",
              en: "Alongside the verbo-visual experiments, the author's exploration also reaches in a more classical direction, returning to traditional metrical forms such as the sonnet without giving up the possibility of free verse.",
            },
            {
              it: "I temi vanno dalla domanda sulla possibilità della poesia oggi alla meditazione sulla morte, rimandi che accomunano questa ricerca alle sperimentazioni verbo-visuali con cui si contendono il posto all'interno della raccolta inedita \"Frammenti d'Orrori\".",
              en: 'The themes run from the question of whether poetry is possible today to a meditation on death — echoes this research shares with the verbo-visual experiments it vies with for a place in the unpublished collection "Frammenti d\'Orrori".',
            },
          ],
          testi: [{ items: POESIE }],
        },
        {
          slug: "prosa",
          title: { it: "Prosa", en: "Prose" },
          author: "Mattia Dagli Orti",
          /* TODO — copy definitiva della riga sotto il titolo. */
          meta: {
            it: "Scritti in libertà",
            en: "Fragments, short stories and novels",
          },
          /* TODO — l'introduzione della sezione, da scrivere. */
          body: [
            {
              it: 'Rispetto ai "Frammenti d\'Orrori", dal registro strettamente poetico, gli "Scritti in Libertà" offrono una serie di episodi, scorci nuovamente frammentati, nella contemplazione attiva di una scrittura svincolata dal verso e dalla metrica, ma non per questo scevra dai toni esistenzialisti e dalla problematizzazione del linguaggio.',
              en: 'From the "Frammenti d\'Orrori", chanted through a poetic voice, "Writings in freedom" offers a series of episodes, sights over a fragmented landscape in the active contemplation of a writing free of metric and verses, but still dense with existentialist tones and the linguistic problem.',
            },
          ],
          testi: [
            { title: { it: "Frammenti", en: "Fragments" }, items: FRAMMENTI },
            {
              title: { it: "Scritti in libertà", en: "Short stories" },
              items: RACCONTI,
            },
            // { title: { it: "Romanzi", en: "Novels" }, items: ROMANZI },
          ],
        },
      ],
    },
    /* Off the wall for now: three placeholder projects and no pictures yet.
       Back in as soon as there is a series to show. */
    // {
    //   slug: "immagini",
    //   name: { it: "Immagini", en: "Images" },
    //   projects: [
    //     { slug: "progetto-uno", title: { it: "TODO — prima serie", en: "TODO — first series" }, meta: { it: "Fotografia", en: "Photography" }, body: todoBody() },
    //     { slug: "progetto-due", title: { it: "TODO — seconda serie", en: "TODO — second series" }, meta: { it: "Studio generativo", en: "Generative study" }, body: todoBody() },
    //     { slug: "progetto-tre", title: { it: "TODO — terza serie", en: "TODO — third series" }, meta: { it: "Illustrazione", en: "Illustration" }, body: todoBody() },
    //   ],
    // },
    // {
    //   slug: "suono",
    //   name: { it: "Suono", en: "Sound" },
    //   projects: [
    //     { slug: "progetto-uno", title: { it: "TODO — primo pezzo", en: "TODO — first piece" }, meta: { it: "Composizione", en: "Composition" }, body: todoBody() },
    //     { slug: "progetto-due", title: { it: "TODO — secondo pezzo", en: "TODO — second piece" }, meta: { it: "Field recording", en: "Field recording" }, body: todoBody() },
    //     { slug: "progetto-tre", title: { it: "TODO — terzo pezzo", en: "TODO — third piece" }, meta: { it: "Dal vivo", en: "Live" }, body: todoBody() },
    //   ],
    // },
  ] satisfies Category[],
};

/** Find a project by the two URL segments. Returns null for an address that
 *  names nothing, which the route turns into a 404. */
export function findProject(
  categoria: string,
  slug: string,
): { category: Category; project: Project } | null {
  // Widened on purpose: `satisfies` keeps each category's literal shape, and
  // the optional fields only some projects carry would otherwise vanish from
  // the union the page reads.
  const category: Category | undefined = OPERE.categories.find(
    (c) => c.slug === categoria,
  );
  const project = category?.projects.find((p) => p.slug === slug);
  return category && project ? { category, project } : null;
}

export const CONTATTO = {
  eyebrow: {
    it: "Facci sentire chi sei",
    en: "Let us hear who you are",
  } satisfies Copy,
  headline: [
    { it: "Costruiamo", en: "Let's build" },
    { it: "un organo", en: "a new organ" },
  ] satisfies Copy[],
  lead: {
    it: "che pulsi per l'arte e la vita.",
    en: "that beats for art and for life.",
  } satisfies Copy,
  emailLabel: { it: "Scrivici", en: "Write to us" } satisfies Copy,
  subject: { it: "Sono qui", en: "I am here" } satisfies Copy,
};
