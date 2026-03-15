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
}

export function createFreshState(
  patientLanguage = 'English',
  medicalOfficerLanguage = 'English',
): InterviewState {
  return {
    stage: 0,
    done: false,
    report: null,
    conversationHistory: [],
    variables: {
      patientLanguage,
      medicalOfficerLanguage,
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
