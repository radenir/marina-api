import { nebius } from './nebius.js';
import { config } from '../config.js';
import {
  examinationDisplayNames,
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
  examName: string;
  examMarker: string;
  questionNumber: number;
  totalQuestions: number;
  /** Question text translated into the medical officer's language. */
  question: string;
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
  const ids = guideline.Examinations ?? [];
  const pool: ParsedExamQuestion[] = [];
  for (const id of ids) {
    const script = examinationInstructions[id];
    if (!script) continue;
    const parsed = parseExamScript(id, script);
    // Override examName with the canonical display name to guarantee the
    // (examName, questionNumber) key matches what the frontend expects.
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

function buildRankerSystemPrompt(officerLang: string): string {
  return `You are an experienced maritime medical reviewer. A non-medical officer aboard a vessel is drafting a medical report and needs to know which physical-examination questions would most improve the report.

You will receive:
- The chief complaint.
- The conversation transcript between Marina, the patient, and the officer.
- The extracted report summary.
- A CANDIDATE POOL of physical-examination questions for this chief complaint that have NOT yet been asked. These come from a fixed maritime medical protocol (SYBRA).

YOUR TASK:
Select the THREE candidates that would most meaningfully improve the report given what is already known. If fewer than three candidates are provided, return all of them.

STRICT RULES:
- You MUST pick items from the CANDIDATE POOL only. Do NOT invent questions, do NOT modify the examName or questionNumber, do NOT merge candidates.
- Return each pick by its exact examName and questionNumber from the pool.
- Translate the candidate's "text" into ${officerLang} as the "question" field — a natural, faithful rendering, not literal word-for-word. The "questionOriginal" field is the candidate's English text, unchanged.
- The "question" must be written for the OFFICER (who performs the examination). Never address the patient.
- Bracketed clinical notes in the original (e.g. "[Facial asymmetry]", "[only perform if…]") are guidance for the officer — preserve their intent in the translation but you may omit the brackets if they read awkwardly.
- Output ONLY a single JSON object, no markdown, no commentary:

{
  "picks": [
    { "examName": "<exact name from pool>", "questionNumber": <int>, "question": "<translated to ${officerLang}>", "questionOriginal": "<exact English text from pool>" }
  ]
}`;
}

function buildRankerUserPrompt(
  symptom: string,
  conversation: ConversationMessage[],
  summary: Record<string, unknown>,
  pool: ParsedExamQuestion[],
): string {
  const summaryJson = JSON.stringify(summary, null, 2);
  const transcript = conversationText(conversation);
  const poolText = pool
    .map(q => `- examName: "${q.examName}", questionNumber: ${q.questionNumber}, totalQuestions: ${q.totalQuestions}\n  text: "${q.text.replace(/\n/g, ' ')}"`)
    .join('\n');
  return `CHIEF COMPLAINT: ${symptom}

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

  if (!symptom) {
    return { symptom: null, examFollowUps: [] };
  }

  // 2. Build candidate pool, minus already-asked
  const fullPool = buildPoolForSymptom(symptom);
  const asked = new Set(
    (input.askedExamQuestions ?? []).map(a => `${a.examName}::${a.questionNumber}`),
  );
  const candidates = fullPool.filter(q => !asked.has(`${q.examName}::${q.questionNumber}`));

  if (candidates.length === 0) {
    return { symptom, examFollowUps: [] };
  }

  // 3. LLM ranking pass — translates and picks the top 3
  const officerLang = resolveLanguageName(input.medicalOfficerLanguage);
  const start = Date.now();

  let picks: RankerPick[] = [];
  try {
    const completion = await nebius.chat.completions.create({
      model: config.nebius.model,
      temperature: 0.3,
      max_tokens: 1800,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildRankerSystemPrompt(officerLang) },
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
    examFollowUps.push({
      examName: source.examName,
      examMarker: getPhysicalExaminationMarker(source.examId),
      questionNumber: source.questionNumber,
      totalQuestions: source.totalQuestions,
      question: typeof p.question === 'string' && p.question.trim().length > 0
        ? p.question.trim()
        : source.text,
      questionOriginal: source.text,
    });
    if (examFollowUps.length >= 3) break;
  }

  console.log(
    `[ai/report/exam-followups] duration=${Date.now() - start}ms mode=${input.mode} symptom="${symptom}" pool=${candidates.length} picks=${examFollowUps.length}`,
  );

  return { symptom, examFollowUps };
}
