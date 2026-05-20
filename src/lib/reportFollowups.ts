import { nebius } from './nebius.js';
import { config } from '../config.js';

export type ConversationMessage = { role: string; content: unknown };

export interface FollowupProtocol {
  historyTaking?: string;
  investigations?: string;
  examinationInstructions?: string;
}

export interface FollowupsInput {
  conversation: ConversationMessage[];
  summary: Record<string, unknown>;
  medicalOfficerLanguage: string;
  patientLanguage: string;
  symptom?: string;
  protocol?: FollowupProtocol;
  mode: 'marina' | 'note_taker';
}

export interface FollowupQuestion {
  question: string;
  questionPatient: string;
  sectionLabel: string;
  sectionLabelPatient: string;
}

export interface FollowupsResult {
  followUps: FollowupQuestion[];
}

const DECLINED_PREFIX = '[Officer note] Patient declined to answer: ';
const UNAVAILABLE_PREFIX = '[Officer note] Patient unavailable for question: ';

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

// Pull every question the officer has already shown to the patient and marked declined
// or unavailable. These are CLOSED topics: the model must not re-ask them, even rephrased.
function extractClosedQuestions(history: ConversationMessage[]): string[] {
  const closed: string[] = [];
  for (const m of history) {
    if (typeof m.content !== 'string') continue;
    const text = (m.content as string).trim();
    if (text.startsWith(DECLINED_PREFIX)) {
      closed.push(text.slice(DECLINED_PREFIX.length).trim());
    } else if (text.startsWith(UNAVAILABLE_PREFIX)) {
      closed.push(text.slice(UNAVAILABLE_PREFIX.length).trim());
    }
  }
  // De-duplicate while preserving order so the prompt is shorter and clearer.
  return Array.from(new Set(closed));
}

// Resolve a BCP-47 language code (e.g. "tl", "my") to its English name
// ("Filipino", "Burmese"). The followups prompt previously interpolated raw
// codes; bare "my" was misread by the model as the English possessive
// pronoun, scrambling the dual-language output slots.
function resolveLanguageName(input: string): string {
  try {
    const name = new Intl.DisplayNames(['en'], { type: 'language' }).of(input);
    if (name && name.toLowerCase() !== input.toLowerCase()) return name;
  } catch {
    // ignore — fall through to passthrough
  }
  return input;
}

function buildSystemPrompt(input: FollowupsInput): string {
  const officerLang = resolveLanguageName(input.medicalOfficerLanguage);
  const patientLang = resolveLanguageName(input.patientLanguage);

  const protocolBlock = input.protocol
    ? [
        input.protocol.historyTaking
          ? `Expected history-taking coverage for this symptom:\n${input.protocol.historyTaking}`
          : '',
        input.protocol.investigations
          ? `Expected investigations for this symptom:\n${input.protocol.investigations}`
          : '',
        input.protocol.examinationInstructions
          ? `Expected examination coverage for this symptom:\n${input.protocol.examinationInstructions}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    : '';

  const symptomLine = input.symptom ? `Primary symptom: ${input.symptom}` : '';

  const modeNote =
    input.mode === 'marina'
      ? 'This report was produced by a structured Marina interview. Use the protocol coverage below to judge which patient-facing topics were skipped or under-explored.'
      : 'This report was produced from a free-form note-taker transcript. Reason against general clinical completeness for the chief complaint inferred from the summary.';

  const closedQuestions = extractClosedQuestions(input.conversation);
  const closedBlock = closedQuestions.length
    ? `🚫 CLOSED TOPICS — DO NOT ASK ABOUT THESE, EVEN PARAPHRASED 🚫

The officer has already attempted to ask the patient the following questions. The patient declined or was unavailable. These topics are PERMANENTLY CLOSED for this report.

ABSOLUTE RULES for closed topics:
- DO NOT repeat any of these questions verbatim.
- DO NOT rephrase, paraphrase, or split them into sub-questions.
- DO NOT ask about the same underlying topic from a different angle. Example: if "Can you describe the headache?" is closed, then "Where exactly is the pain?", "How severe is the headache?", "Is the pain constant or coming and going?" are ALL closed (same topic = headache character / location / onset).
- DO NOT treat the resulting gap in the summary as something to fill. Accept that the gap exists and move on.

Already-declined questions (each one closes its entire topic):
${closedQuestions.map(q => `- "${q}"`).join('\n')}

If closed topics cover the obvious gaps, pivot to questions about OTHER aspects of the patient's care that have NOT yet been asked: e.g. red-flag symptoms in unrelated body systems, allergies, current medications, recent travel or exposures, occupational history, mental-health context, social context, family history, recent injuries, recent infections, vaccination status, alcohol or drug use. Pick three DIFFERENT topics, not three angles on the same closed topic.

If the patient has declined virtually every meaningful patient-facing question, still propose three questions on the most clinically valuable UNASKED topics — but acknowledge in your sectionLabel that they cover a new area, not the closed ones.`
    : '';

  return `You are an experienced maritime medical reviewer. A non-medical officer aboard a vessel has just drafted a medical report on a sick crew member and is about to send it to a shore-based doctor. Your job is to read the draft and suggest three patient-facing follow-up questions that would meaningfully improve the report before it is sent.

LANGUAGES FOR THIS RESPONSE — REMEMBER THESE EXACTLY:
- OFFICER LANGUAGE: ${officerLang}. Fields "question" and "sectionLabel" MUST be written in ${officerLang}.
- PATIENT LANGUAGE: ${patientLang}. Fields "questionPatient" and "sectionLabelPatient" MUST be written in ${patientLang}.
Never default to English unless ${officerLang} or ${patientLang} is English.

${modeNote}

INPUTS YOU WILL RECEIVE:
- The already-extracted report summary (structured JSON).
- The full conversation transcript between Marina, the patient, and the officer. The transcript tells you WHY a summary field may be empty — the patient declined, the topic was never asked, or there was a language barrier.

${symptomLine}

${protocolBlock}

${closedBlock}

YOUR OUTPUT — STRICT REQUIREMENTS:

1. Suggest EXACTLY three follow-up questions. Each question MUST:
   - Be answerable by the PATIENT (history, symptoms, allergies, current medications, past medical history, character/onset/duration of the complaint, etc.).
   - NOT ask the officer to take a measurement, perform an examination, or run an investigation — those are officer actions, not patient questions. Do not ask about vital signs, physical findings, or test results.
   - Target a specific gap visible in the summary or transcript that is NOT a closed topic (see above).
   - NEVER repeat or paraphrase a closed topic. If you find yourself drafting a question that touches a closed topic, discard it and choose a different topic.
   - Be phrased naturally, conversationally, and medically appropriately.
   - Be provided in BOTH ${officerLang} (field "question", for the officer) AND ${patientLang} (field "questionPatient", for the patient — natural, conversational, faithful translation, not a literal word-for-word rendering).
   - Carry a short sectionLabel (1-3 words) naming the part of the report it would improve (e.g. allergies, current medications, past medical history, history of presenting complaint, associated symptoms, problem description), provided in BOTH ${officerLang} (field "sectionLabel") AND ${patientLang} (field "sectionLabelPatient").

2. Output ONLY a single JSON object with this exact shape, no markdown, no commentary:

{
  "followUps": [
    { "question": "<question in ${officerLang}>", "questionPatient": "<same question in ${patientLang}>", "sectionLabel": "<short tag in ${officerLang}>", "sectionLabelPatient": "<same short tag in ${patientLang}>" },
    { "question": "...", "questionPatient": "...", "sectionLabel": "...", "sectionLabelPatient": "..." },
    { "question": "...", "questionPatient": "...", "sectionLabel": "...", "sectionLabelPatient": "..." }
  ]
}`;
}

function buildUserPrompt(input: FollowupsInput): string {
  const summaryJson = JSON.stringify(input.summary, null, 2);
  const transcript = conversationText(input.conversation);
  return `EXTRACTED REPORT SUMMARY:
${summaryJson}

CONVERSATION TRANSCRIPT:
${transcript || '(transcript is empty)'}`;
}

export async function generateFollowups(input: FollowupsInput): Promise<FollowupsResult> {
  const systemPrompt = buildSystemPrompt(input);
  const userPrompt = buildUserPrompt(input);

  const start = Date.now();
  const completion = await nebius.chat.completions.create({
    model: config.nebius.model,
    temperature: 0.3,
    max_tokens: 1500,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  let raw = completion.choices[0]?.message?.content?.trim() ?? '{}';
  raw = raw.replace(/^```json/i, '').replace(/^```/i, '').replace(/```$/i, '').trim();

  const parsed = JSON.parse(raw) as Partial<FollowupsResult>;
  const followUps = Array.isArray(parsed.followUps)
    ? parsed.followUps
        .filter(
          (q): q is FollowupQuestion =>
            !!q &&
            typeof (q as FollowupQuestion).question === 'string' &&
            typeof (q as FollowupQuestion).questionPatient === 'string' &&
            typeof (q as FollowupQuestion).sectionLabel === 'string' &&
            typeof (q as FollowupQuestion).sectionLabelPatient === 'string',
        )
        .slice(0, 3)
    : [];

  if (followUps.length !== 3) {
    throw new Error(`Followups response malformed: followUps=${followUps.length}`);
  }

  console.log(`[ai/report/followups] duration=${Date.now() - start}ms mode=${input.mode}`);
  return { followUps };
}
