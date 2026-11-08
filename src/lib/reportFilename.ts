import type { PdfTemplate } from './emailQueue';

/**
 * The name of a downloaded or e-mailed report: form, patient's last name and
 * report date, so reports in one folder are told apart (SWT-13). The website
 * names its downloads with the same rule (eu.marinahealth.eu lib/report-filename.ts).
 */
const TEMPLATE_SLUGS: Record<PdfTemplate, string> = {
  marina: 'marina',
  rmd: 'danish-maritime-authority',
  german: 'tmas-germany',
  norwegian: 'radio-medico-norway',
};

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/æ/g, 'ae').replace(/ø/g, 'o').replace(/å/g, 'a').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

export function reportFilename(
  template: PdfTemplate,
  summary: { patientLastName?: unknown; date?: unknown } | null | undefined,
): string {
  const lastName = typeof summary?.patientLastName === 'string' ? slug(summary.patientLastName) : '';
  const date = (typeof summary?.date === 'string'
    ? summary.date.replace(/[^0-9]+/g, '-').replace(/^-+|-+$/g, '') : '') || today();
  return [TEMPLATE_SLUGS[template] ?? 'marina', 'medical-report', lastName, date].filter(Boolean).join('-') + '.pdf';
}
