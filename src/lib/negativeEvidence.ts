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

// ---------------------------------------------------------------------------
// Allergies: each one must be stated as an allergy in the transcript.
//
// Wording alone did not stop the model from inventing (SWT, 2026-11-10): a rash
// became "mild", "badly" became "severe", and once "ibuprofen makes her stomach
// upset" was listed as an allergy although nobody called it one. So the model
// now returns each allergy with the words of the transcript that state it, and
// an allergy is kept only if
//   1. those words are really in the transcript, and
//   2. an allergy word ("allergic", "allergisk", "uczulony", …) is in those
//      words or just before them — in an interview the word is usually in
//      Marina's question and the patient answers only "penicillin".
// An allergy that fails is left out. The field is then empty or shorter, and
// the completeness check asks for it, as for a topic not discussed.
// ---------------------------------------------------------------------------

/**
 * "Allergy" / "allergic" in each language Marina supports, as stems. Matched
 * on normalised text, so case and punctuation do not matter.
 */
export const ALLERGY_WORDS = [
  'allerg', // en da no sv de nl fr it fi hu
  'alerg', 'alérg', // pl es pt ro hr cs sk id ms
  'uczul', // pl uczulony, uczulenie
  'overfølsom', 'overfolsom', 'överkänslig', // da no sv
  'alerji', // tr
  'alerdy', 'alerhi', // tl
  'аллерг', 'алерг', // ru uk bg
  'αλλεργ', // el
  'dị ứng', // vi
  '过敏', '過敏', // zh
  'アレルギー', // ja
  '알레르기', // ko
  'एलर्जी', // hi
  'ஒவ்வாமை', 'அலர்ஜி', // ta
  'حساسي', // ar
].map(normalizeForMatch);

/** A quote may run over this many sentences ("…a rash. It has happened twice."). */
const MAX_SENTENCES_PER_QUOTE = 4;

export interface AllergyItem {
  entry?: unknown;
  quote?: unknown;
}

const hasAllergyWord = (normalized: string) => ALLERGY_WORDS.some(w => normalized.includes(w));

/**
 * True if the quote is in the transcript and an allergy word is in the
 * sentences it covers, or in the question asked just before them.
 *
 * Sentences, not a distance in characters: "She is allergic to penicillin.
 * Ibuprofen upsets her stomach." puts an allergy word a few words before the
 * ibuprofen sentence, which must still not count.
 */
export function allergyStated(quote: unknown, transcript: string): boolean {
  if (!quoteInTranscript(quote, transcript)) return false;
  const q = normalizeForMatch(quote as string);
  // Sentence ends and line breaks; turns are separated by blank lines.
  const sentences = transcript
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map(raw => ({ text: normalizeForMatch(raw), question: /[?？]\s*$/.test(raw.trim()) }))
    .filter(s => s.text);

  for (let i = 0; i < sentences.length; i++) {
    let span = '';
    let rest = ''; // the span without sentence i
    for (let j = i; j < Math.min(sentences.length, i + MAX_SENTENCES_PER_QUOTE); j++) {
      span = span ? `${span} ${sentences[j].text}` : sentences[j].text;
      if (j > i) rest = rest ? `${rest} ${sentences[j].text}` : sentences[j].text;
      if (!span.includes(q)) continue;
      // The quote starts in a later sentence; that sentence's own turn judges
      // it, or sentence i's allergy word would vouch for it.
      if (rest.includes(q)) break;
      if (hasAllergyWord(span)) return true;
      // An interview answer ("penicillin") to a question about allergies.
      const before = sentences[i - 1];
      if (before?.question && hasAllergyWord(before.text)) return true;
      break;
    }
  }
  return false;
}

/**
 * Build "allergies" from the allergies the transcript states, and remove the
 * item list so it never reaches the report. Runs before verifyNegatives.
 */
export function verifyAllergies(summary: Record<string, unknown>, transcript: string): void {
  const items = Array.isArray(summary.allergyItems) ? (summary.allergyItems as AllergyItem[]) : [];
  delete summary.allergyItems;

  const kept = items
    .filter(i => typeof i?.entry === 'string' && i.entry.trim())
    .filter(i => {
      if (allergyStated(i.quote, transcript)) return true;
      console.log('[v2/ai/extract] allergies: an allergy not stated in the transcript, left out');
      return false;
    })
    .map(i => {
      const entry = (i.entry as string).trim();
      return /[.!?]$/.test(entry) ? entry : `${entry}.`;
    });

  if (kept.length > 0) {
    // A stated allergy outranks "No known allergies." from the same transcript.
    summary.allergies = kept.join(' ');
    summary.allergiesEvidence = '';
    return;
  }
  // Nothing verified: only the negative may stand (checked by verifyNegatives);
  // any other text the model put straight into the field is not trusted.
  if (!isNegative(summary.allergies, 'No known allergies.')) summary.allergies = '';
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
