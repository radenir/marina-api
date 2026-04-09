export interface VitalSign {
  type: string;
  value: string;
  unit: string;
  timestamp: string;
}

export interface Investigation {
  marker: string;
  question: string;
  timestamp: string;
}

export interface ExaminationFinding {
  marker: string;
  finding: string;
  questionNumber: number;
  totalQuestions: number;
  timestamp: string;
}

export interface InterviewData {
  vitals: VitalSign[];
  investigations: Investigation[];
  examFindings: ExaminationFinding[];
}

export interface InterviewVariables {
  patientLanguage: string;
  medicalOfficerLanguage: string;
  symptom: string;
  historyTaking: string;
  associatedSymtpoms: string; // preserve original typo — matches {{associatedSymtpoms}} in prompts
  focusedPastMedicalHistory: string;
  clinicalExamination: string;
  investigations: string;
  examinationInstructions: string;
  examinationMarkers: string;
  [key: string]: string;
}

export interface InterviewState {
  stage: number;
  done: boolean;
  report: string | null;
  conversationHistory: Record<string, unknown>[];
  variables: InterviewVariables;
  data: InterviewData;
  turnsInStage: number;
}

// Native-script hints for languages that LLMs commonly confuse with a neighbour.
// Using the native name alongside the English label makes the target script unambiguous.
const LANGUAGE_HINTS: Record<string, string> = {
  Khmer:      'Khmer (ភាសាខ្មែរ)',
  Burmese:    'Burmese (မြန်မာဘာသာ)',
  Georgian:   'Georgian (ქართული)',
  Bengali:    'Bengali (বাংলা)',
  Sinhalese:  'Sinhalese (සිංහල)',
  Amharic:    'Amharic (አማርኛ)',
  Igbo:       'Igbo (Asụsụ Igbo)',
  Tagalog:    'Tagalog (Filipino)',
  Armenian:   'Armenian (Հայերեն)',
};

function disambiguateLanguage(lang: string): string {
  return LANGUAGE_HINTS[lang] ?? lang;
}

export function createFreshState(
  patientLanguage = 'English',
  medicalOfficerLanguage = 'English',
): InterviewState {
  return {
    stage: 1,
    done: false,
    report: null,
    conversationHistory: [],
    turnsInStage: 0,
    variables: {
      patientLanguage: disambiguateLanguage(patientLanguage),
      medicalOfficerLanguage: disambiguateLanguage(medicalOfficerLanguage),
      symptom: '',
      historyTaking: '',
      associatedSymtpoms: '',
      focusedPastMedicalHistory: '',
      clinicalExamination: '',
      investigations: '',
      examinationInstructions: '',
      examinationMarkers: '',
    },
    data: {
      vitals: [],
      investigations: [],
      examFindings: [],
    },
  };
}
