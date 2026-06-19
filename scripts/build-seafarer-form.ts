/**
 * Build the fillable "Seafarer Medical Report" PDF.
 *
 * Chrome's print-to-PDF only produces a static rendering, so we:
 *   1. Render the styled HTML to an A4 PDF (the visual background) via Chromium.
 *   2. Measure every tagged box's geometry (relative to its A4 page) in the
 *      browser using the same print layout.
 *   3. Overlay real AcroForm fields (text / multiline / radio) onto the PDF
 *      with pdf-lib, aligned to those measured boxes.
 *
 * Run: npx tsx scripts/build-seafarer-form.ts
 */
import { chromium } from 'playwright-core';
import { PDFDocument, StandardFonts, rgb, PDFName, PDFString } from 'pdf-lib';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const TEMPLATES = join(process.cwd(), 'public', 'templates');
const HTML_PATH = join(TEMPLATES, 'seafarer-medical-report.html');
const OUT_PATH = join(TEMPLATES, 'seafarer-medical-report.pdf');
const GEOMETRY_PATH = join(TEMPLATES, 'body-map-geometry.json');

// Body-map clickable grid density (cells across the full silhouette viewBox).
// Only cells whose centre is inside the body outline become checkboxes, so the
// real count is roughly half of COLS*ROWS per figure.
const GRID_COLS = 9;
const GRID_ROWS = 22;

// CSS px (96 dpi) -> PDF pt (72 dpi)
const PX_TO_PT = 72 / 96;
// A4 in points
const A4_W = 595.28;
const A4_H = 841.89;

type FieldType = 'text' | 'multiline' | 'radio' | 'dropdown' | 'checkbox';
interface Measured {
  page: number;        // 0-based page index
  field: string;       // field / group name
  type: FieldType;
  value?: string;      // radio option export value
  options?: string;    // dropdown options, comma-separated
  x: number; y: number; w: number; h: number; // in CSS px, relative to its .page
}

function findChromium(): string {
  const base = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  // Prefer a known cached build; fall back to any chromium-* dir.
  const candidates = [
    join(base, 'chromium-1217', 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
  ];
  for (const c of candidates) if (existsSync(c)) return c;
  throw new Error('No cached Chromium found under ' + base + '. Run: npx playwright install chromium');
}

async function main() {
  const html = readFileSync(HTML_PATH, 'utf8');

  const browser = await chromium.launch({ executablePath: findChromium() });
  const page = await browser.newPage();
  await page.emulateMedia({ media: 'print' });
  await page.setContent(html, { waitUntil: 'networkidle' });

  // Measure each [data-field] box relative to its enclosing .page element.
  const measured: Measured[] = await page.evaluate(() => {
    const pages = Array.from(document.querySelectorAll<HTMLElement>('.page'));
    const out: any[] = [];
    for (let pi = 0; pi < pages.length; pi++) {
      const pageRect = pages[pi].getBoundingClientRect();
      const boxes = Array.from(pages[pi].querySelectorAll<HTMLElement>('[data-field]'));
      for (const el of boxes) {
        const r = el.getBoundingClientRect();
        out.push({
          page: pi,
          field: el.dataset.field,
          type: el.dataset.type,
          value: el.dataset.value,
          options: el.dataset.options,
          x: r.left - pageRect.left,
          y: r.top - pageRect.top,
          w: r.width,
          h: r.height,
        });
      }
    }
    return out;
  });

  // Measure the body-map silhouettes (for stamping pins at request time).
  const silhouettes: { view: string; page: number; x: number; y: number; w: number; h: number }[] =
    await page.evaluate(() => {
      const pages = Array.from(document.querySelectorAll<HTMLElement>('.page'));
      const out: any[] = [];
      for (let pi = 0; pi < pages.length; pi++) {
        const pageRect = pages[pi].getBoundingClientRect();
        // Measure the inner <svg>, which is the exact viewBox-mapped drawing area.
        for (const el of Array.from(pages[pi].querySelectorAll<HTMLElement>('[data-bodymap] svg'))) {
          const wrap = el.closest('[data-bodymap]') as HTMLElement;
          const r = el.getBoundingClientRect();
          out.push({
            view: wrap.dataset.bodymap,
            page: pi,
            x: r.left - pageRect.left,
            y: r.top - pageRect.top,
            w: r.width,
            h: r.height,
          });
        }
      }
      return out;
    });

  // Build the clickable grid: a cell is kept ONLY if its centre falls inside the
  // silhouette outline (tested via SVGPathElement.isPointInFill in the browser).
  // Skipping outside-the-body cells keeps the checkbox count — and file size — down.
  const gridCells: { view: string; col: number; row: number; nx: number; ny: number }[] =
    await page.evaluate(
      ({ cols, rows }) => {
        const out: any[] = [];
        for (const svg of Array.from(document.querySelectorAll<SVGSVGElement>('[data-bodymap] svg'))) {
          const wrap = svg.closest('[data-bodymap]') as HTMLElement;
          const path = svg.querySelector('path') as SVGPathElement;
          const vb = svg.viewBox.baseVal;
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const vx = vb.x + ((c + 0.5) * vb.width) / cols;
              const vy = vb.y + ((r + 0.5) * vb.height) / rows;
              const pt = svg.createSVGPoint();
              pt.x = vx;
              pt.y = vy;
              if (path.isPointInFill(pt)) {
                out.push({
                  view: wrap.dataset.bodymap,
                  col: c,
                  row: r,
                  nx: (vx - vb.x) / vb.width,
                  ny: (vy - vb.y) / vb.height,
                });
              }
            }
          }
        }
        return out;
      },
      { cols: GRID_COLS, rows: GRID_ROWS },
    );

  const pdfBytes = await page.pdf({
    width: '210mm',
    height: '297mm',
    printBackground: true,
    pageRanges: '1-2',
  });
  await browser.close();

  // ---- Overlay AcroForm fields ----
  const doc = await PDFDocument.load(pdfBytes);
  const form = doc.getForm();
  const pdfPages = doc.getPages();
  const helv = await doc.embedFont(StandardFonts.Helvetica);
  const navy = rgb(10 / 255, 75 / 255, 120 / 255); // #0a4b78 — matches the titles

  // Group radios so each named group gets one PDFRadioGroup with N options.
  const radioGroups = new Map<string, Measured[]>();
  for (const m of measured) {
    if (m.type === 'radio') {
      if (!radioGroups.has(m.field)) radioGroups.set(m.field, []);
      radioGroups.get(m.field)!.push(m);
    }
  }

  const toRect = (m: Measured, pad = 0) => {
    const ph = pdfPages[m.page].getHeight();
    return {
      x: m.x * PX_TO_PT - pad,
      y: ph - (m.y + m.h) * PX_TO_PT - pad,
      width: m.w * PX_TO_PT + pad * 2,
      height: m.h * PX_TO_PT + pad * 2,
    };
  };

  const textFields: { tf: ReturnType<typeof form.createTextField>; size: number }[] = [];
  for (const m of measured) {
    if (m.type === 'text' || m.type === 'multiline') {
      const tf = form.createTextField(m.field);
      if (m.type === 'multiline') tf.enableMultiline();
      const size = m.type === 'multiline' ? 9 : 10;
      tf.addToPage(pdfPages[m.page], { ...toRect(m), borderWidth: 0, font: helv, textColor: navy });
      tf.setFontSize(size);
      textFields.push({ tf, size });
    }
  }

  for (const [name, opts] of radioGroups) {
    const rg = form.createRadioGroup(name);
    for (const o of opts) {
      // visible navy box + white fill so the single-select option is clearly
      // clickable in every state; shows a navy dot when chosen.
      rg.addOptionToPage(o.value || 'on', pdfPages[o.page], {
        ...toRect(o, 0.5),
        borderWidth: 1,
        borderColor: navy,
        backgroundColor: rgb(1, 1, 1),
      });
    }
  }

  // Standalone checkboxes (e.g. AVPU). The widget draws its own navy box + white
  // fill so it's clearly clickable in every state, with a navy check when ticked.
  for (const m of measured) {
    if (m.type === 'checkbox') {
      const cb = form.createCheckBox(m.field);
      cb.addToPage(pdfPages[m.page], {
        ...toRect(m, 0.5),
        borderWidth: 1,
        borderColor: navy,
        backgroundColor: rgb(1, 1, 1),
        textColor: navy,
      });
    }
  }

  const dropdownFields: ReturnType<typeof form.createDropdown>[] = [];
  const ddBorder = rgb(0.78, 0.83, 0.88); // matches --border
  for (const m of measured) {
    if (m.type === 'dropdown') {
      const dd = form.createDropdown(m.field);
      dd.addOptions((m.options || '').split(',').map((s) => s.trim()).filter(Boolean));
      // White fill + thin border so it reads as a deliberate select control
      // (frames the viewer-drawn dropdown arrow instead of a faint empty box).
      dd.addToPage(pdfPages[m.page], {
        ...toRect(m),
        borderWidth: 1,
        borderColor: ddBorder,
        backgroundColor: rgb(1, 1, 1),
        font: helv,
        textColor: navy,
      });
      dd.setFontSize(9);
      dropdownFields.push(dd);
    }
  }

  // Clickable body-map grid: a borderless, transparent checkbox over each
  // in-body cell. Invisible until ticked, then it shows a navy mark — so the
  // figure stays clean and clicking a spot "marks" it, in Preview/Acrobat/browser.
  const silByView = new Map(silhouettes.map((s) => [s.view, s]));
  for (const cell of gridCells) {
    const s = silByView.get(cell.view);
    if (!s) continue;
    const cw = (s.w / GRID_COLS) * PX_TO_PT;
    const ch = (s.h / GRID_ROWS) * PX_TO_PT;
    const size = Math.min(cw, ch) * 0.9;
    const ph = pdfPages[s.page].getHeight();
    const cx = (s.x + cell.nx * s.w) * PX_TO_PT;
    const cy = ph - (s.y + cell.ny * s.h) * PX_TO_PT;
    const cb = form.createCheckBox(`bm_${cell.view}_${cell.col}_${cell.row}`);
    cb.addToPage(pdfPages[s.page], {
      x: cx - size / 2,
      y: cy - size / 2,
      width: size,
      height: size,
      borderWidth: 0,
      textColor: navy,
    });
  }

  form.updateFieldAppearances(helv);

  // --- Make interactively-typed text navy in ANY viewer ---
  // A viewer renders text you type using the field's Default Appearance (DA)
  // string + the font it names, resolved via the AcroForm's Default Resources
  // (DR). pdf-lib's high-level DA helper is unreliable and leaves no /DR, so we
  // wire both up at the low level with a base-14 Helvetica named /Helv.
  const ctx = doc.context;
  const NAVY = '0.039 0.294 0.471 rg'; // #0a4b78

  const helvFontRef = ctx.register(
    ctx.obj({ Type: 'Font', Subtype: 'Type1', BaseFont: 'Helvetica', Encoding: 'WinAnsiEncoding' }),
  );
  const dr = ctx.obj({ Font: ctx.obj({ Helv: helvFontRef }) });

  const acro = form.acroForm.dict;
  acro.set(PDFName.of('DR'), dr);
  acro.set(PDFName.of('DA'), PDFString.of(`/Helv 10 Tf ${NAVY}`));

  for (const { tf, size } of textFields) {
    const da = PDFString.of(`/Helv ${size} Tf ${NAVY}`);
    tf.acroField.dict.set(PDFName.of('DA'), da);
    for (const w of tf.acroField.getWidgets()) w.dict.set(PDFName.of('DA'), da);
  }
  for (const dd of dropdownFields) {
    const da = PDFString.of(`/Helv 9 Tf ${NAVY}`);
    dd.acroField.dict.set(PDFName.of('DA'), da);
    for (const w of dd.acroField.getWidgets()) w.dict.set(PDFName.of('DA'), da);
  }
  const out = await doc.save();
  writeFileSync(OUT_PATH, out);

  // Emit silhouette geometry in PDF points (origin bottom-left), so the
  // request-time stamper can place a pin from a normalized (x,y) in [0,1]:
  //   pdfX = rect.x + nx * rect.w
  //   pdfY = rect.y + (1 - ny) * rect.h   (ny measured from the top down)
  const geometry = {
    pageWidth: A4_W,
    pageHeight: A4_H,
    silhouettes: silhouettes.map((s) => {
      const ph = pdfPages[s.page].getHeight();
      return {
        view: s.view,
        page: s.page,
        x: s.x * PX_TO_PT,
        y: ph - (s.y + s.h) * PX_TO_PT,
        w: s.w * PX_TO_PT,
        h: s.h * PX_TO_PT,
      };
    }),
  };
  writeFileSync(GEOMETRY_PATH, JSON.stringify(geometry, null, 2));

  console.log(`Wrote fillable PDF: ${OUT_PATH}`);
  console.log(`  text/multiline fields: ${measured.filter((m) => m.type !== 'radio').length}`);
  console.log(`  radio groups: ${radioGroups.size} (${[...radioGroups.keys()].join(', ')})`);
  console.log(`Wrote body-map geometry: ${GEOMETRY_PATH} (${geometry.silhouettes.map((s) => s.view).join(', ')})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
