/**
 * Fill the Marina seafarer medical report with pdf-lib.
 *
 * The form is *built* with pdf-lib (navy field DA, radio groups, checkboxes), so
 * we fill it the same way rather than via pdftk: pdftk writes a radio's /V but
 * not the widget appearance state, so selections render invisible. pdf-lib's
 * select()/setText() set both value and appearance correctly and in-process.
 */
import { PDFDocument, PDFName, PDFArray, PDFBool, type PDFForm } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';

/** A field value: plain text, or a radio selection `{ value, onValue }`. */
export type SeafarerFieldValue = string | { value: boolean; onValue: string };

/**
 * Select a radio option at the low level. pdf-lib builds radio widgets with
 * numeric on-states (/0../n); the semantic names live in /Opt (written at build
 * time). Map name → index, then set the field /V and each widget /AS so the
 * selection both stores and *renders* (pdf-lib's getRadioGroup mis-types the
 * round-tripped field as a checkbox, so we avoid its high-level API).
 */
function selectRadio(form: PDFForm, name: string, exportValue: string): void {
  const field = form.getField(name);
  const acro = field.acroField;
  const opt = acro.dict.lookup(PDFName.of('Opt'));
  const names =
    opt instanceof PDFArray ? opt.asArray().map((v) => (v as { decodeText?: () => string }).decodeText?.() ?? '') : [];
  const idx = names.indexOf(exportValue);
  if (idx < 0) throw new Error(`option "${exportValue}" not in /Opt [${names.join(',')}]`);

  const onState = PDFName.of(String(idx));
  const off = PDFName.of('Off');
  acro.dict.set(PDFName.of('V'), onState);
  acro.getWidgets().forEach((w, i) => w.dict.set(PDFName.of('AS'), i === idx ? onState : off));
}

export async function fillSeafarerForm(
  data: Record<string, SeafarerFieldValue>,
  outputPath: string,
): Promise<Buffer> {
  const templatePath = path.join(process.cwd(), 'public/templates/seafarer-medical-report.pdf');
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Seafarer template not found at: ${templatePath}`);
  }

  const doc = await PDFDocument.load(fs.readFileSync(templatePath));
  const form = doc.getForm();

  // 1) Text fields. We set the value only and deliberately DO NOT bake the
  //    appearance: pdf-lib's updateFieldAppearances ignores the field DA colour
  //    and bakes black text. Instead we set NeedAppearances below so viewers
  //    regenerate the text from the navy DA (the same path interactive typing
  //    uses) — keeping the filled values in the brand navy.
  for (const [name, value] of Object.entries(data)) {
    if (typeof value !== 'string' || value === '') continue;
    try {
      form.getTextField(name).setText(value);
    } catch (err) {
      console.warn(`[seafarerPdf] skipped text "${name}":`, (err as Error).message);
    }
  }

  // 2) Radio selections (explicit /V + /AS so the chosen dot renders).
  for (const [name, value] of Object.entries(data)) {
    if (typeof value === 'string' || !value?.value) continue;
    try {
      selectRadio(form, name, value.onValue);
    } catch (err) {
      console.warn(`[seafarerPdf] skipped radio "${name}":`, (err as Error).message);
    }
  }

  // Tell viewers to (re)generate field appearances from each field's DA, so the
  // filled text renders navy rather than pdf-lib's baked black.
  form.acroForm.dict.set(PDFName.of('NeedAppearances'), PDFBool.True);

  const bytes = await doc.save({ updateFieldAppearances: false });
  const buffer = Buffer.from(bytes);
  fs.writeFileSync(outputPath, buffer);
  return buffer;
}
