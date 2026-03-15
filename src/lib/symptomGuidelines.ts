// @ts-nocheck
/**
 * Symptom Guidelines
 * Shared data structure for medical symptom guidelines used by multiple services
 * Based on SYBRA 1.02 (Symptom-based Remote Assessment Algorithm)
 */

// Define examination IDs from SYBRA 1.02
export const examinationIds = {
  CAPILLARY_REFILL: 1,      // Capillary Refill test
  EYE_EXAM: 2,              // Eye examination
  NOSE_CHECK: 3,            // Nose check
  EARS_CHECK: 4,            // Ears check
  THROAT_CHECK: 5,          // Throat check
  SIMPLE_NEURO: 6,          // Simple neurologic check
  ADVANCED_NEURO: 7,        // Advanced neurologic check
  ABDOMEN_EXAM: 8,          // Abdomen examination
  BACK_PAIN: 9,             // Back pain assessment
  DEHYDRATION: 10,          // Dehydration check
  LIMB_CIRCULATION: 11,     // Limb circulation check
  TESTICULAR: 12,           // Testicular examination
  PAIN_ASSESSMENT: 13,      // Basic pain assessment
  GENERAL_APPEARANCE: 14,   // General appearance
  INFECTION_FOCUS: 15,      // Infection focus check
  CABCDE: 16,               // C-ABCDE assessment
  THROMBOSIS_EDEMA: 17,     // Thrombosis and edema check
  BREATHING_CHECK: 18,      // Breathing check
  SKIN_ASSESSMENT: 19,      // Skin assessment
  DENTAL_EXAM: 20,          // Dental examination
  WOUND_EXAM: 21,           // Wound examination
  ABDOMINAL_PAIN: 22,       // Abdominal pain exam
  JOINT_EXAM: 23,           // Joint examination
  MENTAL_EVAL: 24,          // Mental health check
  PULSE_CHECK: 25,          // Pulse check
  VIOLENCE_CHECK: 26,       // Violence checklist
  INJURY_ASSESSMENT: 27,    // Local injury assessment
  MALE_GENITAL: 28,         // Male Genital inspection
  MALARIA_RISK: 29,         // Malaria risk
  VITAL_SIGNS: 30           // Vital signs assessment
};

// Examination display names for the UI - using EXACT names from the list of examinations
export const examinationDisplayNames = {
  [examinationIds.CAPILLARY_REFILL]: "Capillary Refill test",
  [examinationIds.EYE_EXAM]: "Eye examination",
  [examinationIds.NOSE_CHECK]: "Nose check",
  [examinationIds.EARS_CHECK]: "Ears check",
  [examinationIds.THROAT_CHECK]: "Throat check",
  [examinationIds.SIMPLE_NEURO]: "Simple neurologic check",
  [examinationIds.ADVANCED_NEURO]: "Advanced neurologic check",
  [examinationIds.ABDOMEN_EXAM]: "Abdomen examination",
  [examinationIds.BACK_PAIN]: "Back pain assessment",
  [examinationIds.DEHYDRATION]: "Dehydration check",
  [examinationIds.LIMB_CIRCULATION]: "Limb circulation check",
  [examinationIds.TESTICULAR]: "Testicular examination",
  [examinationIds.PAIN_ASSESSMENT]: "Basic pain assessment",
  [examinationIds.GENERAL_APPEARANCE]: "General appearance",
  [examinationIds.INFECTION_FOCUS]: "Infection focus check",
  [examinationIds.CABCDE]: "C-ABCDE assessment",
  [examinationIds.THROMBOSIS_EDEMA]: "Thrombosis and edema check",
  [examinationIds.BREATHING_CHECK]: "Breathing check",
  [examinationIds.SKIN_ASSESSMENT]: "Skin assessment",
  [examinationIds.DENTAL_EXAM]: "Dental examination",
  [examinationIds.WOUND_EXAM]: "Wound examination",
  [examinationIds.ABDOMINAL_PAIN]: "Abdominal pain exam",
  [examinationIds.JOINT_EXAM]: "Joint examination",
  [examinationIds.MENTAL_EVAL]: "Mental health check",
  [examinationIds.PULSE_CHECK]: "Pulse check",
  [examinationIds.VIOLENCE_CHECK]: "Violence checklist",
  [examinationIds.INJURY_ASSESSMENT]: "Local injury assessment",
  [examinationIds.MALE_GENITAL]: "Male Genital inspection",
  [examinationIds.MALARIA_RISK]: "Malaria risk",
  [examinationIds.VITAL_SIGNS]: "Vital signs"
};

// Map examination IDs to frontend display formats
export const examinationFrontendMapping = {
  [examinationIds.CAPILLARY_REFILL]: "Special tests",
  [examinationIds.EYE_EXAM]: "Ophthalmoscopy",
  [examinationIds.NOSE_CHECK]: "Inspection",
  [examinationIds.EARS_CHECK]: "Otoscopy",
  [examinationIds.THROAT_CHECK]: "Inspection",
  [examinationIds.SIMPLE_NEURO]: "Neurological",
  [examinationIds.ADVANCED_NEURO]: "Neurological",
  [examinationIds.ABDOMEN_EXAM]: "Palpation",
  [examinationIds.BACK_PAIN]: "Palpation",
  [examinationIds.DEHYDRATION]: "Inspection",
  [examinationIds.LIMB_CIRCULATION]: "Special tests",
  [examinationIds.TESTICULAR]: "Palpation",
  [examinationIds.PAIN_ASSESSMENT]: "Special tests",
  [examinationIds.GENERAL_APPEARANCE]: "Inspection",
  [examinationIds.INFECTION_FOCUS]: "Inspection",
  [examinationIds.CABCDE]: "Special tests",
  [examinationIds.THROMBOSIS_EDEMA]: "Inspection",
  [examinationIds.BREATHING_CHECK]: "Auscultation",
  [examinationIds.SKIN_ASSESSMENT]: "Inspection",
  [examinationIds.DENTAL_EXAM]: "Inspection",
  [examinationIds.WOUND_EXAM]: "Inspection",
  [examinationIds.ABDOMINAL_PAIN]: "Palpation",
  [examinationIds.JOINT_EXAM]: "Range of motion",
  [examinationIds.MENTAL_EVAL]: "Neurological",
  [examinationIds.PULSE_CHECK]: "Vital signs",
  [examinationIds.VIOLENCE_CHECK]: "Special tests",
  [examinationIds.INJURY_ASSESSMENT]: "Palpation",
  [examinationIds.MALE_GENITAL]: "Inspection",
  [examinationIds.MALARIA_RISK]: "Special tests",
  [examinationIds.VITAL_SIGNS]: "Vital signs"
};

// Define symptom guidelines object for prompt creation and red flag analysis
export const symptomGuidelines = {
  "Abdominal Pain": {
    "History Taking": [
      "Previous history of similar pain?",
      "Onset: sudden vs gradual",
      "Location: exact site, radiation, change of location over time",
      "Quality: crampy, sharp, burning, colicky",
      "Severity on a scale of 1 to 10 [Numeric pain rating scale]",
      "Timing: constant vs intermittent, duration",
      "Aggravating/Relieving: movement, meals, position",
      "Travel history last 3 months [which countries]",
      "Food exposure"
    ],
    "Associated Symptoms": [
      "Nausea, vomiting",
      "Diarrhea or constipation",
      "Fever or chills",
      "Hematemesis/melena/hematochezia",
      "Dysuria or urinary symptoms",
      "Vaginal bleeding or discharge [only if female patient]"
    ],
    "Focused Past Medical History": [
      "Prior abdominal surgeries",
      "Known conditions, with focus on gastrointestinal, renal, gynecological, urological or vascular conditions",
      "Pregnancy status in women (previous pregnancies, current birth control)"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Abdomen examination",
      "Abdominal pain",
      "Capillary refill test"
    ],
    "Investigations": [
      "CRP if temperature is ≥38 degree Celsius",
      "Urine analysis if pain in kidney area or history of kidney stone",
      "Pregnancy test if female and between 12 and 55 years of age",
      "Malaria test if Temperature ≥38°C or suspicion of fever within the last 48 hours and travel or stay within the last 3 months in a malaria area",
      "Blood sugar if known diabetic"
    ],
    "Red Flags": [
      "Hematemesis and/or melena",
      "Guarding and/or peritonitis",
      "Rebound tenderness",
      "Positive pregnancy test"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.ABDOMEN_EXAM,
      examinationIds.ABDOMINAL_PAIN,
      examinationIds.CAPILLARY_REFILL
    ]
  },
  "Fever": {
    "History Taking": [
      "Onset: Sudden vs gradual",
      "Duration: How many days",
      "Pattern: Intermittent, continuous",
      "Associated chills or rigors",
      "Recent infections or contact with sick individuals",
      "Travel history last 3 months"
    ],
    "Associated Symptoms": [
      "Rash",
      "Cough, sore throat",
      "Abdominal pain, vomiting, diarrhea",
      "Dysuria, more frequent urination",
      "Joint pain",
      "Headache, photophobia",
      "Night sweats"
    ],
    "Focused Past Medical History": [
      "Immunocompromised conditions",
      "Chronic illnesses",
      "Recent antibiotics"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Capillary refill test",
      "Dehydration check",
      "Infection focus check"
    ],
    "Investigations": [
      "CRP-test always",
      "Urine analysis in case of dysuria or frequent urination",
      "Malaria test if Temperature ≥38°C or suspicion of fever within the last 48 hours and travel or stay within the last 3 months in a malaria area",
      "COVID test if one of the following symptoms (fever, cough, sore throat, fatigue)",
      "Blood sugar if known diabetic"
    ],
    "Red Flags": [
      "Positive malaria test",
      "Suspicion of sepsis",
      "Shivering or cold chills"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.CAPILLARY_REFILL,
      examinationIds.DEHYDRATION,
      examinationIds.INFECTION_FOCUS
    ]
  },
  "Chest pain": {
    "History Taking": [
      "Onset: sudden vs gradual",
      "Location: exact site and radiation",
      "Quality: pressure, stabbing, burning",
      "Severity: pain scale NRS",
      "Timing: constant vs intermittent, duration",
      "Aggravating: breathing, exertion, movement",
      "Relieving factors: rest, position, medications",
      "Recently immobilized (e.g. travel or similar)",
      "Any trauma to the chest or back recently"
    ],
    "Associated Symptoms": [
      "Dyspnea",
      "Diaphoresis",
      "Cough – if yes, productive cough and/or hemoptysis",
      "Nausea",
      "Palpitations",
      "Syncope"
    ],
    "Focused Past Medical History": [
      "Hypertension, heart disease, cardiovascular disease, deep vein thrombosis or pulmonary embolism",
      "Smoking history"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Capillary refill test",
      "Thrombosis and edema check",
      "Breathing check",
      "Pulse check"
    ],
    "Investigations": [
      "CRP test if cough and/or temperature of ≥38 degree Celsius",
      "ECG test if available unless chest pain after recent trauma"
    ],
    "Red Flags": [
      "Chest pain after trauma to the chest",
      "Cardiac chest pain, described as pressure or tightness in the chest, pain radiating into left arm or both arms or jaw or neck or back, increases with physical activity and improves with rest",
      "Hemoptysis",
      "Suspicion of shock"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.CAPILLARY_REFILL,
      examinationIds.THROMBOSIS_EDEMA,
      examinationIds.BREATHING_CHECK,
      examinationIds.PULSE_CHECK
    ]
  },
  "Headache": {
    "History Taking": [
      "Onset: sudden (thunderclap) or gradual",
      "Location: unilateral, bilateral",
      "Quality: throbbing, pressure, stabbing",
      "Severity: pain scale NRS",
      "Timing: continuous vs episodic",
      "Triggers: light, noise, activity",
      "Any recent head trauma?"
    ],
    "Associated Symptoms": [
      "Fever",
      "Nausea/vomiting",
      "Visual disturbances",
      "Neck stiffness",
      "Confusion",
      "Weakness"
    ],
    "Focused Past Medical History": [
      "Migraine",
      "Hypertension",
      "Stroke or brain bleeds"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Simple neurologic check only, unless conditions for advanced neurologic check are fulfilled",
      "Advanced neurologic check instead if at least one of the following is present: Focal neurologic symptom, Acute headache (reaches maximum intensity within 5 minutes), Severe headache (Numeric pain rating scale ≥7), Altered mental state or confusion"
    ],
    "Investigations": [
      "CRP test if temperature ≥38 degree Celsius",
      "Blood sugar if known diabetic"
    ],
    "Red Flags": [
      "Acute headache (reaches maximum intensity within 5 minutes)",
      "Severe headache (Numeric pain rating scale ≥7)",
      "Neck stiffness and fever",
      "Focal neurological symptom"
    ],
    "Examinations": [
      examinationIds.SIMPLE_NEURO,
      examinationIds.ADVANCED_NEURO
    ]
  },
  "Nausea and Vomiting": {
    "History Taking": [
      "Onset: sudden vs gradual",
      "Duration: How long",
      "Frequency and amount",
      "Presence of blood",
      "Can patient drink fluids despite nausea and vomiting",
      "Associated symptoms: abdominal pain, fever",
      "Recent meals, food hygiene",
      "Seasickness"
    ],
    "Associated Symptoms": [
      "Abdominal pain",
      "Fever",
      "Diarrhea",
      "Headache",
      "Dizziness"
    ],
    "Focused Past Medical History": [
      "Gastrointestinal disorders",
      "Medication side effects",
      "Pregnancy status in women"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Abdomen examination",
      "Capillary refill test",
      "Dehydration check"
    ],
    "Investigations": [
      "CRP if temperature ≥38 degree Celsius",
      "Blood sugar if known diabetic",
      "Pregnancy test if female and between 12 and 55 years of age"
    ],
    "Red Flags": [
      "Hematemesis",
      "Cannot intake fluids orally",
      "Positive pregnancy test",
      "Focal neurological symptom"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.ABDOMEN_EXAM,
      examinationIds.CAPILLARY_REFILL,
      examinationIds.DEHYDRATION
    ]
  },
  "Back Pain": {
    "History Taking": [
      "Onset: sudden after lifting, or gradual",
      "Traumatic cause or not",
      "Location: lumbar, thoracic, radiating",
      "Quality: dull, sharp, shooting",
      "Severity: pain scale NRS",
      "Timing: constant vs intermittent",
      "Aggravating/Relieving factors: movement, position, rest"
    ],
    "Associated Symptoms": [
      "Limb weakness or numbness",
      "Urinary retention",
      "Bowel incontinence",
      "Fever",
      "Radiating pain to legs",
      "Saddle paresthesia"
    ],
    "Focused Past Medical History": [
      "Previous back issues",
      "Heavy lifting or trauma"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Back pain assessment"
    ],
    "Investigations": [
      "CRP if temperature ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Focal neurological symptom including saddle paresthesia",
      "Urinary retention and/or bowel incontinence",
      "CRP higher than 100 mg/L and back pain",
      "Fever and back pain"
    ],
    "Examinations": [
      examinationIds.BACK_PAIN
    ]
  },
  "Cough/Respiratory Symptoms": {
    "History Taking": [
      "Duration: acute vs chronic",
      "Type: dry vs productive",
      "Onset: sudden vs gradual",
      "Sputum color, blood",
      "Dyspnea",
      "Fever",
      "Triggers or exposures"
    ],
    "Associated Symptoms": [
      "Fever",
      "Chest pain",
      "Dyspnea",
      "Hemoptysis",
      "Weight loss",
      "Night sweats"
    ],
    "Focused Past Medical History": [
      "Asthma, COPD, smoking",
      "Tuberculosis exposure",
      "Travel history last 3 months"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Breathing check"
    ],
    "Investigations": [
      "CRP if temperature is ≥38 degree Celsius",
      "COVID test if dry cough and temperature ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Hemoptysis"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.BREATHING_CHECK
    ]
  },
  "Dizziness/Vertigo": {
    "History Taking": [
      "True vertigo?",
      "Onset: sudden vs gradual",
      "Duration: How long",
      "Timing: episodic vs continuous",
      "Triggering movements",
      "Severity: Impact on function"
    ],
    "Associated Symptoms": [
      "Nausea",
      "Tinnitus",
      "Hearing loss",
      "Weakness or imbalance",
      "Headache",
      "Visual disturbances"
    ],
    "Focused Past Medical History": [
      "Ear infections, stroke",
      "Hypertension"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Advanced neurologic check"
    ],
    "Investigations": [
      "CRP test if temperature is ≥38 degree Celsius",
      "Pregnancy test if female and between 12 and 55 years of age"
    ],
    "Red Flags": [
      "Focal neurologic symptoms",
      "Vertical nystagmus or nystagmus that does not stop when fixating",
      "Sudden onset vertigo (within ≤5 minutes)",
      "Hearing loss"
    ],
    "Examinations": [
      examinationIds.ADVANCED_NEURO
    ]
  },
  "Skin Infections/Rash": {
    "History Taking": [
      "Onset: sudden vs gradual",
      "Location: distribution pattern",
      "Progression and spread",
      "Itching, pain",
      "Exposure: chemicals, sea creatures, new medications",
      "Duration: How long"
    ],
    "Associated Symptoms": [
      "Fever",
      "Swelling, pus",
      "Systemic symptoms",
      "Lymph node enlargement",
      "Pruritus"
    ],
    "Focused Past Medical History": [
      "Diabetes",
      "Travel history last 3 months",
      "Immunocompromised conditions",
      "Travel, food exposure, and sexual history"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Skin assessment"
    ],
    "Investigations": [
      "CRP test if temperature ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Rapidly spreading (within <1 hour)",
      "Skin condition and fever"
    ],
    "Examinations": [
      examinationIds.SKIN_ASSESSMENT
    ]
  },
  "Dental Pain": {
    "History Taking": [
      "Onset: sudden vs gradual",
      "Duration: How long",
      "Quality: throbbing, sharp, constant",
      "Severity: pain scale NRS",
      "Progression",
      "Pain with hot/cold",
      "Swelling or discharge"
    ],
    "Associated Symptoms": [
      "Fever",
      "Facial swelling",
      "Difficulty swallowing",
      "Trismus",
      "Lymph node swelling"
    ],
    "Focused Past Medical History": [
      "Recent trauma",
      "Dental history"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Dental examination"
    ],
    "Investigations": [
      "CRP if temperature ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Trismus",
      "Cannot swallow",
      "Fever + facial swelling"
    ],
    "Examinations": [
      examinationIds.DENTAL_EXAM
    ]
  },
  "Laceration or Open Wounds": {
    "History Taking": [
      "Mechanism of injury",
      "Time since injury",
      "Location: exact site",
      "Contamination source",
      "Circumstances of injury",
      "First aid administered"
    ],
    "Associated Symptoms": [
      "Bleeding",
      "Loss of function",
      "Foreign body sensation",
      "Pain",
      "Numbness",
      "Signs of infection"
    ],
    "Focused Past Medical History": [
      "Tetanus vaccination status",
      "Bleeding disorders",
      "Medications (anticoagulants)",
      "Allergies",
      "Diabetes"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Wound examination",
      "Local injury assessment if there are injuries other than lacerations"
    ],
    "Investigations": [
      "CRP if temperature of ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Spurting blood (arterial bleed)",
      "Bleeding does not stop after 10 minutes of firm pressure",
      "Loss of distal pulse",
      "Wound deep enough to expose bone, tendon or muscle"
    ],
    "Examinations": [
      examinationIds.WOUND_EXAM,
      examinationIds.INJURY_ASSESSMENT
    ]
  },
  "Burns and Chemical Injuries": {
    "History Taking": [
      "Cause: thermal, chemical, electrical",
      "Time since incident",
      "Location: exact site and extent",
      "Circumstances of burn",
      "First aid administered",
      "Exposure duration"
    ],
    "Associated Symptoms": [
      "Pain",
      "Swelling",
      "Blistering",
      "Systemic symptoms",
      "Respiratory symptoms",
      "Eye irritation"
    ],
    "Focused Past Medical History": [
      "Previous burns"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Handling burns"
    ],
    "Investigations": [
      "None"
    ],
    "Red Flags": [
      "Burns to face, airway, genitals and/or hands",
      "Total body surface area affected >10%",
      "Circumferential limb burns",
      "Electrical burns",
      "Chemical burns",
      "All medium or severe burns",
      "All blistering burns"
    ],
    "Examinations": [
      // Removed BURNS examination as it's not in the new list
    ]
  },
  "Eye Pain": {
    "History Taking": [
      "Onset: sudden vs gradual",
      "Duration: How long",
      "Progression",
      "Trauma, welding flash, foreign body",
      "Quality: type of pain"
    ],
    "Associated Symptoms": [
      "Redness, discharge",
      "Visual loss extent",
      "Photophobia",
      "Headache",
      "Nausea",
      "Halos around lights",
      "Tearing"
    ],
    "Focused Past Medical History": [
      "Contact lens use",
      "Eye conditions",
      "Recent eye procedures"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Eye examination",
      "Eye foreign body if foreign body suspected or found during eye examination"
    ],
    "Investigations": [
      "Fluorescein coloring if no foreign body was found or removed, and if any of the following: Persistent eye pain after trauma, Suspected corneal abrasion (e.g. sand, metal dust, fingernail scratch), Chemical eye injury after initial irrigation, to check for damage, Foreign body sensation but no foreign body visible on eye examination"
    ],
    "Red Flags": [
      "Sudden vision loss",
      "Reduced visual acuity",
      "Chemical exposure to eyes",
      "Unequal pupils",
      "Bleeding from eye"
    ],
    "Examinations": [
      examinationIds.EYE_EXAM
    ]
  },
  "Ear Pain or Hearing Problems": {
    "History Taking": [
      "Onset: sudden vs gradual",
      "Quality: throbbing, sharp, pressure",
      "Duration: How long",
      "Severity: pain scale NRS",
      "Discharge characteristics",
      "Hearing loss"
    ],
    "Associated Symptoms": [
      "Fever",
      "Dizziness",
      "Tinnitus",
      "Facial weakness",
      "Headache",
      "Nausea"
    ],
    "Focused Past Medical History": [
      "Recent swimming",
      "Previous ear infections",
      "Recent trauma to head, neck or ear area"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Ears check"
    ],
    "Investigations": [
      "CRP test if temperature ≥38 degree Celsius and local sign of infection"
    ],
    "Red Flags": [
      "Fever and spreading redness and/or swelling in area of either ear, neck or head",
      "Vertigo and hearing loss",
      "Facial weakness"
    ],
    "Examinations": [
      examinationIds.EARS_CHECK
    ]
  },
  "Urinary Symptoms": {
    "History Taking": [
      "Onset: sudden vs gradual",
      "Duration: How long",
      "Dysuria, urgency, frequency",
      "Hematuria",
      "Fever or flank pain",
      "Urinary retention"
    ],
    "Associated Symptoms": [
      "Nausea/vomiting",
      "Abdominal pain",
      "Vaginal discharge (women)",
      "Suprapubic pain",
      "Testicular pain"
    ],
    "Focused Past Medical History": [
      "Kidney stones",
      "UTI history",
      "Sexual history",
      "Pregnancy status (women)"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Abdomen examination",
      "Abdominal pain exam only if the patient has abdominal pain"
    ],
    "Investigations": [
      "CRP test if temperature of ≥38 degree Celsius",
      "Urine analysis if symptoms of kidney stone",
      "Pregnancy test if female and between 12 and 55 years of age and abdominal or pelvic pain"
    ],
    "Red Flags": [
      "Hematuria",
      "Fever and pain in abdomen and/or flanks (pyelonephritis)",
      "Testicular pain without trauma (testicular torsion)"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.ABDOMEN_EXAM,
      examinationIds.ABDOMINAL_PAIN
    ]
  },
  "Shortness of Breath": {
    "History Taking": [
      "Onset: sudden vs gradual",
      "Duration: How long",
      "Severity: Impact on function",
      "Cough, chest pain, hemoptysis",
      "Orthopnea",
      "History of trauma",
      "Recent immobilization such as air travel (Pulmonary embolism risk)"
    ],
    "Associated Symptoms": [
      "Anxiety",
      "Chest pain",
      "Palpitations",
      "Fever",
      "Leg swelling"
    ],
    "Focused Past Medical History": [
      "Asthma, COPD, heart disease (ischemia, heart failure, surgery)",
      "Smoking history"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Breathing check",
      "Thrombosis and edema check",
      "General appearance",
      "Pulse check"
    ],
    "Investigations": [
      "CRP test if temperature ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Coughing blood (hemoptysis)",
      "Chest pain and dyspnea after trauma (pneumothorax)",
      "Shortness of breath while resting"
    ],
    "Examinations": [
      examinationIds.BREATHING_CHECK,
      examinationIds.THROMBOSIS_EDEMA,
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.PULSE_CHECK
    ]
  },
  "Joint Pain or Swelling": {
    "History Taking": [
      "Onset: traumatic vs atraumatic",
      "Location: which joints involved",
      "Quality: aching, sharp, throbbing",
      "Severity: pain scale NRS",
      "Timing: morning stiffness, constant vs intermittent",
      "Aggravating/Relieving: movement, rest, medications"
    ],
    "Associated Symptoms": [
      "Fever",
      "Redness, warmth",
      "Swelling",
      "Limited range of motion",
      "Systemic symptoms"
    ],
    "Focused Past Medical History": [
      "Gout, arthritis",
      "Recent trauma",
      "Family history of arthritis"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Joint examination"
    ],
    "Investigations": [
      "CRP test if temperature ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Temperature 38°C or higher and swollen and/or red joint (septic arthritis)",
      "Joint deformation",
      "Significant loss of function or reduced range of motion"
    ],
    "Examinations": [
      examinationIds.JOINT_EXAM
    ]
  },
  "Fatigue or Exhaustion": {
    "History Taking": [
      "Onset: sudden vs gradual",
      "Duration: How long",
      "Duration and pattern",
      "Sleep, work hours",
      "Diet and hydration",
      "Impact on daily activities"
    ],
    "Associated Symptoms": [
      "Weight loss",
      "Palpitations",
      "Mood symptoms",
      "Dyspnea",
      "Fever",
      "Night sweats"
    ],
    "Focused Past Medical History": [
      "Anemia",
      "Thyroid disease",
      "Mental health history",
      "Recent infections",
      "Travel"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Dehydration check"
    ],
    "Investigations": [
      "CRP if temperature is ≥38 degree Celsius"
    ],
    "Red Flags": [
      "None"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.DEHYDRATION
    ]
  },
  "Diarrhea": {
    "History Taking": [
      "Onset: sudden vs gradual",
      "Duration: How long",
      "Frequency and amount",
      "Stool characteristics (bloody, watery)",
      "Can patient drink fluids",
      "Food history",
      "Travel history"
    ],
    "Associated Symptoms": [
      "Fever",
      "Vomiting",
      "Dehydration",
      "Abdominal pain",
      "Cramping",
      "Weight loss"
    ],
    "Focused Past Medical History": [
      "Inflammatory bowel disease",
      "Recent antibiotics",
      "Recent hospitalization"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Abdomen examination",
      "Abdominal pain exam if there is pain in the abdomen",
      "General appearance"
    ],
    "Investigations": [
      "CRP test if temperature is ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Cannot drink fluids at all",
      "Fever",
      "Abdominal pain >5 NRS",
      "Blood in stool",
      "Diarrhea with >6 episodes in 24 hours"
    ],
    "Examinations": [
      examinationIds.ABDOMEN_EXAM,
      examinationIds.ABDOMINAL_PAIN,
      examinationIds.GENERAL_APPEARANCE
    ]
  },
  "Psychological Stress or Anxiety": {
    "History Taking": [
      "Onset: sudden vs gradual",
      "Duration: How long",
      "Severity: Impact on function",
      "Triggers (home, work, conflict)",
      "Sleep pattern",
      "Precipitating factors"
    ],
    "Associated Symptoms": [
      "Chest tightness",
      "Headache",
      "Fatigue",
      "Palpitations",
      "Shortness of breath",
      "Sweating"
    ],
    "Focused Past Medical History": [
      "Mental health diagnoses",
      "Substance use",
      "Recent stressors",
      "Family history of mental health"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Mental evaluation"
    ],
    "Investigations": [
      "None"
    ],
    "Red Flags": [
      "Any mention of suicidal ideation or ideas",
      "Signs of hallucinations or psychosis",
      "Panic attack unresponsive to verbal calming measures"
    ],
    "Examinations": [
      examinationIds.MENTAL_EVAL
    ]
  },
  "Unspecific Symptoms": {
    "History Taking": [
      "Main concern: \"What's the main problem today?\"",
      "Onset and course: \"When did it start? Is it getting better or worse?\"",
      "Pain assessment: location, character, radiation, severity, provoking/alleviating factors",
      "Fever/infection: any fevers, cough, diarrhea, skin lesions, recent contacts",
      "Neurologic symptoms: confusion, weakness, seizures, headache",
      "Cardiorespiratory: chest pain, breathlessness, palpitations",
      "Trauma history: recent injuries, protective gear use",
      "Medication: regular medications including over-the-counter",
      "Allergies",
      "Substance use: alcohol, drugs",
      "Previous similar episodes and treatment",
      "Impact on daily life: sleep, work, appetite",
      "Contagion risk: similar symptoms in others aboard?"
    ],
    "Associated Symptoms": [
      "As relevant from History of present illness"
    ],
    "Focused Past Medical History": [
      "General past medical history and in depending on current complaint"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Select examinations based on information gathered"
    ],
    "Investigations": [
      "As considered relevant based on existing information"
    ],
    "Red Flags": [
      "As per general Red Flags"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE
    ]
  },
  "Anaphylaxis and Allergic Reactions": {
    "History Taking": [
      "Symptom onset: minutes to hours",
      "Triggers: food, meds, insect sting, physical exertion",
      "Progression: sudden vs gradual, first-time or recurrent",
      "Organs affected: skin, respiratory, GI, cardiovascular, CNS",
      "EpiPen use?"
    ],
    "Associated Symptoms": [
      "Skin: urticaria, flushing, swelling",
      "Respiratory: wheezing, stridor, cough",
      "Cardio: dizziness, hypotension",
      "Gastrointestinal: vomiting, cramps",
      "Neurological: anxiety, LOC"
    ],
    "Focused Past Medical History": [
      "Past allergic reactions",
      "Beta-blocker or ACE-inhibitor use",
      "Known allergens",
      "Anaphylaxis history"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Breathing check",
      "Skin assessment if a rash is present"
    ],
    "Investigations": [
      "None"
    ],
    "Red Flags": [
      "Airway involvement (stridor, hoarseness, respiratory arrest)",
      "Swelling of the lips, tongue, face, or throat",
      "Difficulty swallowing",
      "Vomiting, abdominal cramps after known allergen exposure",
      "Rapid progression (onset within 1 hour of exposure to allergen)"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.BREATHING_CHECK,
      examinationIds.SKIN_ASSESSMENT
    ]
  },
  "Palpitations or Irregular Heartbeat": {
    "History Taking": [
      "Nature of sensation: racing, fluttering, pounding",
      "Onset and duration",
      "Associated: syncope, chest pain, dyspnea",
      "Triggers: fever, dehydration, emotional stress",
      "Previous episodes",
      "Drug/alcohol use"
    ],
    "Associated Symptoms": [
      "Syncope",
      "Dyspnea",
      "Chest pain",
      "Confusion"
    ],
    "Focused Past Medical History": [
      "Atrial fibrillation",
      "Anemia, thyroid disorders",
      "Cardiac condition",
      "Anticoagulation or antiarrhythmic therapy"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Pulse check",
      "Thrombosis and edema check",
      "General appearance"
    ],
    "Investigations": [
      "Blood sugar if diabetic",
      "CRP if temperature ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Any kind of syncope or presyncope",
      "Irregular pulse and systolic blood pressure <110 mmHg",
      "Chest pain",
      "Irregular pulse and pulse rate >110 per minute",
      "Signs of shock"
    ],
    "Examinations": [
      examinationIds.PULSE_CHECK,
      examinationIds.THROMBOSIS_EDEMA,
      examinationIds.GENERAL_APPEARANCE
    ]
  },
  "Altered Consciousness or Confusion": {
    "History Taking": [
      "Time course: sudden vs gradual",
      "Drug, alcohol, or toxin use",
      "Head trauma or seizures",
      "Fever, vomiting",
      "Known epilepsy, diabetes, liver/renal disease, psychiatric illness"
    ],
    "Associated Symptoms": [
      "Seizures",
      "Headache",
      "Neck stiffness",
      "Weakness"
    ],
    "Focused Past Medical History": [
      "Seizure disorder",
      "Diabetes",
      "Hypertension",
      "Mental illness",
      "Use of medication which affect consciousness (opioids, benzos, antidepressants, antipsychotics)"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Breathing check",
      "Capillary refill test",
      "Simple neurologic check if cause for altered consciousness is known and clear, otherwise advanced neurologic check"
    ],
    "Investigations": [
      "Blood glucose if available",
      "CRP if temperature ≥38 degree Celsius"
    ],
    "Red Flags": [
      "GCS <14",
      "Head trauma with loss of consciousness, seizures, repeated vomiting, or anticoagulation",
      "Unequal pupils or abnormal light reflex",
      "Neck stiffness",
      "Repeated vomiting",
      "Focal neurological symptom"
    ],
    "Examinations": [
      examinationIds.BREATHING_CHECK,
      examinationIds.CAPILLARY_REFILL,
      examinationIds.SIMPLE_NEURO,
      examinationIds.ADVANCED_NEURO
    ]
  },
  "Mental Health Crisis": {
    "History Taking": [
      "Immediate safety: suicidal ideation, violence risk, access to weapons",
      "Mood: depression, anxiety, agitation, paranoia",
      "Sleep, appetite, social functioning",
      "Hallucinations or delusions",
      "Substance use: recent alcohol, drugs",
      "Stressors or trauma"
    ],
    "Associated Symptoms": [
      "Anxiety",
      "Restlessness",
      "Sleep disturbance",
      "Withdrawal or aggressive behavior"
    ],
    "Focused Past Medical History": [
      "Psychiatric history",
      "Substance abuse",
      "Medications for psychiatric conditions",
      "Recent hospitalizations",
      "Previous suicide attempts"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Mental evaluation",
      "Violence checklist"
    ],
    "Investigations": [
      "CRP if temperature ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Suicidal thoughts or plans",
      "Violence checklist score of ≥2",
      "Signs of hallucination or psychosis",
      "Recent drug use"
    ],
    "Examinations": [
      examinationIds.MENTAL_EVAL,
      examinationIds.VIOLENCE_CHECK
    ]
  },
  "Syncope or Presyncope": {
    "History Taking": [
      "What was the patient doing before?",
      "Any warning signs: lightheadedness, nausea, palpitations?",
      "Duration of unconsciousness",
      "Recovery: immediate or delayed",
      "Previous episodes",
      "Associated trauma",
      "Witnessed seizure activity?",
      "Tongue bite, incontinence"
    ],
    "Associated Symptoms": [
      "Palpitations",
      "Headache",
      "Chest pain",
      "Dyspnea",
      "Fever",
      "Confusion"
    ],
    "Focused Past Medical History": [
      "Cardiac history",
      "Epilepsy",
      "Substance use"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Capillary refill test",
      "General appearance",
      "Pulse check",
      "Simple neurologic check",
      "Advanced neurologic check if simple neurologic check shows any signs of focal neurologic deficit"
    ],
    "Investigations": [
      "CRP if temperature ≥38 degree Celsius",
      "ECG if available",
      "Pregnancy test if female and between 12 and 55 years of age"
    ],
    "Red Flags": [
      "Any loss of consciousness",
      "Any head trauma",
      "Any seizure",
      "Recurrent presyncope"
    ],
    "Examinations": [
      examinationIds.CAPILLARY_REFILL,
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.PULSE_CHECK,
      examinationIds.SIMPLE_NEURO,
      examinationIds.ADVANCED_NEURO
    ]
  },
  "Trauma": {
    "History Taking": [
      "Mechanism: \"What happened?\" (fall, blow, crush, stab, etc.)",
      "Location and impact: \"What part of the body was affected?\"",
      "Time since injury",
      "Protective equipment used",
      "Loss of consciousness, seizure, amnesia?",
      "Pain: severity, radiation, worsening?",
      "Bleeding or visible deformity",
      "Previous injuries to the area"
    ],
    "Associated Symptoms": [
      "Headache, nausea, vomiting, vision change, dyspnea, limb weakness, urinary retention/incontinence"
    ],
    "Focused Past Medical History": [
      "Anticoagulation therapy",
      "Bleeding disorders",
      "Osteoporosis"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Local injury assessment",
      "Back pain assessment only if the patient have hit their back",
      "Simple neurologic check only if the patient is known to have hit their head and/or has wounds on the head suggesting head trauma",
      "Limb circulation check only if the patient has pain ≥7 in the extremity or there is suspicion of circulatory problems in the extremity"
    ],
    "Investigations": [
      "CRP if temperature ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Head trauma with loss of consciousness, vomiting, or GCS <14",
      "Head trauma in patients receiving any kind of blood thinners",
      "Open fractures",
      "Suspected spinal injury",
      "Absent distal pulses",
      "Penetrating chest and/or abdomen injury",
      "Signs of internal bleeding",
      "Chest pain and shortness of breath (pneumothorax)",
      "Hematuria (kidney bleeding)"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.INJURY_ASSESSMENT,
      examinationIds.BACK_PAIN,
      examinationIds.SIMPLE_NEURO,
      examinationIds.LIMB_CIRCULATION
    ]
  },
  "Cold Exposure/Hypothermia": {
    "History Taking": [
      "Duration and setting of exposure (sea, wind, wet clothes)",
      "Consciousness level",
      "Shivering?",
      "Pain, numbness, or loss of sensation?",
      "Wet or wind-exposed clothing?"
    ],
    "Associated Symptoms": [
      "Confusion",
      "Slurred speech",
      "Drowsiness",
      "Pale or waxy skin",
      "Limb stiffness"
    ],
    "Focused Past Medical History": [
      "Heart disease",
      "Diabetes"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Simple neurologic check",
      "General appearance",
      "Pulse check"
    ],
    "Investigations": [
      "Blood sugar if diabetic"
    ],
    "Red Flags": [
      "Temperature <35°C",
      "Altered mental state",
      "Severe frostbite (blisters, blackened skin)"
    ],
    "Examinations": [
      examinationIds.SIMPLE_NEURO,
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.PULSE_CHECK
    ]
  },
  "Heat Stroke/Heat Exhaustion": {
    "History Taking": [
      "Environment: working in hot, humid, enclosed space?",
      "Fluid intake",
      "Duration of heat exposure",
      "Preceding symptoms: dizziness, cramps, nausea, confusion?",
      "Medication or alcohol use?"
    ],
    "Associated Symptoms": [
      "Headache",
      "Nausea or vomiting",
      "Confusion",
      "Collapse",
      "Muscle cramps"
    ],
    "Focused Past Medical History": [
      "Cardiovascular disease",
      "Diuretics or beta blockers",
      "Previous heatstroke episodes"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Pulse check",
      "Dehydration check",
      "Simple neurologic check"
    ],
    "Investigations": [
      "CRP only if an underlying infection is suspected"
    ],
    "Red Flags": [
      "Temperature > 40°C",
      "Altered mental state",
      "No sweating and dry hot skin (Heat Stroke)"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.PULSE_CHECK,
      examinationIds.DEHYDRATION,
      examinationIds.SIMPLE_NEURO
    ]
  },
  "Tropical Disease": {
    "History Taking": [
      "Travel history the last 3 months",
      "Onset and pattern of fever",
      "Abdominal pain or diarrhea",
      "Insect bites, such as mosquito or ticks",
      "Any use of malaria prophylaxis"
    ],
    "Associated Symptoms": [
      "Myalgia, hematuria, bleeding tendencies",
      "Headache, rash, joint pain, nausea, jaundice"
    ],
    "Focused Past Medical History": [
      "Vaccinations for tropical disease within last months (tetanus, rabies, cholera, yellow fever, Japanese encephalitis, hepatitis, typhoid fever)",
      "Chronic liver/spleen disease",
      "HIV or immunocompromised status",
      "Previous infections with tropical disease"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Skin assessment",
      "Simple neurologic check"
    ],
    "Investigations": [
      "CRP test if temperature is 38°C or higher",
      "Malaria rapid test if temperature ≥38°C or suspicion of fever within the last 48 hours and/or travel or stay within the last 3 months in a malaria area"
    ],
    "Red Flags": [
      "Positive malaria test",
      "Hematoma of any kind",
      "Jaundice",
      "Shivering or cold chills",
      "Risk for Malaria, Dengue, Typhoid Fever, Leptospirosis, Cholera, Hepatitis A and E or Chikungunya/Zika based on travel and symptoms"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.SKIN_ASSESSMENT,
      examinationIds.SIMPLE_NEURO,
      examinationIds.MALARIA_RISK
    ]
  },
  "Poisoning/Overdose": {
    "History Taking": [
      "Substance ingested, route, amount, and time",
      "Intentional vs accidental",
      "Suicidal ideation?",
      "Alcohol, recreational drugs, medication errors",
      "Co-ingestions (e.g., alcohol + meds)",
      "Witnessed symptoms: seizures, vomiting, collapse?"
    ],
    "Associated Symptoms": [
      "Confusion",
      "Nausea/vomiting",
      "Abnormal pupils",
      "Sweating",
      "Seizures or twitching",
      "Respiratory depression"
    ],
    "Focused Past Medical History": [
      "Mental illness",
      "Substance use",
      "Liver/kidney disease",
      "Polypharmacy"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Simple neurologic check",
      "Breathing check",
      "Pulse check",
      "Capillary refill test"
    ],
    "Investigations": [
      "Blood sugar if available",
      "ECG if available"
    ],
    "Red Flags": [
      "Respiratory depression",
      "Unconsciousness",
      "Seizures",
      "Suicidal intent",
      "Bradycardia or hypotension",
      "Vomiting with blood or altered mental status"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.SIMPLE_NEURO,
      examinationIds.BREATHING_CHECK,
      examinationIds.PULSE_CHECK,
      examinationIds.CAPILLARY_REFILL
    ]
  },
  "Musculoskeletal injuries": {
    "History Taking": [
      "Mechanism of injury",
      "Pain location and onset",
      "Swelling or bruising",
      "Ability to bear weight or use limb",
      "History of similar injuries",
      "Repetitive strain (deck work, heavy lifting)"
    ],
    "Associated Symptoms": [
      "Joint stiffness",
      "Clicking or instability",
      "Numbness or tingling"
    ],
    "Focused Past Medical History": [
      "Previous joint or tendon injuries",
      "Chronic arthritis or gout",
      "Job role (repetitive motions?)"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Local injury assessment"
    ],
    "Investigations": [
      "CRP test if temperature is ≥38 degree Celsius and warm and/or swollen joint"
    ],
    "Red Flags": [
      "Suspected fracture",
      "Joint locked or unable to move",
      "Suspected compartment syndrome",
      "Hot, swollen joint with fever (septic arthritis)"
    ],
    "Examinations": [
      examinationIds.INJURY_ASSESSMENT,
      examinationIds.JOINT_EXAM
    ]
  },
  "Eye Foreign Body": {
    "History Taking": [
      "Onset: \"When did the discomfort start?\"",
      "Cause: metal grinding, wind, chemicals, sand, etc.",
      "Was eye protection worn?",
      "Sensation: \"Does it feel like something is stuck?\"",
      "Vision change?",
      "Pain, tearing, light sensitivity?"
    ],
    "Associated Symptoms": [
      "Redness",
      "Eye watering",
      "Blurred vision",
      "Photophobia",
      "Foreign body sensation"
    ],
    "Focused Past Medical History": [
      "Use of contact lenses",
      "Previous eye surgery or trauma"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Eye examination",
      "Eye foreign body if a foreign body has been found"
    ],
    "Investigations": [
      "Fluorescein coloring if no foreign body was found or removed, and if any of the following: Persistent eye pain after trauma, Suspected corneal abrasion (e.g. sand, metal dust, fingernail scratch), Chemical eye injury after initial irrigation, to check for damage, Foreign body sensation but no foreign body visible on eye examination"
    ],
    "Red Flags": [
      "Penetrating injury of the eye",
      "Visual acuity significantly reduced",
      "Intraocular foreign body suspected",
      "Chemical burn to eye",
      "Pupil abnormality"
    ],
    "Examinations": [
      examinationIds.EYE_EXAM
    ]
  },
  "Nosebleed": {
    "History Taking": [
      "Time and duration of bleeding",
      "One or both nostrils?",
      "Recent trauma or nose-picking",
      "Medications: blood thinners, aspirin, NSAIDs",
      "Hypertension or dry ship environment?",
      "Bleeding stopped and restarted?"
    ],
    "Associated Symptoms": [
      "Dizziness",
      "Fatigue",
      "Nausea if swallowing blood"
    ],
    "Focused Past Medical History": [
      "Anticoagulation use",
      "Bleeding disorders",
      "Frequent nosebleeds",
      "Nasal deformity"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Nose check"
    ],
    "Investigations": [
      "None"
    ],
    "Red Flags": [
      "Bleeding >20 minutes despite pressure and/or application of ice",
      "Posterior epistaxis (blood down throat)",
      "On anticoagulants",
      "Recurrent epistaxis + bruising elsewhere",
      "Signs of shock"
    ],
    "Examinations": [
      examinationIds.NOSE_CHECK
    ]
  },
  "Sexually Transmitted Diseases": {
    "History Taking": [
      "Symptoms: pain, discharge, rash, ulcers?",
      "Pain location (sexual organ, or testicle?)",
      "Onset and progression",
      "Dysuria, pelvic pain, fever?",
      "Unprotected sex, multiple partners, known exposure?",
      "Condom use?",
      "Male or female partner(s)?"
    ],
    "Associated Symptoms": [
      "Nausea and/or vomiting",
      "Genital itching",
      "Vaginal/urethral discharge",
      "Fever",
      "Enlarged lymph nodes",
      "Genital sores"
    ],
    "Focused Past Medical History": [
      "Previous STDs",
      "HIV or immunocompromised",
      "Recent new partners",
      "Contraceptive use"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Gynecological inspection if patient is female",
      "Male Genital inspection if patient is male"
    ],
    "Investigations": [
      "CRP test if temperature ≥38 degree Celsius",
      "Pregnancy test if female and between 12 and 55 years of age"
    ],
    "Red Flags": [
      "Pelvic inflammatory disease (fever, pain, cervical motion tenderness)",
      "Discharge and temperature 38°C or higher",
      "Testicular torsion suspicion if male (sudden and/or severe onset, no fever, no discharge, nausea)",
      "Genital ulcers"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.MALE_GENITAL,
      examinationIds.TESTICULAR
    ]
  },
  "Female Health": {
    "History Taking": [
      "Menstrual history: last period, flow, regularity",
      "Pain: type, onset, location",
      "Vaginal discharge, odor, itching?",
      "Bleeding outside menstruation?",
      "Sexual activity and contraception",
      "History of gynecological conditions?"
    ],
    "Associated Symptoms": [
      "Lower abdominal pain",
      "Back pain",
      "Urinary symptoms",
      "Fever",
      "Fatigue"
    ],
    "Focused Past Medical History": [
      "Endometriosis",
      "Polycystic ovary syndrome",
      "History of sexually transmitted disease",
      "Surgeries (C-section, laparoscopy)"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Abdomen examination",
      "Gynecological inspection"
    ],
    "Investigations": [
      "CRP if temperature ≥38 degree Celsius",
      "Pregnancy test if between 12 and 55 years of age"
    ],
    "Red Flags": [
      "Abdominal or pelvic pain with fever",
      "Intense vaginal bleeding (Soaking ≥1 pad/hour for ≥2 hours, Persistent bleeding >7 days)",
      "Positive pregnancy test",
      "Suspicion of sepsis",
      "Any vaginal bleed in patients known to be pregnant",
      "Pelvic pain >5 Numeric pain rating scale"
    ],
    "Examinations": [
      examinationIds.ABDOMEN_EXAM
    ]
  },
  "Diabetic complications": {
    "History Taking": [
      "Diagnosis: Type 1 or 2?",
      "Medications: insulin, oral agents",
      "Last food and insulin dose",
      "Symptoms: thirst, urination, blurred vision, fatigue?",
      "Confusion, tremors, sweating?",
      "Recent illness or skipped meals?"
    ],
    "Associated Symptoms": [
      "Nausea/vomiting",
      "Abdominal pain",
      "Confusion or altered mental state"
    ],
    "Focused Past Medical History": [
      "Diabetes",
      "Past episodes of diabetic complications (ketoacidosis, hyperglycemia or hypoglycemia)",
      "Renal disease"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Dehydration check",
      "Breathing check"
    ],
    "Investigations": [
      "Blood sugar",
      "CRP if temperature ≥38 degree Celsius",
      "Urine analysis"
    ],
    "Red Flags": [
      "Blood sugar <3 mmol/L or >20 mmol/L",
      "Altered consciousness",
      "Vomiting and/or abdominal pain with hyperglycemia >16 mmol/L",
      "Kussmaul breathing"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.DEHYDRATION,
      examinationIds.BREATHING_CHECK
    ]
  },
  "Drowning or Near Drowning": {
    "History Taking": [
      "Duration underwater",
      "Conscious at rescue?",
      "Salt vs freshwater?",
      "First aid given on scene?",
      "Coughing, vomiting after?",
      "Confusion or lethargy"
    ],
    "Associated Symptoms": [
      "Shortness of breath",
      "Chest pain",
      "Cyanosis",
      "Cold skin"
    ],
    "Focused Past Medical History": [
      "Seizures",
      "Heart disease",
      "Diabetes"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Simple neurologic check",
      "Breathing check"
    ],
    "Investigations": [
      "None"
    ],
    "Red Flags": [
      "Altered mental state or confusion",
      "Hypothermia <35°C temperature",
      "Sudden deterioration after apparent recovery (\"secondary drowning\")",
      "Respiratory distress and/or Sp02 <94%"
    ],
    "Examinations": [
      examinationIds.SIMPLE_NEURO,
      examinationIds.BREATHING_CHECK
    ]
  },
  "Throat Pain and Sore Throat": {
    "History Taking": [
      "Onset and duration of pain",
      "Severity (pain scale)",
      "Difficulty swallowing?",
      "Voice changes or hoarseness?",
      "Exposure to sick crewmates or passengers",
      "Was it sudden or gradual onset?"
    ],
    "Associated Symptoms": [
      "Fever",
      "Runny nose",
      "Cough",
      "Headache",
      "Swollen lymph nodes (Rapidly enlarging neck swelling ≤24 hours)",
      "Ear pain",
      "Rash (scarlet fever)",
      "Shortness of breath (if severe swelling)"
    ],
    "Focused Past Medical History": [
      "Recent upper respiratory infections",
      "Tonsillectomy or ENT surgery",
      "Recurrent tonsillitis",
      "Acid reflux"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Throat check",
      "Nose check if the patient reports symptoms from the nose",
      "Ears check if the patient reports symptoms from the ear"
    ],
    "Investigations": [
      "CRP test if temperature is ≥38 degree Celsius",
      "COVID test if flu-like symptoms (≥3 out of the following: cough, sore throat, shortness of breath, loss of smell or taste, muscle aches, headache, runny nose) and temperature is ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Difficulty breathing or stridor",
      "Difficulty to swallow or drink fluids",
      "Trismus (may indicate peritonsillar abscess)",
      "Rapidly enlarging neck swelling (Has increased visibly in size over ≤24 hours)"
    ],
    "Examinations": [
      examinationIds.THROAT_CHECK,
      examinationIds.NOSE_CHECK,
      examinationIds.EARS_CHECK
    ]
  },
  "Red Eye and Discharge": {
    "History Taking": [
      "Onset and duration",
      "Redness in one or both eyes",
      "Tearing, itchiness, or discharge"
    ],
    "Associated Symptoms": [
      "Discharge watery or purulent",
      "Grittiness or mild irritation",
      "Pain in the eye",
      "Vision loss"
    ],
    "Focused Past Medical History": [
      "Contact lens use",
      "Recent eye infections or known eye conditions"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Eye examination",
      "Eye foreign body if foreign body has been found"
    ],
    "Investigations": [
      "Fluorescein coloring if no foreign body was found or removed, and if any of the following: Persistent eye pain after trauma, Suspected corneal abrasion (e.g. sand, metal dust, fingernail scratch), Chemical eye injury after initial irrigation, to check for damage, Foreign body sensation but no foreign body visible on eye examination"
    ],
    "Red Flags": [
      "Reduced visual acuity",
      "Central redness (around iris)",
      "Unequal pupils or abnormal shape",
      "Fever and facial swelling"
    ],
    "Examinations": [
      examinationIds.EYE_EXAM
    ]
  },
  "Neurological symptoms": {
    "History Taking": [
      "Sudden or gradual onset of symptoms",
      "Onset and duration",
      "Which symptoms (weakness, confusion, vision changes, numbness, seizures, speech difficulties)"
    ],
    "Associated Symptoms": [
      "One-sided weakness or numbness",
      "Slurred speech or confusion",
      "Headache or neck stiffness",
      "Double vision or unequal pupils",
      "Seizure or collapse"
    ],
    "Focused Past Medical History": [
      "Stroke or epilepsy",
      "Migraine",
      "Hypertension or diabetes"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Advanced neurologic check"
    ],
    "Investigations": [
      "Blood glucose if available",
      "CRP test if temperature is ≥38 degree Celsius"
    ],
    "Red Flags": [
      "New confusion or collapse",
      "One-sided weakness or slurred speech",
      "Fever + headache or stiff neck",
      "Seizure or unresponsiveness",
      "Unequal pupils or cranial nerve signs"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.ADVANCED_NEURO
    ]
  },
  "Obstipation": {
    "History Taking": [
      "Last bowel movement?",
      "Bloating, nausea, and abdominal discomfort",
      "Chronic or new"
    ],
    "Associated Symptoms": [
      "Nausea or vomiting",
      "No passage of gas",
      "Abdominal pain or swelling",
      "Decreased appetite"
    ],
    "Focused Past Medical History": [
      "Previous episodes of obstipation or ileus",
      "Previous bowel surgery",
      "Hernia",
      "Medications associated with obstipation, such as opioid or iron"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "Abdomen examination",
      "Abdominal pain exam if pain reported or found in previous exam"
    ],
    "Investigations": [
      "CRP test if temperature is ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Vomiting and no passage of gas or stool for ≥24 hours",
      "Abdominal pain with fever",
      "Rectal bleeding or black stool",
      "Known hernia with new abdominal pain"
    ],
    "Examinations": [
      examinationIds.ABDOMEN_EXAM,
      examinationIds.ABDOMINAL_PAIN
    ]
  },
  "Sea Sickness": {
    "History Taking": [
      "Previous history of sea/motion sickness?",
      "Onset: sudden vs gradual",
      "Trigger: type of motion (ship, rough sea, vehicle), duration, frequency",
      "Severity: 1–10 scale, impact on function",
      "Associated triggers: food, alcohol, fatigue, anxiety",
      "Relief factors: fresh air, position, antiemetics"
    ],
    "Associated Symptoms": [
      "Nausea, vomiting",
      "Dizziness or vertigo",
      "Pallor or cold sweating",
      "Headache",
      "Dehydration (dry mouth, reduced urination)"
    ],
    "Focused Past Medical History": [
      "Vestibular disorders, migraine history",
      "Recent head trauma",
      "Pregnancy (especially first trimester)",
      "Medications that may affect balance or nausea"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance",
      "Simple neurologic check"
    ],
    "Investigations": [
      "Blood glucose if patient is known diabetic",
      "CRP test if temperature is ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Severe dehydration",
      "Neurological symptoms suggesting other pathology",
      "Unable to retain fluids"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE,
      examinationIds.SIMPLE_NEURO
    ]
  },
  "Sleeplessness / Insomnia": {
    "History Taking": [
      "Duration: acute (<4 weeks) or chronic (>4 weeks)",
      "Sleep onset vs sleep maintenance problems",
      "Sleep schedule: bedtime, wake time, naps",
      "Daytime consequences: fatigue, concentration, irritability",
      "Possible triggers: stress, shift work, travel, environmental factors (noise, light)"
    ],
    "Associated Symptoms": [
      "Anxiety, worry, racing thoughts",
      "Mood changes: irritability, low mood",
      "Snoring, witnessed apneas, restless legs, nocturia",
      "Caffeine, alcohol, or stimulant use"
    ],
    "Focused Past Medical History": [
      "Psychiatric history: depression, anxiety",
      "Chronic pain",
      "Sleep disorders: sleep apnea, restless legs, circadian rhythm disorders",
      "Medications affecting sleep"
    ],
    "Vital Signs": [
      "body temperature, respiratory rate, heart rate/pulse, blood pressure, oxygen saturation (SpO2), level of consciousness (AVPU)"
    ],
    "Clinical Examination": [
      "General appearance"
    ],
    "Investigations": [
      "Blood glucose if patient is known diabetic",
      "CRP test if temperature is ≥38 degree Celsius"
    ],
    "Red Flags": [
      "Severe psychiatric symptoms",
      "Suicidal ideation",
      "Significant impact on safety or function"
    ],
    "Examinations": [
      examinationIds.GENERAL_APPEARANCE
    ]
  }
};

// Define general red flags that apply to all symptoms
export const generalRedFlags = [
  "Any condition or injury that is potentially life-threatening unless treated urgently",
  "Maritime Early Warning Score (M-EWS) of ≥3",
  "Pain score (Numeric pain rating scale) of ≥7",
  "Suspicion of any fractures, dislocations, ligament or tendon injuries",
  "Suspicion of loss of consciousness",
  "Suspicion of injuries to nerves and/or blood vessels",
  "Suspicion of seizure",
  "Suspicion of any focal neurological deficit",
  "Bleeding requiring the use of a tourniquet",
  "Altered mental state or confusion",
  "Hypertensive emergency (systolic blood pressure ≥180 mmHg and any hypertension-related symptoms)",
  "Positive Malaria test",
  "Positive pregnancy test",
  "Suspicion of psychiatric emergency (e.g. acute psychosis, suicidal ideation, aggression)",
  "Suspicion of drug or alcohol abuse, or withdrawal symptoms",
  "Suspicion of shock if score 4 or higher",
  "Suspicion of sepsis if score 3 or higher",
  "Change in vital signs compared to previous measurements",
  "If the patient or medical officer reporting is particularly concerned"
];

// Define general yellow flags that require attention but are less urgent
export const generalYellowFlags = [
  "A procedure is perhaps required (injections, peripheral cannulas, intravenous fluid infusion, wound suturing, fracture management, treating major wounds or bleeding, urinary catheterization)",
  "If a doctor in a foreign port gives unclear instructions",
  "Fever lasting more than 3 days",
  "New fever in a patient who has already been examined and treated through a physician",
  "Before administering medicine unless specified that the medication may be given without involvement of a physician",
  "Moderate pain (5-7/10) with minimal response to initial treatment",
  "Vital signs outside normal range but not critically abnormal",
  "Abnormal test results requiring follow-up",
  "Moderate dehydration",
  "Temperature 38-40°C persisting >24 hours",
  "Multiple symptoms without clear diagnosis",
  "Risk factors for serious disease (age >65, immunocompromised, etc.)",
  "High-risk medications (anticoagulants, immunosuppressants)",
  "Recent trauma without critical injuries",
  "Recurrent symptoms without improvement"
];

// Extract just the red flags from symptom guidelines for easier access
export const redFlagsMapping: Record<string, string[]> = {};
for (const symptom in symptomGuidelines) {
  if (symptomGuidelines[symptom]["Red Flags"]) {
    // Combine symptom-specific red flags with general red flags
    redFlagsMapping[symptom] = [...symptomGuidelines[symptom]["Red Flags"], ...generalRedFlags];
  }
}

// Create a yellow flags mapping
export const yellowFlagsMapping: Record<string, string[]> = {};
for (const symptom in symptomGuidelines) {
  // All symptoms get the general yellow flags
  yellowFlagsMapping[symptom] = [...generalYellowFlags];
}

// Function to get allowed examinations for a given symptom
export function getExaminationsForSymptom(symptom) {
  return symptomGuidelines[symptom]?.Examinations || [];
}

// Function to get frontend display mapping for an examination ID
export function getExaminationFrontendMapping(examinationId) {
  return examinationFrontendMapping[examinationId] || "No examinations";
}

// Function to get display name for an examination ID
export function getExaminationDisplayName(examinationId) {
  return examinationDisplayNames[examinationId] || `Examination ${examinationId}`;
}

// Function to convert an examination ID to a physical examination marker
export function getPhysicalExaminationMarker(examinationId) {
  // Always use the English display name, regardless of the current language
  const displayName = getExaminationDisplayName(examinationId);
  
  // Return the standardized marker format with the English examination name
  return `PHYSICAL_EXAMINATION:${displayName}`;
}

