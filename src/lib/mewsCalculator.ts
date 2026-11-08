/**
 * Maritime Early Warning Score (M-EWS) Calculator
 * CLASS A COMPLIANT: Informational monitoring score, NO clinical decision support
 *
 * Calculates M-EWS score based on vital signs as a reference tool.
 * M-EWS ≥3 indicates handbook monitoring guidelines apply.
 */

export interface MEWSInput {
  pulse_per_min: number | null
  respiration_per_min: number | null
  temperature_celsius: number | null
  blood_pressure_systolic: number | null
  oxygen_saturation_percent: number | null
  oxygen_requirements: 'air' | 'oxygen' | null
  avpu: 'Alert' | 'Voice' | 'Pain' | 'Unresponsive' | null
}

export interface MEWSResult {
  total_score: number
  heart_rate_score: number
  respiratory_rate_score: number
  temperature_score: number
  bp_score: number
  spo2_score: number
  oxygen_req_score: number
  consciousness_score: number
  is_reference_threshold: boolean
  missing_values: string[]
}

/**
 * Calculate Heart Rate score
 */
function calculateHeartRateScore(heartRate: number | null): number {
  if (heartRate === null) return 0

  if (heartRate < 41) return 2                    // Score 2: < 41 (severe bradycardia)
  if (heartRate >= 41 && heartRate <= 50) return 1  // Score 1: 41-50 (bradycardia)
  if (heartRate > 50 && heartRate <= 90) return 0   // Score 0: 51-90 (normal)
  if (heartRate > 90 && heartRate <= 110) return 1  // Score 1: 91-110 (mild tachycardia)
  if (heartRate > 110 && heartRate <= 130) return 2 // Score 2: 111-130 (moderate tachycardia)
  if (heartRate > 130) return 3                    // Score 3: > 130 (severe tachycardia)

  return 0
}

/**
 * Calculate Respiratory Rate score
 */
function calculateRespiratoryRateScore(respRate: number | null): number {
  if (respRate === null) return 0

  if (respRate < 9) return 3                    // Score 3: < 9 (severe bradypnea)
  if (respRate >= 9 && respRate < 12) return 1  // Score 1: 9-11 (bradypnea)
  if (respRate >= 12 && respRate <= 20) return 0 // Score 0: 12-20 (normal)
  if (respRate > 20 && respRate <= 24) return 2  // Score 2: 21-24 (tachypnea)
  if (respRate > 24) return 3                    // Score 3: > 24 (severe tachypnea)

  return 0
}

/**
 * Calculate Temperature score
 */
function calculateTemperatureScore(temp: number | null): number {
  if (temp === null) return 0

  if (temp < 35.0) return 3                    // Score 3: < 35.0°C (severe hypothermia)
  if (temp >= 35.0 && temp <= 35.5) return 1   // Score 1: 35.0-35.5°C (mild hypothermia)
  if (temp > 35.5 && temp <= 38.0) return 0    // Score 0: 35.6-38.0°C (normal)
  if (temp > 38.0 && temp <= 39.0) return 1    // Score 1: 38.1-39.0°C (low-grade fever)
  if (temp > 39.0 && temp <= 39.5) return 2    // Score 2: 39.1-39.5°C (high fever)
  if (temp > 39.5) return 3                    // Score 3: > 39.5°C (severe hyperpyrexia)

  return 0
}

/**
 * Calculate Systolic Blood Pressure score
 */
function calculateBloodPressureScore(systolic: number | null): number {
  if (systolic === null) return 0

  if (systolic < 91) return 3              // Score 3: < 91 (severe hypotension)
  if (systolic >= 91 && systolic <= 100) return 2   // Score 2: 91-100 (hypotension)
  if (systolic >= 101 && systolic <= 110) return 1  // Score 1: 101-110 (low-normal)
  if (systolic >= 111 && systolic <= 180) return 0  // Score 0: 111-180 (normal)
  if (systolic >= 181 && systolic <= 219) return 2  // Score 2: 181-219 (severe hypertension)
  if (systolic >= 220) return 3            // Score 3: ≥220 (hypertensive crisis)

  return 0
}

/**
 * Calculate Oxygen Saturation score
 */
function calculateSpO2Score(spo2: number | null): number {
  if (spo2 === null) return 0

  if (spo2 < 92) return 3                   // Score 3: < 92% (severe hypoxemia)
  if (spo2 >= 92 && spo2 < 94) return 2     // Score 2: 92-93% (moderate hypoxemia)
  if (spo2 >= 94 && spo2 <= 95) return 1    // Score 1: 94-95% (mild hypoxemia)
  if (spo2 > 95) return 0                   // Score 0: > 95% (normal)

  return 0
}

/**
 * Calculate Oxygen Requirements score
 */
function calculateOxygenRequirementsScore(oxygenReq: 'air' | 'oxygen' | null): number {
  if (oxygenReq === null) return 0

  if (oxygenReq === 'air') return 0
  if (oxygenReq === 'oxygen') return 2

  return 0
}

/**
 * Calculate Level of Consciousness score (AVPU)
 */
function calculateConsciousnessScore(avpu: 'Alert' | 'Voice' | 'Pain' | 'Unresponsive' | null): number {
  if (avpu === null) return 0

  if (avpu === 'Alert') return 0
  if (avpu === 'Voice' || avpu === 'Pain' || avpu === 'Unresponsive') return 3

  return 0
}

/**
 * Calculate complete M-EWS score
 *
 * @param input - Vital signs input
 * @returns M-EWS calculation result with detailed breakdown
 */
export function calculateMEWS(input: MEWSInput): MEWSResult {
  const heart_rate_score = calculateHeartRateScore(input.pulse_per_min)
  const respiratory_rate_score = calculateRespiratoryRateScore(input.respiration_per_min)
  const temperature_score = calculateTemperatureScore(input.temperature_celsius)
  const bp_score = calculateBloodPressureScore(input.blood_pressure_systolic)
  const spo2_score = calculateSpO2Score(input.oxygen_saturation_percent)
  const oxygen_req_score = calculateOxygenRequirementsScore(input.oxygen_requirements)
  const consciousness_score = calculateConsciousnessScore(input.avpu)

  const total_score =
    heart_rate_score +
    respiratory_rate_score +
    temperature_score +
    bp_score +
    spo2_score +
    oxygen_req_score +
    consciousness_score

  // Track missing values
  const missing_values: string[] = []
  if (input.pulse_per_min === null) missing_values.push('Heart Rate')
  if (input.respiration_per_min === null) missing_values.push('Respiratory Rate')
  if (input.temperature_celsius === null) missing_values.push('Temperature')
  if (input.blood_pressure_systolic === null) missing_values.push('Blood Pressure')
  if (input.oxygen_saturation_percent === null) missing_values.push('SpO2')
  if (input.oxygen_requirements === null) missing_values.push('Oxygen Requirements')
  if (input.avpu === null) missing_values.push('AVPU')

  // M-EWS ≥3 indicates reference threshold for handbook monitoring guidelines
  const is_reference_threshold = total_score >= 3

  return {
    total_score,
    heart_rate_score,
    respiratory_rate_score,
    temperature_score,
    bp_score,
    spo2_score,
    oxygen_req_score,
    consciousness_score,
    is_reference_threshold,
    missing_values
  }
}

/**
 * Get M-EWS handbook reference message
 * CLASS A COMPLIANT: Reference information only, NO clinical assessment
 */
export function getMEWSHandbookReference(score: number): string {
  if (score === 0) return 'M-EWS Score 0 - See routine vital signs monitoring guidelines (Handbook p.59)'
  if (score >= 1 && score <= 2) return 'M-EWS Score 1-2 - See increased monitoring protocol (Handbook p.59)'
  if (score >= 3 && score <= 4) return 'M-EWS Score 3-4 - See clinical escalation guidelines (Handbook p.59)'
  if (score >= 5) return 'M-EWS Score 5+ - See intensive monitoring protocol (Handbook p.59)'

  return 'Unable to calculate M-EWS'
}

// ---------------------------------------------------------------------------
// The score for a report (S2)
// ---------------------------------------------------------------------------

/** A date as written in a report: dd/MM/yyyy (also . or -), or yyyy-MM-dd. */
function parseReportDate(value: unknown): Date | null {
  const s = String(value ?? '').trim()
  let m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(s)
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]))
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return null
}

/**
 * True only when the date of birth shows the patient is under 16 on the report
 * date (today when the report has none). The M-EWS table is not validated for
 * children (RCO-37). A missing or unreadable date of birth is not a reason to
 * withhold the score: the officer often does not fill it in.
 */
export function isUnder16(dateOfBirth: unknown, onDate?: unknown): boolean {
  const born = parseReportDate(dateOfBirth)
  if (!born) return false
  const on = parseReportDate(onDate) ?? new Date()
  const sixteenth = new Date(Date.UTC(born.getUTCFullYear() + 16, born.getUTCMonth(), born.getUTCDate()))
  return on.getTime() < sixteenth.getTime()
}

type Avpu = 'Alert' | 'Voice' | 'Pain' | 'Unresponsive'

/**
 * The M-EWS input from the vitals on a report, as the officer last left them.
 * `fallback` supplies readings a form may carry elsewhere (the RMD vitals text).
 */
export function mewsInputFromSummary(
  summary: Record<string, unknown>,
  fallback: Partial<Record<'pulse' | 'respiratoryRate' | 'temperature' | 'systole' | 'oxygenSaturation', string>> = {},
): MEWSInput {
  const num = (v: unknown, alt?: string): number | null => {
    const raw = v === undefined || v === null || v === '' || typeof v === 'boolean' ? alt : v
    const n = parseFloat(String(raw ?? '').replace(',', '.').replace(/[^\d.-]/g, ''))
    return Number.isFinite(n) ? n : null
  }
  const avpu = String(summary.avpu ?? '')
  return {
    pulse_per_min: num(summary.circulation_pulse_per_min, fallback.pulse),
    respiration_per_min: num(summary.breathing_num_breaths_per_min, fallback.respiratoryRate),
    temperature_celsius: num(summary.expose_temperature_measured_mouth, fallback.temperature),
    blood_pressure_systolic: num(summary.circulation_systole, fallback.systole),
    oxygen_saturation_percent: num(summary.breathing_oxygen_saturation, fallback.oxygenSaturation),
    oxygen_requirements: null,
    avpu: (['Alert', 'Voice', 'Pain', 'Unresponsive'].includes(avpu) ? avpu : null) as Avpu | null,
  }
}

/**
 * The M-EWS total for a report, recalculated from its vitals so it always
 * matches the numbers printed beside it. Null when the patient is under 16, or
 * when the report has no vitals at all.
 */
export function mewsForSummary(
  summary: Record<string, unknown>,
  fallback: Parameters<typeof mewsInputFromSummary>[1] = {},
): number | null {
  if (isUnder16(summary.dateOfBirth, summary.date)) return null
  const input = mewsInputFromSummary(summary, fallback)
  if (!Object.values(input).some((v) => v !== null)) return null
  return calculateMEWS(input).total_score
}
