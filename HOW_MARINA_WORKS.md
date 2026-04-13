# Marina — How It Works

## What Marina Is

Marina is a **telemedicine assistant for maritime vessels**. When a crew member falls ill at sea, there is typically no doctor aboard — only a non-medical officer who can observe the patient and perform basic measurements. Marina bridges this gap by conducting a structured medical interview that produces a clinical report which can be sent to a shore-based doctor.

There are two participants in every session:
- **The patient** — the sick crew member, who may speak any language
- **The medical officer** — the non-medical crew member handling the patient, who may speak a different language

Marina speaks to each of them in their own language, automatically switching between the two.

---

## The Interview Architecture

The interview runs entirely through a single stateless API endpoint: `POST /ai/interview/chat`.

**Stateless** means the server holds nothing between calls. On every request, the frontend sends the full accumulated conversation history and state back to the server. The server processes one turn, returns an updated state and reply, and forgets everything. This is a deliberate design — it means the server can be restarted or scaled without losing any session.

The state object sent on every call contains:
- `stage` — which of the 9 stages the interview is in (1–9)
- `conversationHistory` — the full message history in OpenAI format (user/assistant/tool roles)
- `variables` — template variables like `patientLanguage`, `medicalOfficerLanguage`, `symptom`, and all the symptom-specific medical protocol content
- `data` — structured records of vitals, investigations, and examination findings collected so far
- `done` — whether the interview is complete

---

## The 9 Stages

Each stage has a dedicated AI sub-agent with its own system prompt and available tools. The LLM never sees the next stage's instructions until it arrives there.

| Stage | Name | Who talks | Purpose |
|-------|------|-----------|---------|
| 1 | **Pathway AI** | Patient | Identify the primary symptom. Marina asks "what's wrong?", follows up, then confirms: "If I understand correctly, the main complaint is X. Do you confirm?" |
| 2 | **History Taking AI** | Patient | Age, gender, and symptom-specific history questions (onset, duration, severity, etc.) loaded from the medical protocol |
| 3 | **Associated Symptoms AI** | Patient | Symptom-specific associated symptoms — e.g. for chest pain: does it radiate? shortness of breath? sweating? |
| 4 | **Past Medical History AI** | Patient | Focused past history relevant to the symptom — e.g. prior cardiac events, surgeries |
| 5 | **Medications AI** | Patient | Current medications, OTC drugs, supplements, anything taken for the current problem |
| 6 | **Allergies AI** | Patient | Known allergies, allergen type, reaction type |
| 7 | **Vital Signs AI** | **Medical Officer** | SpO2, respiratory rate, heart rate, blood pressure, temperature, AVPU consciousness |
| 8 | **Investigations AI** | **Medical Officer** | Symptom-specific tests (e.g. ECG for chest pain, CRP if fever ≥38°C) — conditional on already-gathered data |
| 9 | **Physical Exam AI** | **Medical Officer** | A specific physical examination chosen from 30 possible protocols based on the symptom (e.g. Abdomen Examination, Neurologic Check, Wound Examination) |

When Physical Exam ends, the interview is `done: true` and a plain-text clinical report is generated on the server and returned to the frontend.

---

## The Medical Protocol Engine

When the patient confirms their symptom in Stage 1, the `logPrimarySymptom` tool fires. This looks up the symptom in `symptomGuidelines` — a structured database based on **SYBRA 1.02** (Symptom-based Remote Assessment Algorithm). This database maps each of the 42 possible symptoms to:

- History taking questions specific to that symptom
- Associated symptoms to probe
- Past medical history topics relevant to it
- Investigations to run (some conditional — e.g. "ECG if chest pain and not post-trauma")
- One or more physical examination protocols (from 30 types) to use

All of this content is injected into the system prompt as template variables (`{{historyTaking}}`, `{{investigations}}`, `{{examinationInstructions}}`, etc.) at the start of each stage. The LLM never decides what questions to ask — it only decides *how* to ask them. The *what* is entirely determined by the protocol.

---

## The Agent Loop

Each call to `/ai/interview/chat` runs an internal tool-use loop (up to 40 iterations):

1. User message is appended to history
2. LLM is called with the current system prompt + full history + available tools
3. If the LLM returns a text reply → return it to the frontend (one turn complete)
4. If the LLM calls a tool → execute it, update state, append tool result to history, loop back to step 2
5. If stage advances (via `completeStage` or `logPrimarySymptom`) → rebuild system prompt for the new stage, inject a stage-open trigger message, call LLM once more to get the opening question of the new stage, return that

Tools available vary by stage:
- Stage 1: `logPrimarySymptom` (triggers protocol load + stage advance)
- Stages 2–6: `completeStage` (advance to next stage)
- Stage 7 additionally: `logVitalSign` (structured vital recording)
- Stage 8 additionally: `logInvestigation`
- Stage 9 additionally: `logExaminationFinding`

The structured data tools (`logVitalSign`, `logInvestigation`, `logExaminationFinding`) cause the LLM to record findings in machine-readable form in `state.data` alongside the free-text conversation, making the final output both human-readable and structured.

---

## What Happens at the End

When `completeStage` is called at the end of Stage 9, `generateReport()` runs and produces a plain-text clinical report containing:
- Primary symptom
- All vital signs with values and units
- All investigations conducted
- All physical examination findings (question by question)
- The clinical protocol used (history topics, examinations, investigations)
- The full conversation transcript

This report is returned to the frontend as `state.report`. The frontend can then:
- Display it in the UI
- Download it as a PDF (`POST /ai/generate-pdf`)
- Email it as a PDF (`POST /ai/email-pdf`) → goes through the Mailjet queue

---

## Supporting Endpoints

Beyond the interview, the AI router provides:

- **`/ai/transcribe`** — Whisper STT: converts audio recordings to text (25MB limit, 500 req/hr). Used so the patient or officer can speak instead of type.
- **`/ai/translate`** — Bidirectional medical translation between 24 languages using the LLM. Supports the dual-language workflow.
- **`/ai/summarize`** — One-sentence conversation summary.
- **`/ai/extract`** — Parallel extraction of all RMD form fields from the full conversation — fills the standardized maritime medical form.
- **`/ai/generate-pdf`** — Fills the RMD PDF form using `pdftk` and returns the binary.
- **`/ai/email-pdf`** — Queues a PDF report for delivery via Mailjet (BullMQ, 3 retries).

---

## Key Design Decisions

- **Fully stateless** — no server-side sessions. The entire interview lives in the JSON state object the client holds.
- **Protocol-driven, not AI-driven** — the AI asks questions but the medical content (what to ask, in what order) comes from the SYBRA protocol database. The AI cannot improvise medical questions.
- **Language-aware throughout** — patient language and medical officer language are independent. The AI switches automatically when crossing the Stage 6→7 boundary (patient → medical officer handover).
- **Skip support** — any stage except Stage 1 can be skipped. The system injects a closing marker to prevent the LLM from trying to re-ask unanswered questions.
- **No diagnosis, no treatment** — Marina is explicitly a documentation tool only. The system prompt forbids any diagnostic or therapeutic suggestions.
