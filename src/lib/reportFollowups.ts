import { nebius } from './nebius.js';
import { config } from '../config.js';

export type ConversationMessage = { role: string; content: unknown };

export interface FollowupProtocol {
  historyTaking?: string;
  investigations?: string;
  examinationInstructions?: string;
}

export type PatientFollowupSection =
  | 'history_taking'
  | 'associated_symptoms'
  | 'past_medical_history'
  | 'medications'
  | 'allergies';

export const PATIENT_FOLLOWUP_SECTIONS: readonly PatientFollowupSection[] = [
  'history_taking',
  'associated_symptoms',
  'past_medical_history',
  'medications',
  'allergies',
] as const;

const SECTION_DESCRIPTIONS: Record<PatientFollowupSection, string> = {
  history_taking:
    'history of the primary complaint — onset, duration, location, character, severity, timing, triggers and relievers, recent travel or exposures, recent meals or activities.',
  associated_symptoms:
    'other symptoms the patient is experiencing alongside the chief complaint (e.g. fever with abdominal pain, nausea with headache).',
  past_medical_history:
    'prior medical conditions, prior surgeries, prior hospitalizations, pregnancy status — anything from the patient\'s past that is relevant to this case.',
  medications:
    'current medications the patient is taking (name, dose, frequency) including over-the-counter drugs.',
  allergies:
    'known allergies (medications, foods, environmental substances) and the type of reaction.',
};

export interface FollowupsInput {
  conversation: ConversationMessage[];
  summary: Record<string, unknown>;
  medicalOfficerLanguage: string;
  patientLanguage: string;
  symptom?: string;
  protocol?: FollowupProtocol;
  mode: 'marina' | 'note_taker' | 'translator';
  closedQuestions?: string[];
  /** When provided and non-empty, restrict suggestions to ONLY these sections. */
  sections?: PatientFollowupSection[];
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

  const sections = Array.from(new Set(input.sections ?? [])).filter(
    (s): s is PatientFollowupSection => (PATIENT_FOLLOWUP_SECTIONS as readonly string[]).includes(s),
  );
  const hasSectionFilter = sections.length > 0;
  const sectionsBlock = hasSectionFilter
    ? `🔒 SECTION FILTER — ABSOLUTE OVERRIDE 🔒

This filter takes PRECEDENCE over every other guidance in this prompt. You MAY suggest questions ONLY from the sections listed below. You MUST NOT suggest from any other section — even if the protocol coverage, the closed-topics block, or your own clinical judgement points to gaps elsewhere. Questions outside the allowed sections will be discarded by the system.

ALLOWED SECTIONS — pick only from these:
${sections.map(s => `- ${s}: ${SECTION_DESCRIPTIONS[s]}`).join('\n')}

Every suggestion MUST include a machine-readable "section" field whose value is the EXACT identifier from the list above (one of: ${sections.map(s => `"${s}"`).join(', ')}). The "sectionLabel" and "sectionLabelPatient" are human-readable labels in the respective languages — translate them naturally.

If you cannot find three meaningful patient-facing questions within the allowed sections, return fewer than three. NEVER propose a question outside the allowed sections to pad the response.`
    : '';

  const closedQuestions = Array.from(new Set(input.closedQuestions ?? []));
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

${hasSectionFilter
  ? 'If closed topics cover the obvious gaps WITHIN the allowed sections, still propose questions on the most clinically valuable UNASKED topics within those sections. NEVER step outside the allowed sections — that constraint overrides everything in this block.'
  : 'If closed topics cover the obvious gaps, pivot to questions about OTHER aspects of the patient\'s care that have NOT yet been asked: e.g. red-flag symptoms in unrelated body systems, allergies, current medications, recent travel or exposures, occupational history, mental-health context, social context, family history, recent injuries, recent infections, vaccination status, alcohol or drug use. Pick three DIFFERENT topics, not three angles on the same closed topic.\n\nIf the patient has declined virtually every meaningful patient-facing question, still propose three questions on the most clinically valuable UNASKED topics — but acknowledge in your sectionLabel that they cover a new area, not the closed ones.'}`
    : '';

  const sectionField = hasSectionFilter
    ? `, "section": "<one of: ${sections.join(', ')}>"`
    : '';

  return `You are an experienced maritime medical reviewer. A non-medical officer aboard a vessel has just drafted a medical report on a sick crew member and is about to send it to a shore-based doctor. Your job is to read the draft and suggest three patient-facing follow-up questions that would meaningfully improve the report before it is sent.

${sectionsBlock}

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

1. Suggest ${hasSectionFilter ? 'UP TO three' : 'EXACTLY three'} follow-up questions. Each question MUST:
   - Be answerable by the PATIENT (history, symptoms, allergies, current medications, past medical history, character/onset/duration of the complaint, etc.).
   - NOT ask the officer to take a measurement, perform an examination, or run an investigation — those are officer actions, not patient questions. Do not ask about vital signs, physical findings, or test results.
   - Target a specific gap visible in the summary or transcript that is NOT a closed topic (see above).
   - NEVER repeat or paraphrase a closed topic. If you find yourself drafting a question that touches a closed topic, discard it and choose a different topic.
   ${hasSectionFilter ? '- ABSOLUTELY belong to one of the ALLOWED SECTIONS above. The system will discard any question whose "section" field is not in that list.' : ''}
   - Be phrased naturally, conversationally, and medically appropriately.
   - Be provided in BOTH ${officerLang} (field "question", for the officer) AND ${patientLang} (field "questionPatient", for the patient — natural, conversational, faithful translation, not a literal word-for-word rendering).
   - Carry a short sectionLabel (1-3 words) naming the part of the report it would improve (e.g. allergies, current medications, past medical history, history of presenting complaint, associated symptoms, problem description), provided in BOTH ${officerLang} (field "sectionLabel") AND ${patientLang} (field "sectionLabelPatient").

2. Output ONLY a single JSON object with this exact shape, no markdown, no commentary:

{
  "followUps": [
    { "question": "<question in ${officerLang}>", "questionPatient": "<same question in ${patientLang}>", "sectionLabel": "<short tag in ${officerLang}>", "sectionLabelPatient": "<same short tag in ${patientLang}>"${sectionField} },
    { "question": "...", "questionPatient": "...", "sectionLabel": "...", "sectionLabelPatient": "..."${sectionField} },
    { "question": "...", "questionPatient": "...", "sectionLabel": "...", "sectionLabelPatient": "..."${sectionField} }
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
  const activeSections = new Set(
    Array.from(new Set(input.sections ?? [])).filter(
      (s): s is PatientFollowupSection => (PATIENT_FOLLOWUP_SECTIONS as readonly string[]).includes(s),
    ),
  );
  const hasSectionFilter = activeSections.size > 0;

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

  type LooseFollowup = FollowupQuestion & { section?: unknown };
  const parsed = JSON.parse(raw) as { followUps?: LooseFollowup[] };
  let followUps: FollowupQuestion[] = Array.isArray(parsed.followUps)
    ? parsed.followUps
        .filter(
          (q): q is LooseFollowup =>
            !!q &&
            typeof (q as FollowupQuestion).question === 'string' &&
            typeof (q as FollowupQuestion).questionPatient === 'string' &&
            typeof (q as FollowupQuestion).sectionLabel === 'string' &&
            typeof (q as FollowupQuestion).sectionLabelPatient === 'string',
        )
        .map(q => ({
          question: q.question,
          questionPatient: q.questionPatient,
          sectionLabel: q.sectionLabel,
          sectionLabelPatient: q.sectionLabelPatient,
          _section: typeof (q as { section?: unknown }).section === 'string' ? (q as { section: string }).section : undefined,
        }))
        // Hard guard: when the officer narrowed the filter, drop anything
        // the LLM emitted outside the allowed sections. The "section" field
        // is required by the prompt; if missing, the question is dropped.
        .filter((q) => {
          if (!hasSectionFilter) return true;
          const sec = (q as unknown as { _section?: string })._section;
          return !!sec && activeSections.has(sec as PatientFollowupSection);
        })
        .map(({ _section, ...rest }) => {
          void _section;
          return rest as FollowupQuestion;
        })
        .slice(0, 3)
    : [];

  const minRequired = hasSectionFilter ? 1 : 3;
  if (followUps.length < minRequired) {
    throw new Error(`Followups response malformed: followUps=${followUps.length} (hasFilter=${hasSectionFilter})`);
  }

  console.log(
    `[ai/report/followups] duration=${Date.now() - start}ms mode=${input.mode} hasFilter=${hasSectionFilter} kept=${followUps.length}`,
  );
  return { followUps };
}
