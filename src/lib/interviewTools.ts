import type { InterviewState } from './interviewTypes.js';
import { generateReport } from './interviewReport.js';
import { STAGES } from './interviewWorkflow.js';
import { getPhysicalExaminationMarker } from './symptomGuidelines.js';
import { getMultipleExaminationInstructions } from './examinationInstructions.js';

// Typed access to symptomGuidelines data
type SymptomGuideline = {
  'History Taking': string[];
  'Associated Symptoms': string[];
  'Focused Past Medical History': string[];
  'Clinical Examination': string[];
  'Investigations': string[];
  'Examinations': number[];
};

// Import symptomGuidelines with a cast for string-keyed access
import { symptomGuidelines as _symptomGuidelines } from './symptomGuidelines.js';
const symptomGuidelines = _symptomGuidelines as unknown as Record<string, SymptomGuideline>;

// ─── Tool definitions (OpenAI function-calling format) ────────────────────────

const SYMPTOM_LIST = [
  'Abdominal Pain', 'Fever', 'Chest pain', 'Headache', 'Nausea and Vomiting',
  'Back Pain', 'Cough/Respiratory Symptoms', 'Dizziness/Vertigo',
  'Skin Infections/Rash', 'Dental Pain', 'Laceration or Open Wounds',
  'Burns and Chemical Injuries', 'Eye Pain', 'Ear Pain or Hearing Problems',
  'Urinary Symptoms', 'Shortness of Breath', 'Joint Pain or Swelling',
  'Fatigue or Exhaustion', 'Diarrhea', 'Psychological Stress or Anxiety',
  'Unspecific Symptoms', 'Anaphylaxis and Allergic Reactions',
  'Palpitations or Irregular Heartbeat', 'Altered Consciousness or Confusion',
  'Mental Health Crisis', 'Syncope or Presyncope', 'Trauma',
  'Cold Exposure/Hypothermia', 'Heat Stroke/Heat Exhaustion', 'Tropical Disease',
  'Poisoning/Overdose', 'Musculoskeletal injuries', 'Eye Foreign Body',
  'Nosebleed', 'Sexually Transmitted Diseases', 'Female Health',
  'Diabetic complications', 'Drowning or Near Drowning',
  'Throat Pain and Sore Throat', 'Red Eye and Discharge',
  'Neurological symptoms', 'Obstipation',
].join(', ');

const ALL_TOOL_DEFS: Record<string, object> = {
  logPrimarySymptom: {
    type: 'function',
    function: {
      name: 'logPrimarySymptom',
      description: `Pick ONE symptom from EXACTLY this list, using EXACTLY these terms and spellings with no variation:\n ${SYMPTOM_LIST}\n\nCall this tool as soon as you have identified the primary symptom and the patient has confirmed it.`,
      parameters: {
        type: 'object',
        required: ['primarySymptomAI', 'interviewStage'],
        properties: {
          primarySymptomAI: {
            type: 'string',
            description: 'The primary symptom selected from the exact list above.',
          },
          interviewStage: {
            type: 'string',
            description: 'The interview stage that is about to begin.',
            enum: [
              'pathway', 'historyTaking', 'associatedSymptoms',
              'pastMedicalHistory', 'medications', 'allergies',
              'vitalSigns', 'investigations', 'physicalExam',
            ],
          },
        },
      },
    },
  },

  completeStage: {
    type: 'function',
    function: {
      name: 'completeStage',
      description: 'Call this tool IMMEDIATELY when the user confirms they have nothing to add to your summary. Do not ask the same question again. Do not ask about topics from the next stage. Just call this tool — it advances the interview automatically.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },

  logVitalSign: {
    type: 'function',
    function: {
      name: 'logVitalSign',
      description: 'Record a vital sign measurement provided by the medical officer. Call this after each vital sign value is given. Pick vitalType from: Oxygen, Temperature, Pressure, Respiration, Pulse, AVPU.',
      parameters: {
        type: 'object',
        required: ['vitalType', 'value', 'unit'],
        properties: {
          vitalType: {
            type: 'string',
            description: 'The type of vital sign. Must be one of: Oxygen, Temperature, Pressure, Respiration, Pulse, AVPU.',
          },
          value: {
            type: 'string',
            description: 'The measured value as reported by the medical officer.',
          },
          unit: {
            type: 'string',
            description: 'The unit of measurement (e.g. %, bpm, mmHg, °C, breaths/min, or AVPU level).',
          },
        },
      },
    },
  },

  logInvestigation: {
    type: 'function',
    function: {
      name: 'logInvestigation',
      description: 'Record an investigation result. Call this after each investigation question is answered. Use the exact investigation marker from the available investigations for this case.',
      parameters: {
        type: 'object',
        required: ['investigationMarker', 'investigationQuestion'],
        properties: {
          investigationMarker: {
            type: 'string',
            description: 'The exact investigation name (e.g. "CRP test", "ECG test", "Malaria test", "Blood sugar", "Pregnancy test", "Urine analysis", "COVID test", "Fluorescein coloring").',
          },
          investigationQuestion: {
            type: 'string',
            description: 'The exact question that was asked to the medical officer.',
          },
        },
      },
    },
  },

  logExaminationFinding: {
    type: 'function',
    function: {
      name: 'logExaminationFinding',
      description: 'Record a physical examination finding. Call this after each examination question is answered. Use the PHYSICAL_EXAMINATION:xxx marker format.',
      parameters: {
        type: 'object',
        required: ['examinationMarker', 'finding', 'questionNumber', 'totalQuestions'],
        properties: {
          examinationMarker: {
            type: 'string',
            description: 'The examination marker in PHYSICAL_EXAMINATION:ExamName format.',
          },
          finding: {
            type: 'string',
            description: 'The finding or answer provided by the medical officer.',
          },
          questionNumber: {
            type: 'number',
            description: 'The question number within this examination (starting from 1).',
          },
          totalQuestions: {
            type: 'number',
            description: 'The total number of questions in this examination.',
          },
        },
      },
    },
  },
};

/**
 * Return OpenAI-format tool definitions for the given tool names.
 */
export function getToolDefs(toolNames: string[]): object[] {
  return toolNames.map((name) => ALL_TOOL_DEFS[name]).filter(Boolean);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatList(arr: string[] | undefined): string {
  if (!Array.isArray(arr) || arr.length === 0) return 'None';
  return arr.map((item) => `- ${item}`).join('\n');
}

// ─── Pure tool executor ───────────────────────────────────────────────────────

/**
 * Execute a tool and return both the result and the updated state.
 * This is a pure function — the input state is never mutated.
 */
export function executeTool(
  name: string,
  input: Record<string, unknown>,
  state: InterviewState,
): { result: Record<string, unknown>; newState: InterviewState } {
  switch (name) {
    case 'logPrimarySymptom': {
      const primarySymptomAI = input.primarySymptomAI as string;
      const guideline = symptomGuidelines[primarySymptomAI];

      if (!guideline) {
        return {
          result: { success: false, error: `Unknown symptom: "${primarySymptomAI}". Must use exact name from the list.` },
          newState: state,
        };
      }

      const examIds: number[] = guideline['Examinations'] || [];
      const examinationInstructions = getMultipleExaminationInstructions(examIds);
      const examinationMarkers = examIds
        .map((id) => getPhysicalExaminationMarker(id))
        .join(', ');

      const newState: InterviewState = {
        ...state,
        stage: 1,
        variables: {
          ...state.variables,
          symptom: primarySymptomAI,
          historyTaking: formatList(guideline['History Taking']),
          associatedSymtpoms: formatList(guideline['Associated Symptoms']),
          focusedPastMedicalHistory: formatList(guideline['Focused Past Medical History']),
          clinicalExamination: formatList(guideline['Clinical Examination']),
          investigations: formatList(guideline['Investigations']),
          examinationInstructions,
          examinationMarkers,
        },
      };

      return {
        result: {
          success: true,
          symptom: primarySymptomAI,
          message: `Primary symptom logged as "${primarySymptomAI}". Medical protocol loaded. Stage advanced to History Taking AI.`,
          nextStage: 1,
          nextStageLabel: STAGES[1]?.label || 'History Taking AI',
        },
        newState,
      };
    }

    case 'completeStage': {
      const prevStage = state.stage;
      const nextStage = state.stage + 1;

      if (nextStage > 8) {
        const stateWithAdvancedStage: InterviewState = { ...state, stage: nextStage };
        const report = generateReport(stateWithAdvancedStage);
        const newState: InterviewState = {
          ...stateWithAdvancedStage,
          done: true,
          report,
        };
        return {
          result: {
            success: true,
            message: 'Interview complete. Report has been generated. Inform the medical officer that the interview is finished.',
          },
          newState,
        };
      }

      const nextLabel = STAGES[nextStage]?.label || 'Next Stage';
      return {
        result: {
          success: true,
          previousStage: prevStage,
          nextStage,
          nextStageLabel: nextLabel,
          message: `Stage advanced. Now beginning: ${nextLabel}.`,
        },
        newState: { ...state, stage: nextStage },
      };
    }

    case 'logVitalSign': {
      const newState: InterviewState = {
        ...state,
        data: {
          ...state.data,
          vitals: [
            ...state.data.vitals,
            {
              type: input.vitalType as string,
              value: input.value as string,
              unit: input.unit as string,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      };
      return {
        result: { success: true, message: `Vital sign recorded: ${input.vitalType} = ${input.value} ${input.unit}` },
        newState,
      };
    }

    case 'logInvestigation': {
      const newState: InterviewState = {
        ...state,
        data: {
          ...state.data,
          investigations: [
            ...state.data.investigations,
            {
              marker: input.investigationMarker as string,
              question: input.investigationQuestion as string,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      };
      return {
        result: { success: true, message: `Investigation recorded: ${input.investigationMarker}` },
        newState,
      };
    }

    case 'logExaminationFinding': {
      const newState: InterviewState = {
        ...state,
        data: {
          ...state.data,
          examFindings: [
            ...state.data.examFindings,
            {
              marker: input.examinationMarker as string,
              finding: input.finding as string,
              questionNumber: input.questionNumber as number,
              totalQuestions: input.totalQuestions as number,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      };
      return {
        result: { success: true, message: `Examination finding recorded: ${input.examinationMarker} Q${input.questionNumber}/${input.totalQuestions}` },
        newState,
      };
    }

    default:
      return {
        result: { success: false, error: `Unknown tool: ${name}` },
        newState: state,
      };
  }
}
