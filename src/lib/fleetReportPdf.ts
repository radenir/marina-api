/**
 * The Fleet Activity Summary, as a PDF.
 *
 * Drawn with pdf-lib rather than filled from a template: the seafarer medical
 * report is an AcroForm with fixed boxes, but this document has a variable
 * number of vessels, languages and complaint categories, so there is nothing
 * to fill.
 *
 * It renders from exactly the object the dashboard fetches, so the two cannot
 * disagree. A customer holding a PDF that contradicts the screen it came from
 * is worse than having no PDF.
 *
 * The layout follows Marina's own Onboard Incident Summary: a navy title card,
 * a row of headline figures, then each section in its own bordered card, two
 * across where the content is narrow. Colour is reserved — navy for magnitude,
 * red for a warning, amber for the middle, green for the benign half of a
 * split. Bars are 6pt with rounded ends and every value sits in a fixed
 * right-hand column, so the eye can run down it.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

const NAVY = rgb(10 / 255, 75 / 255, 120 / 255);
const BLUE = rgb(46 / 255, 111 / 255, 158 / 255);
const RED = rgb(192 / 255, 48 / 255, 74 / 255);
const AMBER = rgb(214 / 255, 138 / 255, 42 / 255);
const GREEN = rgb(38 / 255, 138 / 255, 96 / 255);
const TRACK = rgb(232 / 255, 238 / 255, 244 / 255);
const RULE = rgb(216 / 255, 224 / 255, 234 / 255);
const INK = rgb(0.11, 0.13, 0.16);
const MUTED = rgb(0.45, 0.49, 0.54);
const WHITE = rgb(1, 1, 1);

const A4 = { w: 595.28, h: 841.89 };
const M = 46;
const W = A4.w - M * 2;
const GAP = 12;
const COL = (W - GAP) / 2;
const ROW = 14;

interface Cell { label: string; n: number }
interface Cells { items: Cell[]; suppressed: number; recorded: number }

interface Report {
  organisation?: string;
  by_month: { month: string; sessions: number; substantive: number; reports: number; red_flags: number }[];
  by_vessel: { vessel_name: string; sessions: number; red_flags: number }[];
  by_language: { language: string; n: number }[];
  by_pathway: { pathway: string; n: number }[];
  by_mode: { mode: string; n: number }[];
  by_hour: { hour: number; n: number }[];
  by_port: { port: string; n: number }[];
  by_destination: { port: string; n: number }[];
  by_urgency: { urgency: string; n: number; mews_0_1: number; mews_2_3: number; mews_4_plus: number }[];
  language_pairs: { officer_language: string; patient_language: string; n: number }[];
  duration: { n: number; median_minutes: string | null; p25_minutes: string | null; p75_minutes: string | null };
  demographics: { age: Cells; sex: Cells; rank: Cells; nationality: Cells; min_cell: number };
  abnormal: Record<string, number>;
  operational: Record<string, number>;
  totals: Record<string, number | string | null>;
  as_of: string;
}

const MODE_LABEL: Record<string, string> = {
  marina: 'AI interview', note_taker: 'Note Taker', translator: 'Translator',
};

// ---------------------------------------------------------------------------
// Text safety
//
// pdf-lib's standard Helvetica is WinAnsi-encoded and THROWS on anything
// outside CP1252 rather than substituting. The first production render died on
// `WinAnsi cannot encode "→"` — an arrow in this report's own labels — and
// would have died next on the Polish n-acute already in the data.
//
// Order matters: replace the typography, then decompose accents so n-acute
// becomes n rather than being dropped, then map the letters Unicode will not
// decompose, and only then discard.
// ---------------------------------------------------------------------------
const TYPOGRAPHY: [RegExp, string][] = [
  [/[→➡]/g, '->'], [/[←]/g, '<-'],
  [/[–—]/g, '-'], [/[‘’‛]/g, "'"],
  [/[“”„]/g, '"'], [/[…]/g, '...'],
  [/[   ]/g, ' '],
];
const LETTERS: Record<string, string> = {
  'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D',
  'ħ': 'h', 'ŧ': 't', 'ı': 'i', 'ſ': 's',
};

function ascii(input: string): string {
  let s = input;
  for (const [re, to] of TYPOGRAPHY) s = s.replace(re, to);
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[^\x00-\x7f]/g, (ch) => {
    if (LETTERS[ch]) return LETTERS[ch];
    const code = ch.codePointAt(0) ?? 0;
    // Latin-1 supplement is inside WinAnsi: ae, o-slash, a-ring, u-umlaut survive.
    return code >= 0xa1 && code <= 0xff ? ch : '';
  });
  return s.trim();
}

/** Never an empty label — an empty row reads as a rendering fault. */
function label(s: string): string {
  const out = ascii(s);
  return out.length > 0 ? out : '(not shown)';
}

function wrap(s: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const w of ascii(s).split(/\s+/)) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = w; }
    else line = next;
  }
  if (line) out.push(line);
  return out;
}

function clip(s: string, font: PDFFont, size: number, width: number): string {
  const t0 = ascii(s);
  if (font.widthOfTextAtSize(t0, size) <= width) return t0;
  let t = t0;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t}...`;
}

type Colour = ReturnType<typeof rgb>;

/** A rounded rectangle. pdf-lib has no primitive, so it is an SVG path. */
function roundRect(
  page: PDFPage, x: number, yTop: number, w: number, h: number, r: number,
  opts: { fill?: Colour; border?: Colour; borderWidth?: number },
): void {
  const rr = Math.max(0.1, Math.min(r, h / 2, w / 2));
  const d =
    `M ${rr} 0 H ${w - rr} A ${rr} ${rr} 0 0 1 ${w} ${rr} V ${h - rr} ` +
    `A ${rr} ${rr} 0 0 1 ${w - rr} ${h} H ${rr} A ${rr} ${rr} 0 0 1 0 ${h - rr} ` +
    `V ${rr} A ${rr} ${rr} 0 0 1 ${rr} 0 Z`;
  page.drawSvgPath(d, {
    x, y: yTop,
    color: opts.fill,
    borderColor: opts.border,
    borderWidth: opts.borderWidth ?? (opts.border ? 0.8 : 0),
  });
}

function monthName(ym: string): string {
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m] = ym.split('-');
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

function pct(n: number, of: number): string {
  return of > 0 ? `${Math.round((n / of) * 100)}%` : '0%';
}

/**
 * The page, and a cursor down it.
 *
 * Every card measures itself before it is drawn, so a card never runs off the
 * foot of a page leaving its border open behind it.
 */
class Doc {
  page!: PDFPage;
  y = 0;
  constructor(readonly doc: PDFDocument, readonly f: PDFFont, readonly b: PDFFont) {
    this.newPage();
  }
  newPage(): void {
    this.page = this.doc.addPage([A4.w, A4.h]);
    this.y = A4.h - M;
  }
  room(h: number): void {
    if (this.y - h < M + 26) this.newPage();
  }
  txt(s: string, x: number, y: number, size: number, colour: Colour, bold = false): void {
    this.page.drawText(ascii(s), { x, y, size, font: bold ? this.b : this.f, color: colour });
  }
  right(s: string, xRight: number, y: number, size: number, colour: Colour, bold = false): void {
    const t = ascii(s);
    const f = bold ? this.b : this.f;
    this.page.drawText(t, { x: xRight - f.widthOfTextAtSize(t, size), y, size, font: f, color: colour });
  }
  para(s: string, x: number, y: number, w: number, size = 7.6, colour = MUTED): number {
    const lines = wrap(s, this.f, size, w);
    lines.forEach((l, i) => this.txt(l, x, y - i * (size + 2.6), size, colour));
    return lines.length * (size + 2.6);
  }
  paraHeight(s: string, w: number, size = 7.6): number {
    return wrap(s, this.f, size, w).length * (size + 2.6);
  }
}

/** A horizontal bar with rounded ends. */
function bar(
  d: Doc, x: number, y: number, w: number,
  text: string, value: number, max: number,
  opts: { note?: string; colour?: Colour; labelW?: number } = {},
): void {
  const labelW = opts.labelW ?? Math.min(120, w * 0.36);
  const valueW = 40;
  const noteW = opts.note ? 46 : 0;
  const trackX = x + labelW;
  const trackW = Math.max(20, w - labelW - valueW - noteW);

  d.txt(clip(label(text), d.f, 7.6, labelW - 8), x, y, 7.6, INK);
  roundRect(d.page, trackX, y + 6.5, trackW, 6, 3, { fill: TRACK });
  if (value > 0 && max > 0) {
    roundRect(d.page, trackX, y + 6.5, Math.max((value / max) * trackW, 4), 6, 3,
      { fill: opts.colour ?? BLUE });
  }
  if (opts.note) d.right(opts.note, x + w - valueW - 6, y, 6.6, MUTED);
  d.right(value.toLocaleString(), x + w, y, 8, NAVY, true);
}

/**
 * How tall a card will be. Used to square off a pair of columns before either
 * is drawn — two side-by-side cards of different heights read as one of them
 * having failed to load.
 */
function cardHeight(
  d: Doc, w: number, heading: { caption?: string }, bodyHeight: number,
): number {
  const pad = 13;
  const capH = heading.caption ? d.paraHeight(heading.caption, w - pad * 2) + 6 : 0;
  return pad + 15 + capH + bodyHeight + pad;
}

/** A card: bordered white panel with a heading, and a body drawn by a callback. */
function card(
  d: Doc, x: number, w: number,
  heading: { n?: string; title: string; caption?: string },
  bodyHeight: number,
  body: (top: number) => void,
): number {
  const pad = 13;
  const capH = heading.caption ? d.paraHeight(heading.caption, w - pad * 2) + 6 : 0;
  const h = pad + 15 + capH + bodyHeight + pad;

  roundRect(d.page, x, d.y, w, h, 7, { fill: WHITE, border: RULE });
  let top = d.y - pad - 9;
  if (heading.n) d.txt(heading.n, x + pad, top, 6.6, BLUE, true);
  d.txt(heading.title, x + pad + (heading.n ? 17 : 0), top - 1, 10.5, NAVY, true);
  top -= 14;
  if (heading.caption) top -= d.para(heading.caption, x + pad, top, w - pad * 2) + 6;
  body(top);
  return h;
}

/** A headline figure: big number, label, and a quiet hint under it. */
function stat(
  d: Doc, x: number, yTop: number, w: number,
  value: string, name: string, hint: string, colour: Colour = NAVY,
): void {
  roundRect(d.page, x, yTop, w, 52, 7, { fill: WHITE, border: RULE });
  d.txt(name, x + 11, yTop - 15, 6.8, MUTED);
  d.txt(value, x + 11, yTop - 34, 18, colour, true);
  d.txt(clip(hint, d.f, 6.4, w - 22), x + 11, yTop - 44, 6.4, MUTED);
}

/** A note in a tinted box with a left accent — the printed report's device. */
function callout(d: Doc, x: number, yTop: number, w: number, text: string): number {
  const pad = 9;
  const inner = w - pad * 2 - 4;
  const h = d.paraHeight(text, inner) + pad * 2;
  roundRect(d.page, x, yTop, w, h, 5, { fill: rgb(0.965, 0.976, 0.988) });
  d.page.drawRectangle({ x, y: yTop - h, width: 2.5, height: h, color: BLUE });
  d.para(text, x + pad + 4, yTop - pad - 6, inner);
  return h;
}

export async function buildFleetReportPdf(r: Report): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const d = new Doc(
    pdf,
    await pdf.embedFont(StandardFonts.Helvetica),
    await pdf.embedFont(StandardFonts.HelveticaBold),
  );
  const t = r.totals;
  const op = r.operational;
  const org = ascii(r.organisation ?? 'Fleet');
  const reports = Number(t.reports ?? 0);
  const sessions = Number(t.sessions ?? 0);

  // ---- title card --------------------------------------------------------
  const months = r.by_month.map((m) => m.month);
  const period = months.length
    ? `${monthName(months[0])} - ${monthName(months[months.length - 1])}`
    : 'no activity recorded';

  const titleH = 162;
  roundRect(d.page, M, d.y, W, titleH, 9, { fill: NAVY });
  const cx = M + 30, cy = d.y - 28, rad = 9.5;
  d.page.drawCircle({ x: cx, y: cy, size: rad, borderColor: WHITE, borderWidth: 1.3 });
  d.page.drawCircle({ x: cx, y: cy, size: rad * 0.3, color: WHITE });
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    d.page.drawLine({
      start: { x: cx + Math.cos(a) * rad * 0.32, y: cy + Math.sin(a) * rad * 0.32 },
      end: { x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad },
      thickness: 1.1, color: WHITE,
    });
  }
  d.txt('Marina Health', M + 46, d.y - 25, 9.5, WHITE, true);
  d.txt('MARITIME TELEMEDICINE', M + 46, d.y - 34, 5.2, rgb(0.72, 0.8, 0.88));
  d.txt('FLEET ANALYTICS', M + 20, d.y - 60, 6.4, rgb(0.66, 0.77, 0.87), true);
  d.txt('Fleet Activity Summary', M + 20, d.y - 84, 19, WHITE, true);
  // Two lines, deliberately: a third would run into the meta rule below.
  d.para(
    'What the crews recorded through Marina, pooled across every vessel in this fleet. Aggregate ' +
      'only: no patient named, no symptom in anyone’s own words, no vital-sign reading.',
    M + 20, d.y - 101, W - 60, 7.2, rgb(0.78, 0.85, 0.91),
  );

  d.page.drawLine({
    start: { x: M + 20, y: d.y - titleH + 44 }, end: { x: M + W - 20, y: d.y - titleH + 44 },
    thickness: 0.6, color: rgb(0.3, 0.46, 0.6),
  });
  const meta: [string, string][] = [
    ['ORGANISATION', org],
    ['PERIOD', period],
    ['REPORTS', `${reports} of ${sessions} sessions`],
    ['PREPARED', new Date(r.as_of).toISOString().slice(0, 10)],
  ];
  const mw = (W - 40) / meta.length;
  meta.forEach(([k, v], i) => {
    const x = M + 20 + i * mw;
    d.txt(k, x, d.y - titleH + 30, 5.4, rgb(0.62, 0.74, 0.85), true);
    d.txt(clip(v, d.b, 8.5, mw - 10), x, d.y - titleH + 16, 8.5, WHITE, true);
  });
  d.y -= titleH + GAP;

  // ---- headline figures --------------------------------------------------
  const sw = (W - GAP * 3) / 4;
  const flags = Number(t.red_flags ?? 0);
  stat(d, M, d.y, sw, String(sessions), 'Sessions', `${t.substantive ?? 0} substantive`);
  stat(d, M + sw + GAP, d.y, sw, String(t.vessels ?? 0), 'Vessels', 'using Marina');
  stat(d, M + (sw + GAP) * 2, d.y, sw, String(reports), 'Reports', 'structured records');
  stat(d, M + (sw + GAP) * 3, d.y, sw, String(flags), 'Red flags',
    `${pct(flags, reports)} of reports`, flags > 0 ? RED : NAVY);
  d.y -= 52 + GAP;

  // ---- 01 use over time --------------------------------------------------
  d.room(60 + r.by_month.length * ROW);
  const maxMonth = Math.max(1, ...r.by_month.map((m) => m.sessions));
  d.y -= card(d, M, W, {
    n: '01', title: 'Use over time',
    caption: 'Sessions started each month, and how many carried a consultation rather than a single note.',
  }, Math.max(r.by_month.length * ROW, 14), (top) => {
    r.by_month.forEach((m, i) => bar(d, M + 13, top - i * ROW, W - 26,
      monthName(m.month), m.sessions, maxMonth, { note: `${m.substantive} subst.` }));
  }) + GAP;

  // ---- 02 by vessel ------------------------------------------------------
  d.room(60 + r.by_vessel.length * ROW);
  const maxV = Math.max(1, ...r.by_vessel.map((v) => v.sessions));
  d.y -= card(d, M, W, {
    n: '02', title: 'By vessel',
    caption: 'Which ships are using it. Red flags are counted, never described.',
  }, Math.max(r.by_vessel.length * ROW, 14), (top) => {
    r.by_vessel.forEach((v, i) => bar(d, M + 13, top - i * ROW, W - 26,
      v.vessel_name, v.sessions, maxV, { note: v.red_flags > 0 ? `${v.red_flags} flag` : undefined }));
  }) + GAP;

  // ---- 03 languages | 04 language barrier --------------------------------
  d.room(150);
  const yLang = d.y;
  const maxL = Math.max(1, ...r.by_language.map((l) => l.n));
  const capA = "The patient's language, not the officer's.";
  const capB = `${pct(op.language_gap ?? 0, op.language_known ?? 0)} of consultations - ` +
    `${op.language_gap ?? 0} of ${op.language_known ?? 0}. The officer worked in one language, ` +
    'the patient in another.';
  const bodyA = Math.max(r.by_language.length * ROW, 14);
  const bodyB = Math.max(r.language_pairs.length * ROW, 14);
  const tallest = Math.max(
    cardHeight(d, COL, { caption: capA }, bodyA),
    cardHeight(d, COL, { caption: capB }, bodyB),
  );
  const hA = card(d, M, COL, {
    n: '03', title: 'Languages spoken', caption: capA,
  }, bodyA + (tallest - cardHeight(d, COL, { caption: capA }, bodyA)), (top) => {
    r.by_language.forEach((l, i) => bar(d, M + 13, top - i * ROW, COL - 26,
      l.language, l.n, maxL, { note: pct(l.n, sessions), labelW: 76 }));
  });
  d.y = yLang;
  const maxP = Math.max(1, ...r.language_pairs.map((p) => p.n));
  const hB = card(d, M + COL + GAP, COL, {
    n: '04', title: 'No language in common', caption: capB,
  }, bodyB + (tallest - cardHeight(d, COL, { caption: capB }, bodyB)), (top) => {
    if (!r.language_pairs.length) {
      d.txt('Every consultation shared a language.', M + COL + GAP + 13, top, 7.4, MUTED);
      return;
    }
    r.language_pairs.forEach((p, i) => bar(d, M + COL + GAP + 13, top - i * ROW, COL - 26,
      `${p.officer_language} -> ${p.patient_language}`, p.n, maxP, { labelW: 108 }));
  });
  d.y = yLang - Math.max(hA, hB) - GAP;

  // ---- 05 what comes up --------------------------------------------------
  d.room(100);
  const classified = Number(t.classified ?? 0);
  const maxPa = Math.max(1, ...r.by_pathway.map((p) => p.n));
  const dedup = op.distinct_presentations ?? 0;
  const showDedup = dedup > 0 && dedup < classified;
  const dedupNote =
    `Counting each complaint once per account gives ${dedup} distinct presentations rather than ` +
    `${classified}. The difference is one situation recorded more than once from the same login, ` +
    'which would otherwise drown out real cases on other ships.';
  d.y -= card(d, M, W, {
    n: '05', title: 'What comes up on board',
    caption: `Fleet-wide only, never by ship - on a small crew that would name someone. Covers ` +
      `${pct(classified, sessions)} of sessions; a complaint counts only when it matches one of ` +
      `Marina's 44 clinical pathways.`,
  }, Math.max(r.by_pathway.length * ROW, 14) + (showDedup ? d.paraHeight(dedupNote, W - 52) + 24 : 0),
  (top) => {
    r.by_pathway.forEach((p, i) => bar(d, M + 13, top - i * ROW, W - 26,
      p.pathway, p.n, maxPa, { labelW: 150, note: pct(p.n, classified) }));
    if (showDedup) callout(d, M + 13, top - r.by_pathway.length * ROW - 4, W - 26, dedupNote);
  }) + GAP;

  // ---- 06 urgency | 07 early warning -------------------------------------
  if (r.by_urgency.length) {
    d.room(150);
    const yU = d.y;
    const graded = r.by_urgency.reduce((a, u) => a + u.n, 0);
    const bands: [string, string, Colour][] = [
      ['emergency', 'Emergency', RED], ['urgent', 'Urgent', AMBER],
      ['standard', 'Standard', BLUE], ['low', 'Low', GREEN],
    ];
    const maxU = Math.max(1, ...r.by_urgency.map((u) => u.n));
    const mews = {
      a: r.by_urgency.reduce((s, u) => s + u.mews_0_1, 0),
      b: r.by_urgency.reduce((s, u) => s + u.mews_2_3, 0),
      c: r.by_urgency.reduce((s, u) => s + u.mews_4_plus, 0),
    };
    const maxM = Math.max(1, mews.a, mews.b, mews.c);
    const capU = `From the warning raised, the early-warning score, and how awake the patient was. ` +
      `${graded} of ${reports} reports carried enough to grade.`;
    const capM = 'What the score asks the ship to do next. A report with no observation is not scored.';
    const tallU = Math.max(
      cardHeight(d, COL, { caption: capU }, 4 * ROW),
      cardHeight(d, COL, { caption: capM }, 3 * ROW),
    );
    const hU = card(d, M, COL, {
      n: '06', title: 'How urgent the cases were', caption: capU,
    }, 4 * ROW + (tallU - cardHeight(d, COL, { caption: capU }, 4 * ROW)), (top) => {
      bands.forEach(([k, lab, c], i) => {
        const row = r.by_urgency.find((u) => u.urgency === k);
        bar(d, M + 13, top - i * ROW, COL - 26, lab, row?.n ?? 0, maxU,
          { colour: c, note: pct(row?.n ?? 0, graded), labelW: 74 });
      });
    });
    d.y = yU;
    const hM = card(d, M + COL + GAP, COL, {
      n: '07', title: 'Early-warning score', caption: capM,
    }, 3 * ROW + (tallU - cardHeight(d, COL, { caption: capM }, 3 * ROW)), (top) => {
      const x = M + COL + GAP + 13;
      bar(d, x, top, COL - 26, '0-1  email', mews.a, maxM, { colour: GREEN, labelW: 92 });
      bar(d, x, top - ROW, COL - 26, '2-3  video call', mews.b, maxM, { colour: AMBER, labelW: 92 });
      bar(d, x, top - ROW * 2, COL - 26, '4+  emergency', mews.c, maxM, { colour: RED, labelW: 92 });
    });
    d.y = yU - Math.max(hU, hM) - GAP;
  }

  // ---- 08 measured | 09 asked -------------------------------------------
  d.room(150);
  const yMeas = d.y;
  const abn = r.abnormal ?? {};
  const vitals: [string, number, number][] = [
    ['Pulse', op.vital_pulse ?? 0, abn.pulse ?? 0],
    ['Blood pressure', op.vital_bp ?? 0, abn.bp ?? 0],
    ['Breathing rate', op.vital_resp ?? 0, abn.resp ?? 0],
    ['Oxygen level', op.vital_spo2 ?? 0, abn.spo2 ?? 0],
    ['Temperature', op.vital_temp ?? 0, abn.temp ?? 0],
  ];
  const capMe = `Whether a reading was recorded - never the reading. Of the ${op.with_vitals ?? 0} ` +
    `reports carrying any measurement, ${abn.any_abnormal ?? 0} had a value outside the normal range.`;
  const capAs = 'Where the interview came back with an answer, including an explicit "none".';
  const tallMe = Math.max(
    cardHeight(d, COL, { caption: capMe }, vitals.length * ROW),
    cardHeight(d, COL, { caption: capAs }, 3 * ROW),
  );
  const hMeas = card(d, M, COL, {
    n: '08', title: 'What was measured', caption: capMe,
  }, vitals.length * ROW + (tallMe - cardHeight(d, COL, { caption: capMe }, vitals.length * ROW)), (top) => {
    vitals.forEach(([lab, taken, bad], i) => bar(d, M + 13, top - i * ROW, COL - 26,
      lab, taken, Math.max(1, reports),
      { note: taken > 0 ? `${pct(bad, taken)} abn.` : undefined, labelW: 78 }));
  });
  d.y = yMeas;
  const asked: [string, number][] = [
    ['Past medical history', op.history_past ?? 0],
    ['Allergies', op.history_allergies ?? 0],
    ['Regular medicines', op.history_medications ?? 0],
  ];
  const hAsk = card(d, M + COL + GAP, COL, {
    n: '09', title: 'What the interview asked', caption: capAs,
  }, asked.length * ROW + (tallMe - cardHeight(d, COL, { caption: capAs }, asked.length * ROW)), (top) => {
    asked.forEach(([lab, n], i) => bar(d, M + COL + GAP + 13, top - i * ROW, COL - 26,
      lab, n, Math.max(1, reports), { note: pct(n, reports), labelW: 100 }));
  });
  d.y = yMeas - Math.max(hMeas, hAsk) - GAP;

  // ---- 10 how used | 11 how long -----------------------------------------
  d.room(130);
  const yUse = d.y;
  const maxMo = Math.max(1, ...r.by_mode.map((m) => m.n));
  const capUse = 'Which of the three tools the officer reached for.';
  const bodyUse = Math.max(r.by_mode.length * ROW, 14);
  const tallUse = Math.max(
    cardHeight(d, COL, { caption: capUse }, bodyUse),
    cardHeight(d, COL, {}, 44),
  );
  const hUse = card(d, M, COL, {
    n: '10', title: 'How it was used', caption: capUse,
  }, bodyUse + (tallUse - cardHeight(d, COL, { caption: capUse }, bodyUse)), (top) => {
    r.by_mode.forEach((m, i) => bar(d, M + 13, top - i * ROW, COL - 26,
      MODE_LABEL[m.mode] ?? m.mode, m.n, maxMo, { note: pct(m.n, sessions), labelW: 78 }));
  });
  d.y = yUse;
  const dur = r.duration;
  const hTime = card(d, M + COL + GAP, COL, {
    n: '11', title: 'How long, and what happened next',
  }, 44 + (tallUse - cardHeight(d, COL, {}, 44)), (top) => {
    const x = M + COL + GAP + 13;
    const med = dur.median_minutes ?? '-';
    d.txt(med, x, top - 10, 17, NAVY, true);
    d.txt('min', x + d.b.widthOfTextAtSize(med, 17) + 3, top - 10, 7, MUTED);
    d.txt('Median consultation', x, top - 22, 7.2, INK);
    d.txt(`${dur.n} measured, middle half ${dur.p25_minutes ?? '-'}-${dur.p75_minutes ?? '-'}`,
      x, top - 31, 6.4, MUTED);
    const x2 = x + COL / 2 - 6;
    d.txt(String(op.pdfs_generated ?? 0), x2, top - 10, 17, NAVY, true);
    d.txt('Reports downloaded', x2, top - 22, 7.2, INK);
    d.txt(`${op.pdfs_emailed ?? 0} emailed to a doctor`, x2, top - 31, 6.4, MUTED);
  });
  d.y = yUse - Math.max(hUse, hTime) - GAP;

  // ---- 12 who ------------------------------------------------------------
  const dem = r.demographics;
  const shown = ([['Age', dem.age], ['Sex', dem.sex], ['Job on board', dem.rank],
    ['Nationality', dem.nationality]] as [string, Cells][]).filter(([, c]) => c.items.length > 0);
  d.room(110);
  if (shown.length) {
    const rows = shown.reduce((a, [, c]) => a + c.items.length + 1, 0);
    d.y -= card(d, M, W, {
      n: '12', title: 'Who the patients were',
      caption: `Counted per person, not per report: reports sharing a name and date of birth are one ` +
        `patient, and a report naming nobody is not counted at all. Any group of fewer than ` +
        `${dem.min_cell} is not shown.`,
    }, rows * ROW, (top) => {
      let yy = top;
      for (const [title, cells] of shown) {
        d.txt(`${title}  -  ${cells.recorded} patient${cells.recorded === 1 ? '' : 's'}`,
          M + 13, yy, 7, MUTED, true);
        yy -= ROW;
        const mx = Math.max(1, ...cells.items.map((c) => c.n));
        for (const c of cells.items) {
          bar(d, M + 13, yy, W - 26, c.label, c.n, mx, { labelW: 150, note: pct(c.n, cells.recorded) });
          yy -= ROW;
        }
      }
    }) + GAP;
  } else {
    const note =
      `Not reported. Age, sex, job and nationality are optional boxes on the report form, and this ` +
      `fleet's reports do not carry enough of them to describe anybody without identifying an ` +
      `individual. ${op.unidentified_reports ?? 0} reports name nobody and give no date of birth, ` +
      'so they cannot say who the patient was.';
    d.y -= card(d, M, W, { n: '12', title: 'Who the patients were' },
      d.paraHeight(note, W - 52) + 20, (top) => callout(d, M + 13, top + 6, W - 26, note)) + GAP;
  }

  // ---- methodology -------------------------------------------------------
  const notes: [string, string][] = [
    ['Scope', 'Every session run by an account attached to this organisation. Sessions run without ' +
      'signing in, or through an integrator, are not attributed to a fleet and are absent here.'],
    ['Complaints', 'Counted only when the recorded chief symptom matches one of Marina’s 44 clinical ' +
      'pathways. Anything else is unclassified and reported as such rather than dropped.'],
    ['Urgency', 'Derived from the red flag, the Maritime Early Warning Score computed from recorded ' +
      'vitals, and the level of consciousness. A report carrying no observation is not graded, ' +
      'rather than counted as low.'],
    ['People', 'There is no patient identifier in Marina, by design. Two reports are the same patient ' +
      'only when they share a name and date of birth on one account; a report giving neither cannot ' +
      'describe a person and is excluded from the demographic figures.'],
    ['Privacy', 'This document contains no patient name, no symptom in anyone’s own words, no ' +
      'transcript, and no vital-sign value.'],
  ];
  const notesH = notes.reduce((a, [, v]) => a + d.paraHeight(v, W - 26 - 66) + 8, 0);
  d.room(notesH + 50);
  d.y -= card(d, M, W, { title: 'Methodology and limits' }, notesH, (top) => {
    let yy = top;
    for (const [k, v] of notes) {
      d.txt(k, M + 13, yy, 7.2, NAVY, true);
      yy -= d.para(v, M + 13 + 66, yy, W - 26 - 66) + 8;
    }
  });

  // ---- footer ------------------------------------------------------------
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M - 10 }, end: { x: A4.w - M, y: M - 10 }, thickness: 0.6, color: RULE });
    p.drawText(ascii(`Marina Health  -  Fleet Activity Summary  -  ${org}`),
      { x: M, y: M - 21, size: 6.4, font: d.f, color: MUTED });
    const pn = `${i + 1} / ${pages.length}`;
    p.drawText(pn, {
      x: A4.w - M - d.f.widthOfTextAtSize(pn, 6.4), y: M - 21, size: 6.4, font: d.f, color: MUTED,
    });
  });

  return pdf.save();
}
