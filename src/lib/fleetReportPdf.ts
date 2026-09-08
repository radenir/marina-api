/**
 * The Fleet Activity Summary, as a PDF.
 *
 * Built with pdf-lib rather than filled from a template. The seafarer medical
 * report is an AcroForm with fixed boxes, so it is *filled*; this document has
 * a variable number of vessels, languages and complaint categories, so there is
 * no form to fill — it is drawn.
 *
 * It renders from exactly the object the dashboard fetches, so the two cannot
 * disagree. A customer holding a PDF that contradicts the screen it came from
 * is worse than having no PDF.
 *
 * House style is the seafarer report's: navy #0a4b78, Helvetica, #d8e0ea rules.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';

const NAVY = rgb(10 / 255, 75 / 255, 120 / 255);
const FILL = rgb(46 / 255, 111 / 255, 158 / 255); // bars — the lighter navy step
const ALERT = rgb(192 / 255, 48 / 255, 74 / 255);
const TRACK = rgb(238 / 255, 243 / 255, 247 / 255);
const RULE = rgb(216 / 255, 224 / 255, 234 / 255);
const INK = rgb(0.13, 0.13, 0.13);
const MUTED = rgb(0.42, 0.45, 0.5);

const A4 = { w: 595.28, h: 841.89 };
const M = 42; // page margin
const CONTENT = A4.w - M * 2;

interface Cell { label: string; n: number }
interface Cells { items: Cell[]; suppressed: number; recorded: number }

/** Everything buildFleetActivity() returns, loosely typed at the edges. */
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
  marina: 'AI interview',
  note_taker: 'Note Taker',
  translator: 'Translator',
};

/** A drawing cursor that lays out top-down and breaks pages on its own. */
class Sheet {
  page: PDFPage;
  y: number;
  constructor(
    readonly doc: PDFDocument,
    readonly font: PDFFont,
    readonly bold: PDFFont,
  ) {
    this.page = doc.addPage([A4.w, A4.h]);
    this.y = A4.h - M;
  }

  /** Reserve vertical space, starting a new page if this block will not fit. */
  need(h: number): void {
    if (this.y - h < M + 28) {
      this.page = this.doc.addPage([A4.w, A4.h]);
      this.y = A4.h - M;
    }
  }

  text(raw: string, opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; x?: number; dy?: number } = {}): void {
    const s = ascii(raw);
    const size = opts.size ?? 9;
    this.y -= opts.dy ?? size + 3;
    this.page.drawText(s, {
      x: opts.x ?? M,
      y: this.y,
      size,
      font: opts.bold ? this.bold : this.font,
      color: opts.color ?? INK,
    });
  }

  rule(): void {
    this.y -= 8;
    this.page.drawLine({
      start: { x: M, y: this.y },
      end: { x: A4.w - M, y: this.y },
      thickness: 0.7,
      color: RULE,
    });
    this.y -= 4;
  }

  /** Section heading: a small navy number and a title, as in the printed report. */
  section(n: string, title: string): void {
    this.need(46);
    this.y -= 16;
    this.page.drawText(n, { x: M, y: this.y, size: 7, font: this.bold, color: FILL });
    this.page.drawText(ascii(title), { x: M + 18, y: this.y - 1, size: 11, font: this.bold, color: NAVY });
    this.y -= 6;
  }

  caption(raw: string): void {
    for (const line of wrap(ascii(raw), this.font, 7.5, CONTENT)) {
      this.text(line, { size: 7.5, color: MUTED, dy: 10 });
    }
    this.y -= 2;
  }

  /** A labelled horizontal bar, direct-labelled so no axis is needed. */
  bar(rawLabel: string, value: number, max: number, opts: { note?: string; alert?: boolean } = {}): void {
    this.need(16);
    this.y -= 13;
    const labelW = 132;
    // Wide enough for the longest value a bar carries — "156 · 40 subst." is
    // 70pt at 8pt bold, and at the old 52 the number was drawn straight over
    // the end of a full-width bar.
    const valueW = 98;
    const trackX = M + labelW;
    const trackW = CONTENT - labelW - valueW;

    this.page.drawText(clip(label(rawLabel), this.font, 8, labelW - 6), {
      x: M, y: this.y, size: 8, font: this.font, color: INK,
    });
    this.page.drawRectangle({ x: trackX, y: this.y - 1.5, width: trackW, height: 7, color: TRACK });
    if (value > 0 && max > 0) {
      this.page.drawRectangle({
        x: trackX,
        y: this.y - 1.5,
        width: Math.max((value / max) * trackW, 3),
        height: 7,
        color: opts.alert ? ALERT : FILL,
      });
    }
    // The count in navy bold, its qualifier in muted regular beside it — so the
    // eye lands on the number rather than reading "156 40" as one figure.
    const num = value.toLocaleString();
    const numW = this.bold.widthOfTextAtSize(num, 8);
    const note = opts.note ? clip(ascii(opts.note), this.font, 7, valueW - numW - 10) : '';
    const noteW = note ? this.font.widthOfTextAtSize(note, 7) + 4 : 0;
    this.page.drawText(num, {
      x: A4.w - M - numW, y: this.y, size: 8, font: this.bold, color: NAVY,
    });
    if (note) {
      this.page.drawText(note, {
        x: A4.w - M - numW - noteW, y: this.y, size: 7, font: this.font, color: MUTED,
      });
    }
  }

  /** Four headline figures across the page. */
  tiles(items: { label: string; value: string; hint?: string }[]): void {
    this.need(58);
    this.y -= 50;
    const gap = 8;
    const w = (CONTENT - gap * (items.length - 1)) / items.length;
    items.forEach((it, i) => {
      const x = M + i * (w + gap);
      this.page.drawRectangle({
        x, y: this.y, width: w, height: 46,
        borderColor: RULE, borderWidth: 0.7, color: rgb(1, 1, 1),
      });
      this.page.drawText(ascii(it.label), { x: x + 8, y: this.y + 32, size: 7, font: this.font, color: MUTED });
      this.page.drawText(it.value, { x: x + 8, y: this.y + 14, size: 16, font: this.bold, color: NAVY });
      if (it.hint) {
        this.page.drawText(clip(ascii(it.hint), this.font, 6.5, w - 16), {
          x: x + 8, y: this.y + 5, size: 6.5, font: this.font, color: MUTED,
        });
      }
    });
  }
}

/**
 * Make a string safe for the standard Helvetica, which is WinAnsi-encoded and
 * THROWS on anything outside CP1252 rather than substituting.
 *
 * This is not hypothetical tidying. The first production render of this report
 * died on `WinAnsi cannot encode "→"` — an arrow in my own language-pair
 * labels — and would have died next on the Polish ń and ł that appear in real
 * crew data. The demo fixture contained none of it, so nothing caught it
 * locally.
 *
 * Order matters: replace the typography first, then decompose accents so ń
 * becomes n rather than being dropped, then map the letters that have no
 * decomposition, and only then discard.
 *
 * The honest limit: a non-Latin script cannot be transliterated here, so a
 * label in Chinese or Arabic degrades to a placeholder. Fixing that properly
 * means embedding a Unicode font with fontkit, which is a bigger change than
 * this document is worth today — but it is why every crew-facing label on this
 * report comes from a fixed English vocabulary rather than free text.
 */
const TYPOGRAPHY: [RegExp, string][] = [
  [/[\u2192\u27a1]/g, '->'],
  [/[\u2190]/g, '<-'],
  [/[\u2013\u2014]/g, '-'],
  [/[\u2018\u2019\u201b]/g, "'"],
  [/[\u201c\u201d\u201e]/g, '"'],
  [/[\u2026]/g, '...'],
  [/[\u00a0\u202f\u2009]/g, ' '],
];
/** Letters WinAnsi lacks and Unicode will not decompose for us. */
const LETTERS: Record<string, string> = {
  'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ħ': 'h', 'ŧ': 't',
  'ı': 'i', 'ſ': 's', 'ø': 'o', 'Ø': 'O',
};

function ascii(input: string): string {
  let s = input;
  for (const [re, to] of TYPOGRAPHY) s = s.replace(re, to);
  // Decompose, then drop the combining marks: ń -> n, š -> s, ż -> z.
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^\x00-\x7f]/g, (ch) => {
    if (LETTERS[ch]) return LETTERS[ch];
    // æ, ø, å, ü, ß and the rest of Latin-1 are all in WinAnsi — keep them.
    const code = ch.codePointAt(0) ?? 0;
    if (code >= 0xa1 && code <= 0xff) return ch;
    return '';
  });
  return s.trim();
}

/** Never return an empty label: an empty row reads as a rendering fault. */
function label(s: string): string {
  const out = ascii(s);
  return out.length > 0 ? out : '(not shown)';
}

function wrap(s: string, font: PDFFont, size: number, width: number): string[] {
  const words = s.split(/\s+/);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      out.push(line);
      line = w;
    } else line = next;
  }
  if (line) out.push(line);
  return out;
}

function clip(s: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(s, size) <= width) return s;
  let t = s;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
  return `${t}…`;
}

/** The Marina wheel, drawn rather than embedded — the mark is only ever an SVG. */
function drawWheel(page: PDFPage, cx: number, cy: number, r: number, color: ReturnType<typeof rgb>): void {
  page.drawCircle({ x: cx, y: cy, size: r, borderColor: color, borderWidth: r * 0.11, color: undefined });
  page.drawCircle({ x: cx, y: cy, size: r * 0.26, color });
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    page.drawLine({
      start: { x: cx + Math.cos(a) * r * 0.24, y: cy + Math.sin(a) * r * 0.24 },
      end: { x: cx + Math.cos(a) * r * 1.12, y: cy + Math.sin(a) * r * 1.12 },
      thickness: r * 0.1,
      color,
    });
  }
}

function monthName(ym: string): string {
  const [y, m] = ym.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

export async function buildFleetReportPdf(r: Report): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const s = new Sheet(doc, font, bold);
  const t = r.totals;
  const op = r.operational;
  const org = r.organisation ?? 'Fleet';

  // ---- header band -------------------------------------------------------
  const bandH = 96;
  s.page.drawRectangle({ x: 0, y: A4.h - bandH, width: A4.w, height: bandH, color: NAVY });
  drawWheel(s.page, M + 13, A4.h - 30, 10, rgb(1, 1, 1));
  s.page.drawText('Marina Health', { x: M + 30, y: A4.h - 30, size: 10, font: bold, color: rgb(1, 1, 1) });
  s.page.drawText('MARITIME TELEMEDICINE', { x: M + 30, y: A4.h - 40, size: 5.5, font, color: rgb(0.75, 0.82, 0.89) });
  s.page.drawText('FLEET ANALYTICS', { x: M, y: A4.h - 60, size: 6.5, font: bold, color: rgb(0.68, 0.78, 0.87) });
  s.page.drawText('Fleet Activity Summary', { x: M, y: A4.h - 82, size: 19, font: bold, color: rgb(1, 1, 1) });
  s.y = A4.h - bandH - 10;

  const months = r.by_month.map((m) => m.month);
  const period = months.length
    ? `${monthName(months[0])} – ${monthName(months[months.length - 1])}`
    : 'no activity recorded';
  s.text(org, { size: 11, bold: true, color: NAVY, dy: 16 });
  s.text(`${period}  ·  prepared ${new Date(r.as_of).toISOString().slice(0, 10)}`, { size: 8, color: MUTED });
  s.caption(
    'What the crews recorded through Marina, pooled across every vessel in this fleet. ' +
      'All figures are aggregate. No patient is named, no symptom appears in anyone’s own words, ' +
      'and no vital-sign reading is shown.',
  );

  s.tiles([
    { label: 'Sessions', value: String(t.sessions ?? 0), hint: `${t.substantive ?? 0} substantive` },
    { label: 'Vessels', value: String(t.vessels ?? 0), hint: 'using Marina' },
    { label: 'Reports', value: String(t.reports ?? 0), hint: 'structured records' },
    { label: 'Red flags', value: String(t.red_flags ?? 0), hint: 'serious findings' },
  ]);

  // ---- 01 use over time --------------------------------------------------
  s.section('01', 'Use over time');
  s.caption('Sessions started each month across the fleet, and how many carried a real consultation.');
  const maxMonth = Math.max(1, ...r.by_month.map((m) => m.sessions));
  for (const m of r.by_month) {
    s.bar(monthName(m.month), m.sessions, maxMonth, { note: `· ${m.substantive} subst.` });
  }

  // ---- 02 by vessel ------------------------------------------------------
  s.section('02', 'By vessel');
  s.caption('Which ships are using it. Red flags are counted, never described.');
  const maxV = Math.max(1, ...r.by_vessel.map((v) => v.sessions));
  for (const v of r.by_vessel) {
    s.bar(v.vessel_name, v.sessions, maxV, { note: v.red_flags > 0 ? `· ${v.red_flags} flag` : undefined });
  }

  // ---- 03 language -------------------------------------------------------
  s.section('03', 'Languages, and where they did not match');
  const gapPct = op.language_known > 0 ? Math.round((op.language_gap / op.language_known) * 100) : 0;
  s.caption(
    `The patient's language, not the officer's. In ${gapPct}% of consultations — ${op.language_gap} of ` +
      `${op.language_known} — the officer and the patient had no language in common.`,
  );
  const maxL = Math.max(1, ...r.by_language.map((l) => l.n));
  for (const l of r.by_language) s.bar(l.language, l.n, maxL);
  if (r.language_pairs.length) {
    s.y -= 6;
    s.text('Officer to patient, where they differed', { size: 7.5, bold: true, color: MUTED, dy: 12 });
    const maxP = Math.max(1, ...r.language_pairs.map((p) => p.n));
    for (const p of r.language_pairs) {
      s.bar(`${p.officer_language} -> ${p.patient_language}`, p.n, maxP);
    }
  }

  // ---- 04 what comes up --------------------------------------------------
  s.section('04', 'What comes up on board');
  const classified = Number(t.classified ?? 0);
  const sessions = Number(t.sessions ?? 0);
  s.caption(
    `Fleet-wide only — never broken down by ship, because on a small crew that would name someone. ` +
      `Covers ${sessions ? Math.round((classified / sessions) * 100) : 0}% of sessions; a complaint is counted only ` +
      `when it matches one of Marina's 44 clinical pathways.`,
  );
  const maxPa = Math.max(1, ...r.by_pathway.map((p) => p.n));
  for (const p of r.by_pathway) s.bar(p.pathway, p.n, maxPa);
  if (op.distinct_presentations && op.distinct_presentations < classified) {
    s.y -= 4;
    s.caption(
      `Counting each complaint once per account gives ${op.distinct_presentations} distinct presentations ` +
        `rather than ${classified} — the difference is one situation recorded more than once from the same login.`,
    );
  }

  // ---- 05 urgency --------------------------------------------------------
  if (r.by_urgency.length) {
    s.section('05', 'How urgent the cases were');
    const graded = r.by_urgency.reduce((a, u) => a + u.n, 0);
    s.caption(
      `Graded from the warning Marina raised, the early-warning score from the vital signs, and how awake the ` +
        `patient was. ${graded} of ${t.reports} reports carried enough to grade; a report where nothing was ` +
        `measured is not graded at all, rather than counted as low.`,
    );
    const order = ['emergency', 'urgent', 'standard', 'low'];
    const labels: Record<string, string> = {
      emergency: 'Emergency', urgent: 'Urgent', standard: 'Standard', low: 'Low',
    };
    const maxU = Math.max(1, ...r.by_urgency.map((u) => u.n));
    for (const k of order) {
      const row = r.by_urgency.find((u) => u.urgency === k);
      if (row) s.bar(labels[k], row.n, maxU, { alert: k === 'emergency' });
    }
  }

  // ---- 06 measurement ----------------------------------------------------
  s.section('06', 'What was measured, and what was asked');
  s.caption(
    `Whether a reading was recorded — never the reading itself. Of the ${op.with_vitals} reports carrying any ` +
      `measurement, ${r.abnormal.any_abnormal ?? 0} had at least one value outside the normal range.`,
  );
  const reports = Number(t.reports ?? 1) || 1;
  for (const [label, n] of [
    ['Pulse', op.vital_pulse], ['Blood pressure', op.vital_bp], ['Breathing rate', op.vital_resp],
    ['Oxygen level', op.vital_spo2], ['Temperature', op.vital_temp],
    ['Past medical history', op.history_past], ['Allergies', op.history_allergies],
    ['Regular medicines', op.history_medications],
  ] as [string, number][]) {
    s.bar(label, n ?? 0, reports);
  }

  // ---- 07 operational ----------------------------------------------------
  s.section('07', 'When, how long, and how it was used');
  const d = r.duration;
  s.caption(
    `Median consultation ${d.median_minutes ?? '—'} minutes across ${d.n} multi-turn sessions ` +
      `(middle half ${d.p25_minutes ?? '—'}–${d.p75_minutes ?? '—'}). Single-entry notes have no duration. ` +
      `${op.pdfs_generated ?? 0} reports were downloaded as a PDF and ${op.pdfs_emailed ?? 0} emailed.`,
  );
  const maxM = Math.max(1, ...r.by_mode.map((m) => m.n));
  for (const m of r.by_mode) s.bar(MODE_LABEL[m.mode] ?? m.mode, m.n, maxM);
  if (r.by_port.length) {
    s.y -= 6;
    s.text('Nearest port at the time', { size: 7.5, bold: true, color: MUTED, dy: 12 });
    const maxPo = Math.max(1, ...r.by_port.map((p) => p.n));
    for (const p of r.by_port) s.bar(p.port, p.n, maxPo);
  }
  if (r.by_destination.length) {
    s.y -= 6;
    s.text('Where the ship was heading', { size: 7.5, bold: true, color: MUTED, dy: 12 });
    const maxD = Math.max(1, ...r.by_destination.map((p) => p.n));
    for (const p of r.by_destination) s.bar(p.port, p.n, maxD);
  }

  // ---- 08 who ------------------------------------------------------------
  const dem = r.demographics;
  const anyDem = [dem.age, dem.sex, dem.rank, dem.nationality].some((c) => c.items.length > 0);
  s.section('08', 'Who the patients were');
  if (anyDem) {
    s.caption(
      `Counted per person, not per report: reports sharing a name and date of birth are one patient, and a ` +
        `report naming nobody is not counted at all. Any group of fewer than ${dem.min_cell} is not shown.`,
    );
    for (const [title, cells] of [
      ['Age', dem.age], ['Sex', dem.sex], ['Job on board', dem.rank], ['Nationality', dem.nationality],
    ] as [string, Cells][]) {
      if (!cells.items.length) continue;
      s.y -= 4;
      s.text(`${title} · ${cells.recorded} patient${cells.recorded === 1 ? '' : 's'}`, {
        size: 7.5, bold: true, color: MUTED, dy: 12,
      });
      const mx = Math.max(1, ...cells.items.map((c) => c.n));
      for (const c of cells.items) s.bar(c.label, c.n, mx);
    }
  } else {
    s.caption(
      `Not reported. Age, sex, job and nationality are optional boxes on the report form, and this fleet's ` +
        `reports do not carry enough of them to describe anybody without identifying an individual. ` +
        `${op.unidentified_reports ?? 0} reports name nobody and give no date of birth, so they cannot say who ` +
        `the patient was.`,
    );
  }

  // ---- methodology -------------------------------------------------------
  s.section('', 'Methodology and limits');
  for (const note of [
    'Scope. Every session run by an account attached to this organisation. Sessions run without signing in, ' +
      'or through an integrator, are not attributed to a fleet and are absent.',
    'Complaints. Counted only when the recorded chief symptom matches one of Marina’s 44 clinical pathways. ' +
      'Anything else is unclassified and reported as such rather than dropped.',
    'Urgency. Derived from the red flag, the Maritime Early Warning Score computed from recorded vitals, and ' +
      'the level of consciousness. A report carrying no observations is not graded.',
    'People. There is no patient identifier in Marina, by design. Two reports are the same patient only when ' +
      'they share a name and date of birth on one account; a report giving neither cannot describe a person ' +
      'and is excluded from the demographic figures.',
    'Privacy. This document contains no patient name, no symptom in anyone’s own words, no transcript and ' +
      'no vital-sign value.',
  ]) {
    s.need(24);
    s.caption(note);
    s.y -= 1;
  }

  // ---- footer on every page ---------------------------------------------
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawLine({
      start: { x: M, y: M + 16 }, end: { x: A4.w - M, y: M + 16 },
      thickness: 0.7, color: RULE,
    });
    p.drawText(ascii(`Marina Health · Fleet Activity Summary · ${org}`), {
      x: M, y: M + 6, size: 6.5, font, color: MUTED,
    });
    const pn = `${i + 1} / ${pages.length}`;
    p.drawText(pn, {
      x: A4.w - M - font.widthOfTextAtSize(pn, 6.5), y: M + 6, size: 6.5, font, color: MUTED,
    });
  });

  return doc.save();
}
