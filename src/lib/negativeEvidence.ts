// ---------------------------------------------------------------------------
// negativeEvidence.ts — a stated negative must be found in the transcript.
//
// "No regular medications." and "No known allergies." tell the doctor ashore
// that the question was asked and answered. The language model sometimes wrote
// them when the topic never came up (SWT-10: 4 of 79 runs of a dictation with
// no word about medicines), and the completeness check then scored the field as
// complete, so nobody asked.
//
// The model now also returns the words of the transcript that state the
// negative. The negative is kept only if those words are really in the
// transcript; otherwise the field is left empty, as for a topic not discussed.
// The quote itself never reaches the report.
// ---------------------------------------------------------------------------

/** The two negative statements, the field each belongs to, and its evidence key. */
export const NEGATIVES = [
  { field: 'currentMedications', text: 'No regular medications.', evidence: 'currentMedicationsEvidence' },
  { field: 'allergies', text: 'No known allergies.', evidence: 'allergiesEvidence' },
] as const;

/** Lower case, punctuation and repeated spaces removed; letters of any script kept. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** True if the quote is a real part of the transcript and long enough to mean something. */
export function quoteInTranscript(quote: unknown, transcript: string): boolean {
  if (typeof quote !== 'string') return false;
  const q = normalizeForMatch(quote);
  // One word ("no", "nej") would match almost any transcript.
  if (q.split(' ').length < 2) return false;
  return normalizeForMatch(transcript).includes(q);
}

const isNegative = (value: unknown, text: string) =>
  typeof value === 'string' && normalizeForMatch(value) === normalizeForMatch(text);

/**
 * Keep each negative only if its quote is in the transcript, and remove the
 * evidence keys so they never reach the report.
 */
export function verifyNegatives(summary: Record<string, string | boolean>, transcript: string): void {
  for (const n of NEGATIVES) {
    if (isNegative(summary[n.field], n.text) && !quoteInTranscript(summary[n.evidence], transcript)) {
      console.log(`[v2/ai/extract] ${n.field}: negative without evidence in the transcript, left empty`);
      summary[n.field] = '';
    }
    delete summary[n.evidence];
  }
}
