/**
 * A "date taken" for a JPEG, so a phone's gallery files a carousel in order.
 *
 * Galleries sort by the EXIF DateTimeOriginal a photo carries and fall back to
 * the time the file was saved. A canvas export carries no EXIF, and the slides
 * of one export are all saved within the same second — the share sheet saves
 * them at once — so the gallery broke the tie however it liked and the stories
 * came out shuffled. Each slide gets its own capture time instead, one second
 * apart, in slide order.
 *
 * JPEG and not PNG because DateTimeOriginal in a JPEG is what both iOS Photos
 * and Android's media store are documented to read; a date inside a PNG is not
 * read reliably by either. Instagram re-encodes every upload to JPEG anyway.
 *
 * The segment written is the smallest valid one: a big-endian TIFF header,
 * IFD0 with DateTime and the pointer to the Exif IFD, and the Exif IFD with the
 * version, DateTimeOriginal, DateTimeDigitized and the zone of those times.
 */

const ASCII = 2;
const LONG = 4;
const UNDEFINED = 7;

/** One IFD entry: tag, TIFF type, and its value — a string for ASCII and
 *  UNDEFINED, a number for LONG. Entries go in ascending tag order. */
type Entry = [tag: number, type: number, value: string | number];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** EXIF's date form, in local time: `2026:11:18 14:32:05`. */
function exifDate(d: Date): string {
  return (
    `${d.getFullYear()}:${pad2(d.getMonth() + 1)}:${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

/** The zone `exifDate` is written in, `+01:00`, so a phone set to another zone
 *  still reads the right instant. */
function exifZone(d: Date): string {
  const m = -d.getTimezoneOffset();
  const a = Math.abs(m);
  return `${m < 0 ? "-" : "+"}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`;
}

/** The TIFF body of the EXIF segment. */
function tiff(when: Date): Uint8Array<ArrayBuffer> {
  const date = exifDate(when);
  const ifd0: Entry[] = [[0x0132, ASCII, date]]; // DateTime
  const exif: Entry[] = [
    [0x9000, UNDEFINED, "0232"], // ExifVersion 2.32
    [0x9003, ASCII, date], // DateTimeOriginal — what galleries sort by
    [0x9004, ASCII, date], // DateTimeDigitized
    [0x9011, ASCII, exifZone(when)], // OffsetTimeOriginal
  ];
  const size = (n: number) => 2 + 12 * n + 4; // count, entries, next-IFD offset
  const ifd0At = 8;
  const exifAt = ifd0At + size(ifd0.length + 1); // +1: the pointer to the Exif IFD
  let data = exifAt + size(exif.length); // values too long to sit in an entry

  const buffer = new ArrayBuffer(512);
  const view = new DataView(buffer);
  const enc = new TextEncoder();
  view.setUint16(0, 0x4d4d); // "MM": big-endian
  view.setUint16(2, 42);
  view.setUint32(4, ifd0At);

  const writeIfd = (at: number, entries: Entry[]) => {
    view.setUint16(at, entries.length);
    entries.forEach(([tag, type, value], k) => {
      const e = at + 2 + 12 * k;
      view.setUint16(e, tag);
      view.setUint16(e + 2, type);
      if (typeof value === "number") {
        view.setUint32(e + 4, 1);
        view.setUint32(e + 8, value);
        return;
      }
      const bytes = enc.encode(type === ASCII ? `${value}\0` : value);
      view.setUint32(e + 4, bytes.length);
      // Four bytes or fewer sit in the entry itself; longer ones go to the data
      // area, at an even offset as TIFF asks.
      let to = e + 8;
      if (bytes.length > 4) {
        view.setUint32(e + 8, data);
        to = data;
        data += bytes.length + (bytes.length % 2);
      }
      bytes.forEach((b, j) => view.setUint8(to + j, b));
    });
    view.setUint32(at + 2 + 12 * entries.length, 0); // no next IFD
  };
  writeIfd(ifd0At, [...ifd0, [0x8769, LONG, exifAt]]); // ExifIFDPointer
  writeIfd(exifAt, exif);
  return new Uint8Array(buffer, 0, data);
}

/** `jpeg` with an EXIF segment saying it was taken at `when`, placed right
 *  after the start-of-image marker where the EXIF standard puts it. */
export async function withDateTaken(jpeg: Blob, when: Date): Promise<Blob> {
  const bytes = new Uint8Array(await jpeg.arrayBuffer());
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Il file esportato non è un JPEG");
  const body = tiff(when);
  const head = new Uint8Array(10);
  const len = 2 + 6 + body.length; // the length counts itself, not the marker
  head.set([0xff, 0xe1, len >> 8, len & 0xff]); // APP1
  head.set(new TextEncoder().encode("Exif\0\0"), 4);
  return new Blob([bytes.subarray(0, 2), head, body, bytes.subarray(2)], { type: "image/jpeg" });
}
