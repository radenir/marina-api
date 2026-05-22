import { nebius } from './nebius.js';
import { config } from '../config.js';
import {
  examinationDisplayNames,
  examinationIds,
  getPhysicalExaminationMarker,
  symptomGuidelines as _symptomGuidelines,
} from './symptomGuidelines.js';
import { examinationInstructions as _examinationInstructions } from './examinationInstructions.js';

export type ConversationMessage = { role: string; content: unknown };

export interface ExamFollowupsInput {
  conversation: ConversationMessage[];
  summary: Record<string, unknown>;
  medicalOfficerLanguage: string;
  patientLanguage: string;
  symptom?: string;
  mode: 'marina' | 'note_taker' | 'translator';
  /**
   * Questions the officer has already asked or declined this session, keyed
   * by display name + question number. Used to filter the candidate pool so
   * the LLM never re-suggests an item the officer has already seen.
   */
  askedExamQuestions?: Array<{ examName: string; questionNumber: number }>;
}

export interface ExamFollowupQuestion {
  /** Canonical English exam name from the SYBRA library — also the lookup key the frontend uses for video assignment. */
  examName: string;
  /** Exam name translated into the medical officer's language (for display only). */
  examNameOfficer: string;
  /** Exam name translated into the patient's language (for display only). */
  examNamePatient: string;
  examMarker: string;
  questionNumber: number;
  totalQuestions: number;
  /** Question text translated into the medical officer's language (officer-facing instruction). */
  question: string;
  /** Question rephrased and translated into the patient's language (what the officer would say aloud to the patient). */
  questionPatient: string;
  /** Original English question text from the SYBRA library. */
  questionOriginal: string;
}

export interface ExamFollowupsResult {
  symptom: string | null;
  examFollowUps: ExamFollowupQuestion[];
}

type SymptomGuideline = {
  Examinations: number[];
};

const symptomGuidelines = _symptomGuidelines as unknown as Record<string, SymptomGuideline>;
const examinationInstructions = _examinationInstructions as unknown as Record<number, string>;

const SYMPTOM_LIST = Object.keys(symptomGuidelines);

interface ParsedExamQuestion {
  examId: number;
  examName: string;
  questionNumber: number;
  totalQuestions: number;
  text: string;
}

/**
 * Parse an examinationInstructions[id] template literal into one record per
 * question. Each header line `<Name>:Q<n>/<total>:` starts a new question,
 * and all bullet lines (`•`) that follow before the next header are joined
 * into that question's text.
 */
function parseExamScript(examId: number, raw: string): ParsedExamQuestion[] {
  const out: ParsedExamQuestion[] = [];
  const headerRe = /^\s*(.+?):Q(\d+)\/(\d+):\s*$/;
  const bulletRe = /^\s*•\s*(.+?)\s*$/;

  let current: ParsedExamQuestion | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (current) {
      current.text = buffer.join('\n').trim();
      out.push(current);
    }
    current = null;
    buffer = [];
  };

  for (const line of raw.split('\n')) {
    const header = headerRe.exec(line);
    if (header) {
      flush();
      current = {
        examId,
        examName: header[1].trim(),
        questionNumber: Number(header[2]),
        totalQuestions: Number(header[3]),
        text: '',
      };
      continue;
    }
    const bullet = bulletRe.exec(line);
    if (bullet && current) {
      buffer.push(bullet[1]);
    }
  }
  flush();
  return out;
}

function buildPoolForSymptom(symptom: string): ParsedExamQuestion[] {
  const guideline = symptomGuidelines[symptom];
  if (!guideline) return [];
  return buildPoolForIds(guideline.Examinations ?? []);
}

// Fallback pool used when the case has no identified chief complaint yet
// (fresh intake). Universally useful baseline assessments.
const BASELINE_EXAM_IDS = [
  examinationIds.GENERAL_APPEARANCE,
  examinationIds.VITAL_SIGNS,
];

function buildBaselinePool(): ParsedExamQuestion[] {
  return buildPoolForIds(BASELINE_EXAM_IDS);
}

function buildPoolForIds(ids: number[]): ParsedExamQuestion[] {
  const pool: ParsedExamQuestion[] = [];
  for (const id of ids) {
    const script = examinationInstructions[id];
    if (!script) continue;
    const parsed = parseExamScript(id, script);
    const canonical = examinationDisplayNames[id];
    for (const q of parsed) {
      if (canonical) q.examName = canonical;
      pool.push(q);
    }
  }
  return pool;
}

function resolveLanguageName(input: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(input);
    if (name && name.toLowerCase() !== input.toLowerCase()) return name;
  } catch {
    // fall through
  }
  return input;
}

function conversationText(history: ConversationMessage[]): string {
  return history
    .filter(
      m =>
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string' &&
        (m.content as string).trim().length > 0,
    )
    .map(m => `${m.role === 'assistant' ? 'MARINA' : 'USER'}: ${String(m.content)}`)
    .join('\n\n');
}

/**
 * Classify a free-form transcript into one of the 41 SYBRA symptoms. Used
 * only for note_taker / translator modes where no symptom is logged. Returns
 * null if the model can't confidently pick one.
 */
async function classifySymptom(
  conversation: ConversationMessage[],
  summary: Record<string, unknown>,
): Promise<string | null> {
  const transcript = conversationText(conversation);
  const summaryJson = JSON.stringify(summary, null, 2);

  const system = `You are a maritime medical triage classifier. Given a conversation transcript and an extracted report summary, identify the single best-matching primary symptom from EXACTLY this list (use the exact spelling — no variations):
${SYMPTOM_LIST.join(', ')}

If the case does not clearly match any item on the list, return null.

Output only a single JSON object: {"symptom": "<exact list value>" | null}`;

  const user = `EXTRACTED REPORT SUMMARY:
${summaryJson}

CONVERSATION TRANSCRIPT:
${transcript || '(transcript is empty)'}`;

  try {
    const completion = await nebius.chat.completions.create({
      model: config.nebius.model,
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    let raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
    raw = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(raw) as { symptom?: string | null };
    const picked = parsed.symptom;
    if (typeof picked === 'string' && symptomGuidelines[picked]) return picked;
    return null;
  } catch (err) {
    console.error('[examFollowups] symptom classification failed:', (err as Error).message);
    return null;
  }
}

function buildRankerSystemPrompt(officerLang: string, patientLang: string, baseline: boolean): string {
  const intro = baseline
    ? `You are an experienced maritime medical reviewer. A non-medical officer aboard a vessel is opening a brand-new medical report — no chief complaint has been identified yet. You need to suggest the three most universally useful baseline physical-examination questions so the officer can start gathering objective data right away.

You will receive:
- The conversation transcript (likely empty or very brief) and the extracted report summary (likely empty).
- A CANDIDATE POOL of baseline physical-examination questions (vital signs, general appearance) that have NOT yet been asked. These come from a fixed maritime medical protocol (SYBRA).

YOUR TASK:
Select the THREE candidates that are most universally useful for any maritime intake — prioritise items that detect acute deterioration (vital signs) and give the officer a quick clinical impression (general appearance). If fewer than three candidates are provided, return all of them.`
    : `You are an experienced maritime medical reviewer. A non-medical officer aboard a vessel is drafting a medical report and needs to know which physical-examination questions would most improve the report.

You will receive:
- The chief complaint.
- The conversation transcript between Marina, the patient, and the officer.
- The extracted report summary.
- A CANDIDATE POOL of physical-examination questions for this chief complaint that have NOT yet been asked. These come from a fixed maritime medical protocol (SYBRA).

YOUR TASK:
Select the THREE candidates that would most meaningfully improve the report given what is already known. If fewer than three candidates are provided, return all of them.`;
  return `${intro}

LANGUAGES FOR THIS RESPONSE — REMEMBER EXACTLY:
- OFFICER LANGUAGE: ${officerLang}. The fields "question" and "examNameOfficer" MUST be written in ${officerLang}.
- PATIENT LANGUAGE: ${patientLang}. The fields "questionPatient" and "examNamePatient" MUST be written in ${patientLang}.
Never default to English unless ${officerLang} or ${patientLang} is English.

STRICT RULES:
- You MUST pick items from the CANDIDATE POOL only. Do NOT invent questions, do NOT modify the examName or questionNumber, do NOT merge candidates.
- Return each pick by its exact examName (unchanged English) and questionNumber from the pool.
- "question": translate the candidate's "text" into ${officerLang} as a clear OFFICER-facing instruction. Preserve the clinical intent — the officer needs to know what to do and what to look for. A natural rendering, not literal word-for-word.
- "questionPatient": render in ${patientLang} as the part the officer would say aloud to the patient. For "Ask the patient to smile" use "Please smile" (in ${patientLang}). For pure observation steps with no spoken patient interaction, use the full instruction translated for the patient's benefit.
- "examNameOfficer": the canonical exam name from the pool, translated into ${officerLang} for display.
- "examNamePatient": the same exam name, translated into ${patientLang}.
- "questionOriginal": the candidate's English text, exactly as supplied — unchanged.
- Bracketed clinical notes in the original (e.g. "[Facial asymmetry]", "[only perform if…]") are guidance for the officer — preserve their intent in the officer-facing field but you may omit the brackets if they read awkwardly. Do NOT include those notes in the patient-facing field.
- Output ONLY a single JSON object, no markdown, no commentary:

{
  "picks": [
    {
      "examName": "<exact English name from pool>",
      "questionNumber": <int>,
      "question": "<officer-facing instruction in ${officerLang}>",
      "questionPatient": "<patient-facing wording in ${patientLang}>",
      "examNameOfficer": "<exam name in ${officerLang}>",
      "examNamePatient": "<exam name in ${patientLang}>",
      "questionOriginal": "<exact English text from pool>"
    }
  ]
}`;
}

function buildRankerUserPrompt(
  symptom: string | null,
  conversation: ConversationMessage[],
  summary: Record<string, unknown>,
  pool: ParsedExamQuestion[],
): string {
  const summaryJson = JSON.stringify(summary, null, 2);
  const transcript = conversationText(conversation);
  const poolText = pool
    .map(q => `- examName: "${q.examName}", questionNumber: ${q.questionNumber}, totalQuestions: ${q.totalQuestions}\n  text: "${q.text.replace(/\n/g, ' ')}"`)
    .join('\n');
  const complaintLine = symptom
    ? `CHIEF COMPLAINT: ${symptom}`
    : `CHIEF COMPLAINT: (none yet — fresh intake, treat as baseline assessment)`;
  return `${complaintLine}

EXTRACTED REPORT SUMMARY:
${summaryJson}

CONVERSATION TRANSCRIPT:
${transcript || '(transcript is empty)'}

CANDIDATE POOL (only pick from these):
${poolText}`;
}

interface RankerPick {
  examName: string;
  questionNumber: number;
  question: string;
  questionPatient: string;
  examNameOfficer: string;
  examNamePatient: string;
  questionOriginal: string;
}

export async function generateExamFollowups(input: ExamFollowupsInput): Promise<ExamFollowupsResult> {
  // 1. Resolve chief complaint
  let symptom: string | null = null;
  if (input.mode === 'marina' && input.symptom && symptomGuidelines[input.symptom]) {
    symptom = input.symptom;
  } else if (input.symptom && symptomGuidelines[input.symptom]) {
    symptom = input.symptom;
  } else {
    symptom = await classifySymptom(input.conversation, input.summary);
  }

  // 2. Build candidate pool, minus already-asked. When no chief complaint has
  //    been identified yet (fresh intake), fall back to a universally useful
  //    baseline pool (general appearance + vital signs) so the Exam tab is
  //    never empty on first open.
  const baseline = symptom === null;
  const fullPool = symptom ? buildPoolForSymptom(symptom) : buildBaselinePool();
  const asked = new Set(
    (input.askedExamQuestions ?? []).map(a => `${a.examName}::${a.questionNumber}`),
  );
  const candidates = fullPool.filter(q => !asked.has(`${q.examName}::${q.questionNumber}`));

  if (candidates.length === 0) {
    return { symptom, examFollowUps: [] };
  }

  // 3. LLM ranking pass — translates and picks the top 3
  const officerLang = resolveLanguageName(input.medicalOfficerLanguage);
  const patientLang = resolveLanguageName(input.patientLanguage);
  const start = Date.now();

  let picks: RankerPick[] = [];
  try {
    const completion = await nebius.chat.completions.create({
      model: config.nebius.model,
      temperature: 0.3,
      max_tokens: 2400,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildRankerSystemPrompt(officerLang, patientLang, baseline) },
        { role: 'user', content: buildRankerUserPrompt(symptom, input.conversation, input.summary, candidates) },
      ],
    });
    let raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
    raw = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();
    const parsed = JSON.parse(raw) as { picks?: RankerPick[] };
    picks = Array.isArray(parsed.picks) ? parsed.picks : [];
  } catch (err) {
    console.error('[examFollowups] ranker failed:', (err as Error).message);
    throw err;
  }

  // 4. Resolve picks against the candidate pool — drop any the LLM invented,
  //    and reattach canonical totalQuestions + examMarker from the pool.
  const candidateIndex = new Map<string, ParsedExamQuestion>();
  for (const c of candidates) {
    candidateIndex.set(`${c.examName}::${c.questionNumber}`, c);
  }

  const examFollowUps: ExamFollowupQuestion[] = [];
  for (const p of picks) {
    if (typeof p?.examName !== 'string' || typeof p?.questionNumber !== 'number') continue;
    const key = `${p.examName}::${p.questionNumber}`;
    const source = candidateIndex.get(key);
    if (!source) continue;
    const officerQ = typeof p.question === 'string' && p.question.trim().length > 0
      ? p.question.trim()
      : source.text;
    const patientQ = typeof p.questionPatient === 'string' && p.questionPatient.trim().length > 0
      ? p.questionPatient.trim()
      : officerQ;
    const examOfficer = typeof p.examNameOfficer === 'string' && p.examNameOfficer.trim().length > 0
      ? p.examNameOfficer.trim()
      : source.examName;
    const examPatient = typeof p.examNamePatient === 'string' && p.examNamePatient.trim().length > 0
      ? p.examNamePatient.trim()
      : examOfficer;
    examFollowUps.push({
      examName: source.examName,
      examNameOfficer: examOfficer,
      examNamePatient: examPatient,
      examMarker: getPhysicalExaminationMarker(source.examId),
      questionNumber: source.questionNumber,
      totalQuestions: source.totalQuestions,
      question: officerQ,
      questionPatient: patientQ,
      questionOriginal: source.text,
    });
    if (examFollowUps.length >= 3) break;
  }

  console.log(
    `[ai/report/exam-followups] duration=${Date.now() - start}ms mode=${input.mode} symptom="${symptom ?? '(baseline)'}" pool=${candidates.length} picks=${examFollowUps.length}`,
  );

  return { symptom, examFollowUps };
}
