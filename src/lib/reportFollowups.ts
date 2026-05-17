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
}

export interface FollowupsResult {
  followUps: FollowupQuestion[];
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

function buildSystemPrompt(input: FollowupsInput): string {
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

  return `You are an experienced maritime medical reviewer. A non-medical officer aboard a vessel has just drafted a medical report on a sick crew member and is about to send it to a shore-based doctor. Your job is to read the draft and suggest three patient-facing follow-up questions that would meaningfully improve the report before it is sent.

${modeNote}

INPUTS YOU WILL RECEIVE:
- The already-extracted report summary (structured JSON).
- The full conversation transcript between Marina, the patient, and the officer. The transcript tells you WHY a summary field may be empty — the patient declined, the topic was never asked, or there was a language barrier.

${symptomLine}

${protocolBlock}

YOUR OUTPUT — STRICT REQUIREMENTS:

1. Suggest EXACTLY three follow-up questions. Each question MUST:
   - Be answerable by the PATIENT (history, symptoms, allergies, current medications, past medical history, character/onset/duration of the complaint, etc.).
   - NOT ask the officer to take a measurement, perform an examination, or run an investigation — those are officer actions, not patient questions. Do not ask about vital signs, physical findings, or test results.
   - Target a specific gap visible in the summary or transcript.
   - Be phrased naturally, conversationally, and medically appropriately.
   - Be provided in BOTH ${input.medicalOfficerLanguage} (field "question", for the officer) AND ${input.patientLanguage} (field "questionPatient", for the patient — natural, conversational, faithful translation, not a literal word-for-word rendering).
   - Carry a short ${input.medicalOfficerLanguage} sectionLabel (1-3 words) naming the part of the report it would improve (e.g. allergies, current medications, past medical history, history of presenting complaint, associated symptoms, problem description).

2. Output ONLY a single JSON object with this exact shape, no markdown, no commentary:

{
  "followUps": [
    { "question": "<question in ${input.medicalOfficerLanguage}>", "questionPatient": "<same question in ${input.patientLanguage}>", "sectionLabel": "<short tag in ${input.medicalOfficerLanguage}>" },
    { "question": "...", "questionPatient": "...", "sectionLabel": "..." },
    { "question": "...", "questionPatient": "...", "sectionLabel": "..." }
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
            typeof (q as FollowupQuestion).sectionLabel === 'string',
        )
        .slice(0, 3)
    : [];

  if (followUps.length !== 3) {
    throw new Error(`Followups response malformed: followUps=${followUps.length}`);
  }

  console.log(`[ai/report/followups] duration=${Date.now() - start}ms mode=${input.mode}`);
  return { followUps };
}
