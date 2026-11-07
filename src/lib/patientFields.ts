// ---------------------------------------------------------------------------
// patientFields.ts — the two patient fields with a fixed format on the report.
//
// The website and both apps show gender as a dropdown of Male / Female / Other
// and date of birth as a date picker holding dd/MM/yyyy. A value in any other
// form shows there as empty, while the PDF would still print it, so the officer
// could not review what goes out. The language model writes these as it hears
// them ("male", "12 March 1985"), so they are put in the report's form here.
//
// Anything that cannot be read safely stays as it is: a CPR number in the date
// of birth field, or a two-digit year, which would be a guess.
// ---------------------------------------------------------------------------

const GENDERS: Record<string, string> = {
  male: 'Male',
  m: 'Male',
  female: 'Female',
  f: 'Female',
  other: 'Other',
};

/** Male, Female or Other; anything else unchanged. */
export function normalizeGender(raw: string): string {
  return GENDERS[raw.trim().toLowerCase()] ?? raw;
}

/** The languages officers document in most; a date in another stays unchanged. */
const MONTH_LOCALES = ['en', 'da', 'nb', 'de', 'pl', 'sv', 'nl', 'fr', 'es', 'it', 'pt'];

const monthKey = (name: string) => name.toLowerCase().replace(/\.$/, '');

/** Month names to month numbers, in full and short, as nouns and in dates (Polish "marca"). */
const MONTHS: Map<string, number> = (() => {
  const months = new Map<string, number>();
  for (const locale of MONTH_LOCALES) {
    for (let month = 0; month < 12; month++) {
      const date = new Date(Date.UTC(2001, month, 15));
      for (const options of [
        { month: 'long' },
        { month: 'short' },
        { day: 'numeric', month: 'long' },
      ] as Intl.DateTimeFormatOptions[]) {
        const part = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
          .formatToParts(date)
          .find((p) => p.type === 'month');
        if (part) months.set(monthKey(part.value), month + 1);
      }
    }
  }
  return months;
})();

function dayFirst(day: number, month: number, year: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year) {
    return null;
  }
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

/** dd/MM/yyyy when the text is a complete date; anything else unchanged. */
export function normalizeDateOfBirth(raw: string): string {
  const text = raw.trim();

  // 12/03/1985, 12.03.1985, 12-03-1985: day first, as the report and Europe write it.
  const numeric = text.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (numeric) return dayFirst(+numeric[1], +numeric[2], +numeric[3]) ?? raw;

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return dayFirst(+iso[3], +iso[2], +iso[1]) ?? raw;

  // 12 March 1985, 12th of March 1985, 12. marts 1985
  const dayMonth = text.match(/^(\d{1,2})(?:st|nd|rd|th|\.)?\s+(?:of\s+)?([\p{L}]+)\.?,?\s+(\d{4})$/iu);
  if (dayMonth) {
    const month = MONTHS.get(monthKey(dayMonth[2]));
    return month ? dayFirst(+dayMonth[1], month, +dayMonth[3]) ?? raw : raw;
  }

  // March 12, 1985
  const monthDay = text.match(/^([\p{L}]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/iu);
  if (monthDay) {
    const month = MONTHS.get(monthKey(monthDay[1]));
    return month ? dayFirst(+monthDay[2], month, +monthDay[3]) ?? raw : raw;
  }

  return raw;
}

/** Put gender and date of birth in the form the report's fields hold. */
export function normalizePatientFields(summary: Record<string, string | boolean>): void {
  if (typeof summary.gender === 'string' && summary.gender) {
    summary.gender = normalizeGender(summary.gender);
  }
  if (typeof summary.dateOfBirth === 'string' && summary.dateOfBirth) {
    summary.dateOfBirth = normalizeDateOfBirth(summary.dateOfBirth);
  }
}
