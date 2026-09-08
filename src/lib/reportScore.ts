/**
 * Score a finished report against the SYBRA protocol, and keep the result.
 *
 * The ship app already does this live: report-score-engine.ts calls the eight
 * judges, shows the officer a percentage per section and one overall, and then
 * throws it away. Nothing is persisted, so a fleet office cannot be told
 * anything about how good its records are.
 *
 * ---------------------------------------------------------------------------
 * What this computes, and what it deliberately does not
 *
 * The ship app's headline — "Quality 37%" — is the mean over EVERY field on the
 * report. Fields with no judge score 100 when filled and 0 when blank, so the
 * number folds the ship's call sign and the report date in with the clinical
 * content. That is right for an officer filling a form: it tells them what is
 * still empty.
 *
 * It is the wrong number for a fleet office, and reproducing it here would mean
 * porting report-schema.ts into this repo — a second copy of a definition,
 * which is exactly the failure that put a wrong M-EWS in the dashboard earlier.
 *
 * So this computes the CLINICAL score: the mean of the eight judged sections,
 * and nothing else. It is one implementation, it lives beside the judges it
 * calls, and it can be backfilled over reports written months ago.
 *
 * ---------------------------------------------------------------------------
 * The rule the whole file exists to protect
 *
 * A judge we could not reach is UNKNOWN, never 0 — the engine's own words.
 * Zero is a judgement; an unreachable judge means we have not made one. An
 * unknown field leaves the denominator entirely, so a satellite outage during
 * scoring lowers confidence in the number rather than the number itself.
 */
import { scoreProblemDescription } from './problemScore';
import { scoreAssociatedSymptoms } from './associatedSymptomsScore';
import { scorePastMedicalHistory } from './pastMedicalHistoryScore';
import { scoreAllergies } from './allergyScore';
import { scoreMedications } from './medicationScore';
import { scoreInvestigations } from './investigationScore';
import { scorePhysicalExamination } from './physicalExaminationScore';
import { scoreVitalSigns } from './vitalSignsScore';
import { query } from './db';

/** The eight judged sections, in the order the interview reaches them. */
export const SCORED_FIELDS = [
  'problem', 'associatedSymptoms', 'pastMedicalHistory', 'allergies',
  'medications', 'investigations', 'physicalExamination', 'vitalSigns',
] as const;
export type ScoredField = (typeof SCORED_FIELDS)[number];

export interface ReportScore {
  /** 0-100 per section. A section the judge could not be asked about is absent. */
  fields: Partial<Record<ScoredField, number>>;
  /** Mean of the sections we have a verdict for; null when we have none. */
  clinical: number | null;
  /** Sections whose judge could not be reached. Never scored 0. */
  unknown: ScoredField[];
  scored_at: string;
  /** Which model family produced this, so a later change is traceable. */
  engine: string;
}

type Summary = Record<string, string | undefined>;
const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * A judge result becomes a number, an unknown, or an earned zero.
 *
 * `scorable: false` is the judge saying "nothing is documented here", which is
 * a real 0. A thrown error is not — that is the unreachable case.
 */
async function judge(
  field: ScoredField,
  run: () => Promise<{ scorable: boolean; score: number | null }>,
): Promise<{ field: ScoredField; value: number | null; unknown: boolean }> {
  try {
    const r = await run();
    if (!r.scorable || r.score === null) return { field, value: 0, unknown: false };
    return { field, value: Math.round(r.score), unknown: false };
  } catch (err) {
    console.warn(`[reportScore] ${field} judge unreachable:`, (err as Error).message);
    return { field, value: null, unknown: true };
  }
}

export async function scoreReport(summary: Summary): Promise<ReportScore> {
  const chiefComplaint = s(summary.chiefComplaint) || s(summary.chiefSymptom);
  const caseSummary = [s(summary.problemDescription), s(summary.pastHistory)]
    .filter(Boolean).join('\n');
  const gender = s(summary.gender);

  const results = await Promise.all([
    judge('problem', () =>
      scoreProblemDescription({ problemDescription: s(summary.problemDescription), chiefComplaint })),
    judge('associatedSymptoms', () =>
      scoreAssociatedSymptoms({ associatedSymptoms: s(summary.associatedSymptoms), chiefComplaint })),
    judge('pastMedicalHistory', () =>
      scorePastMedicalHistory({ pastMedicalHistory: s(summary.pastHistory), chiefComplaint })),
    judge('allergies', () => scoreAllergies(s(summary.allergies))),
    judge('medications', () => scoreMedications(s(summary.currentMedications))),
    judge('investigations', () =>
      scoreInvestigations({
        documentation: s(summary.investigations), chiefComplaint, gender,
        temperatureCelsius: s(summary.expose_temperature_measured_mouth), caseSummary,
      })),
    judge('physicalExamination', () =>
      scorePhysicalExamination({
        documentation: s(summary.exam), chiefComplaint, gender, caseSummary,
      })),
    // Deterministic, not an LLM call — it cannot be unreachable.
    judge('vitalSigns', async () =>
      scoreVitalSigns({
        temperatureCelsius: s(summary.expose_temperature_measured_mouth),
        respiratoryRate: s(summary.breathing_num_breaths_per_min),
        pulse: s(summary.circulation_pulse_per_min),
        systolic: s(summary.circulation_systole),
        spo2: s(summary.breathing_oxygen_saturation),
        avpu: s(summary.avpu),
      })),
  ]);

  const fields: Partial<Record<ScoredField, number>> = {};
  const unknown: ScoredField[] = [];
  for (const r of results) {
    if (r.unknown) unknown.push(r.field);
    else fields[r.field] = r.value ?? 0;
  }
  const known = Object.values(fields);

  return {
    fields,
    clinical: known.length
      ? Math.round(known.reduce((a, b) => a + b, 0) / known.length)
      : null,
    unknown,
    scored_at: new Date().toISOString(),
    engine: 'sybra-v1',
  };
}

/**
 * Score a report and store it, without ever delaying or failing the request
 * that produced it.
 *
 * Called fire-and-forget after extraction: eight judges would add seconds to a
 * report an officer is waiting for, and the fleet dashboard does not need the
 * number for minutes. If it fails, the report is unaffected and the score is
 * simply absent — which the dashboard already knows how to say.
 */
export function scoreAndStore(conversationId: string, summary: Summary): void {
  void (async () => {
    try {
      const score = await scoreReport(summary);
      await query(
        `UPDATE conversations SET report_score = $2::jsonb WHERE id = $1`,
        [conversationId, JSON.stringify(score)],
      );
      console.log(
        `[reportScore] ${conversationId} clinical=${score.clinical}` +
          (score.unknown.length ? ` unknown=[${score.unknown.join(',')}]` : ''),
      );
    } catch (err) {
      console.error('[reportScore] not stored:', (err as Error).message);
    }
  })();
}
