import { calculateMEWS, type MEWSInput } from './mewsCalculator.js';
import type { VitalSign } from './interviewTypes.js';

/**
 * Vital-sign trend across the encounters of a case.
 *
 * REGULATORY LINE — read before extending this file.
 *
 * This module does arithmetic and nothing else: it reads the vitals already
 * recorded by logVitalSign, scores each encounter with the existing M-EWS
 * calculator, and reports the difference between consecutive scores.
 *
 * It must not decide anything. No "deteriorating" flag, no "escalate" advice,
 * no threshold that means "call the doctor". That judgement is the Advisor's,
 * and the Advisor is the part that needs medical device approval. Charting a
 * number over time needs none; telling the officer what the number means
 * does. Keeping that boundary inside this one file is what lets the reminder
 * and the trend line ship now rather than in 2027.
 */

/** First number in a free-text value. "120/80" → 120, "37,4 °C" → 37.4. */
function firstNumber(raw: string): number | null {
  const match = String(raw).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = parseFloat(match[0]);
  return Number.isFinite(n) ? n : null;
}

function normalizeAvpu(raw: string): MEWSInput['avpu'] {
  const v = String(raw).trim().toLowerCase();
  if (v.startsWith('a')) return 'Alert';
  if (v.startsWith('v')) return 'Voice';
  if (v.startsWith('p')) return 'Pain';
  if (v.startsWith('u')) return 'Unresponsive';
  return null;
}

/**
 * Fold the vitals recorded during one encounter into M-EWS inputs.
 *
 * logVitalSign records free text — `{ type: 'Pressure', value: '128/84',
 * unit: 'mmHg' }` — so the type match is lenient and the value is parsed
 * rather than trusted. When a vital is taken twice in one encounter the later
 * reading wins, which is the order the array is already in.
 */
export function vitalsToMewsInput(vitals: VitalSign[] | null | undefined): MEWSInput {
  const input: MEWSInput = {
    pulse_per_min: null,
    respiration_per_min: null,
    temperature_celsius: null,
    blood_pressure_systolic: null,
    oxygen_saturation_percent: null,
    oxygen_requirements: null,
    avpu: null,
  };

  for (const vital of vitals ?? []) {
    const type = String(vital?.type ?? '').toLowerCase();
    const value = String(vital?.value ?? '');
    if (!type || !value) continue;

    if (type.includes('pulse') || type.includes('heart')) {
      input.pulse_per_min = firstNumber(value);
    } else if (type.includes('respir') || type.includes('breath')) {
      input.respiration_per_min = firstNumber(value);
    } else if (type.includes('temp')) {
      input.temperature_celsius = firstNumber(value);
    } else if (type.includes('pressure') || type.includes('bp')) {
      // Systolic is the first number of "128/84".
      input.blood_pressure_systolic = firstNumber(value);
    } else if (type.includes('oxygen') || type.includes('spo2') || type.includes('sat')) {
      input.oxygen_saturation_percent = firstNumber(value);
    } else if (type.includes('avpu') || type.includes('conscious')) {
      input.avpu = normalizeAvpu(value);
    }
  }

  return input;
}

export interface TrendEncounter {
  id: string;
  encounter_seq: number | null;
  vital_signs: VitalSign[] | null;
  created_at: Date;
  last_message_at: Date;
}

export interface TrendPoint {
  conversation_id: string;
  encounter_seq: number | null;
  recorded_at: Date;
  vitals: MEWSInput;
  /** null when the encounter recorded no vitals at all. */
  mews: { total_score: number; missing_values: string[] } | null;
  /** Difference from the previous *scored* encounter. Arithmetic, not a verdict. */
  delta: number | null;
}

export function buildTrend(encounters: TrendEncounter[]): TrendPoint[] {
  let previousScore: number | null = null;

  return encounters.map((encounter) => {
    const vitals = vitalsToMewsInput(encounter.vital_signs);
    const hasAny = Object.values(vitals).some((v) => v !== null);

    if (!hasAny) {
      return {
        conversation_id: encounter.id,
        encounter_seq: encounter.encounter_seq,
        recorded_at: encounter.last_message_at ?? encounter.created_at,
        vitals,
        mews: null,
        delta: null,
      };
    }

    const result = calculateMEWS(vitals);
    const delta = previousScore === null ? null : result.total_score - previousScore;
    previousScore = result.total_score;

    return {
      conversation_id: encounter.id,
      encounter_seq: encounter.encounter_seq,
      recorded_at: encounter.last_message_at ?? encounter.created_at,
      vitals,
      mews: { total_score: result.total_score, missing_values: result.missing_values },
      delta,
    };
  });
}
