// ---------------------------------------------------------------------------
// gen-vo.mjs — generate the walkthrough voiceover with ElevenLabs.
//
//   node scripts/gen-vo.mjs            # (re)generate every line
//   node scripts/gen-vo.mjs vo-06      # only lines whose name contains "vo-06"
//   VOICE_ID=<id> node scripts/gen-vo.mjs
//
// Reads ELEVENLABS_API_KEY (and optional ELEVENLABS_BASE_URL) from the parent
// marina-api/.env. `name` here must match the VO names referenced in
// remotion/theme.ts — that naming is the contract linking script → composition.
// ---------------------------------------------------------------------------
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..'); // video/
const OUT_DIR = join(REPO, 'public', 'audio');

// ---- read API key from ../.env (marina-api/.env) ----
const envPath = join(REPO, '..', '.env');
const env = readFileSync(envPath, 'utf8');
const readEnv = (k) => {
  const m = env.match(new RegExp(`^${k}=(.*)$`, 'm'));
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : undefined;
};
const API_KEY = readEnv('ELEVENLABS_API_KEY');
const BASE_URL = readEnv('ELEVENLABS_BASE_URL');
if (!API_KEY) {
  console.error(`Missing ELEVENLABS_API_KEY in ${envPath}`);
  process.exit(1);
}

// George — warm British narrator (same voice family as the marina-ad).
const VOICE_ID = process.env.VOICE_ID || 'bfGb7JTLUnZebZRiFYyq';

const client = new ElevenLabsClient({
  apiKey: API_KEY,
  ...(BASE_URL ? { environment: BASE_URL } : {}),
});

// The narration. Keep in sync with VO[] in remotion/theme.ts.
const LINES = [
  {
    name: 'vo-01-intro',
    text: 'This is Marina — a telemedicine assistant for ships at sea. <break time="0.35s" /> When a crew member falls ill and there is no doctor aboard, Marina helps a non-medical officer document the case and get it to a doctor onshore.',
  },
  {
    name: 'vo-02-start',
    text: 'You sign in with your Marina account. <break time="0.3s" /> New accounts verify their email and are activated by our team — then you are ready to go.',
  },
  {
    name: 'vo-03-note',
    text: 'The app opens on the Note Taker. <break time="0.3s" /> Tap record and simply describe the patient. Marina transcribes as you speak and builds a structured medical report live, right on screen.',
  },
  {
    name: 'vo-04-location',
    text: 'Set your vessel details once in your profile — ship, call sign, medicine chest and company. <break time="0.3s" /> Marina fills them into every report, automatically.',
  },
  {
    name: 'vo-05-setup',
    text: 'For a guided assessment, open the A I Interview. <break time="0.3s" /> Choose the patient’s language and your own — Marina speaks to each of you in your own tongue.',
  },
  {
    name: 'vo-06-stages',
    text: 'Marina runs a nine-stage medical interview. <break time="0.3s" /> It asks the patient about their symptom, history, and medications, then hands over to you for vital signs and a physical exam. The patient just speaks — Marina translates and reads every question aloud.',
  },
  {
    name: 'vo-07-translator',
    text: 'Need a quick two-way conversation? <break time="0.3s" /> The Translator lets the patient and officer talk naturally. Marina transcribes, translates, and speaks each side out loud.',
  },
  {
    name: 'vo-08-report',
    text: 'Every mode feeds one medical report. <break time="0.3s" /> Five tabs — patient, problem, examination, treatment, and observations — track exactly what is filled in. Every field is editable.',
  },
  {
    name: 'vo-09-improve',
    text: 'Not sure what else to ask? <break time="0.3s" /> Improve Report suggests A I follow-up questions, some with demonstration videos. Then pick your template — Marina’s own, or the Danish Radio Medical form.',
  },
  {
    name: 'vo-10-pdf',
    text: 'When you are done, download or email the finished P D F — a clean clinical report, ready for the doctor onshore.',
  },
  {
    name: 'vo-11-outro',
    text: 'Marina. <break time="0.25s" /> Maritime medical reporting, in any language.',
  },

  // -------------------------------------------------------------------------
  // "One Consultation" (MarinaConsultation). Keep in sync with VO[] in
  // remotion/consultation/script.ts — the name is the contract linking the two.
  // -------------------------------------------------------------------------
  {
    name: 'vo-nt-01-open',
    text: 'Three in the morning. A crew member is sick, you are not a doctor, <break time="0.3s" /> and the form in front of you is in a language that is not yours. With Marina, you do not fill it in. <break time="0.35s" /> You talk.',
  },
  {
    name: 'vo-nt-02-talk',
    text: 'Speak in your own language — Marina listens in thirty-five of them, and works out which one you are speaking on its own. <break time="0.35s" /> Say things in whatever order they come to you. Correct yourself halfway through, and Marina takes the correction, not the mistake.',
  },
  {
    name: 'vo-nt-03-build',
    text: 'While you are still speaking, the report is already being written — in clean clinical English, with the grammar taken care of. <break time="0.35s" /> And the parts you would never say out loud, Marina fills in for you: your vessel, your position, the nearest port, and how long it would take you to reach it.',
  },
  {
    name: 'vo-nt-04-ask',
    text: 'Then Marina tells you what is missing. <break time="0.3s" /> Every field is checked against the medical protocol for this exact complaint — forty-four of them, each with its own list of what a doctor ashore will want to know. <break time="0.3s" /> Marina asks the single most useful question you have not answered yet, in your language.',
  },
  {
    name: 'vo-nt-05-show',
    text: 'And when a question needs you to actually do something, Marina shows you how. <break time="0.35s" /> Twenty-five demonstration videos, each attached to the exact question that needs it. Watch it, do it, and say what you saw — Marina writes it down properly.',
  },
  {
    name: 'vo-nt-06-voice',
    text: 'Remembered something? <break time="0.3s" /> Tap the microphone on any field and say it. Marina shows you what it heard, and every change stays undoable — because this becomes a medical record.',
  },
  {
    name: 'vo-nt-07-offline',
    text: 'And when the satellite drops — because it will — nothing is lost. <break time="0.3s" /> Marina keeps recording, holds the audio on the phone, and catches up the moment the link returns.',
  },
  {
    name: 'vo-nt-08-send',
    text: 'One dictation, three official forms — Marina’s own, the Danish Radio Medical form, and the German T MAS form. <break time="0.3s" /> Choose one, then download it, or send it straight to the doctor. <break time="0.3s" /> Nothing leaves the ship until you decide to send it.',
  },
  {
    name: 'vo-nt-09-end',
    text: 'Marina. <break time="0.3s" /> You talk. We write the report.',
  },

  // -------------------------------------------------------------------------
  // "90-Second Quickstart" (MarinaQuickstart). Keep in sync with VO[] in
  // remotion/quickstart/script.ts. Instructional register — second person,
  // calm, the tone of someone standing next to you. See SCENARIO-quickstart.md.
  // -------------------------------------------------------------------------
  {
    name: 'vo-qs-0',
    text: 'Marina, in ninety seconds. <break time="0.3s" /> Four things, and you are ready for your first consultation.',
  },
  {
    name: 'vo-qs-1',
    text: 'Before your first case, open your Profile and enter your cruising speed. <break time="0.3s" /> Marina uses it to tell a shore doctor how many hours you are from the nearest hospital. <break time="0.35s" /> Then tap Save, and wait for the green line. Profile does not save on its own.',
  },
  {
    name: 'vo-qs-2',
    text: 'To start a consultation, open the Note Taker and tap the microphone — once. <break time="0.3s" /> That one tap starts recording, fills in your ship and the date and time, and takes a GPS fix, before you have said a word. <break time="0.35s" /> Then just talk. Describe what is wrong, in your own words, in any order.',
  },
  {
    name: 'vo-qs-3',
    text: 'Now the one button people forget. As you talk, tap Update report whenever you pause for breath. <break time="0.3s" /> Marina is always listening — but the report on screen only rebuilds when you tap this. <break time="0.3s" /> Tap it often, and watch the case fill itself in. Forget it, and the report just sits there while you wonder what is wrong.',
  },
  {
    name: 'vo-qs-4',
    text: 'When you are done, pick a form and either download it, or email it straight to the doctor. <break time="0.35s" /> And the one rule to never forget: nothing leaves the ship until you send it. <break time="0.3s" /> Finishing a report tells no one. You have to send it.',
  },
  {
    name: 'vo-qs-5',
    text: 'Set up once. <break time="0.25s" /> Talk, tap Update, send. <break time="0.3s" /> Marina does the rest.',
  },
];

const filter = process.argv[2];
const jobs = filter ? LINES.filter((l) => l.name.includes(filter)) : LINES;

mkdirSync(OUT_DIR, { recursive: true });

console.log(`Voice ${VOICE_ID} · ${jobs.length} line(s) → ${OUT_DIR}`);

for (const l of jobs) {
  process.stdout.write(`  ${l.name} … `);
  try {
    const stream = await client.textToSpeech.convert(VOICE_ID, {
      text: l.text,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
      voiceSettings: {
        stability: 0.5,
        similarityBoost: 0.75,
        style: 0.0,
        useSpeakerBoost: true,
      },
    });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    writeFileSync(join(OUT_DIR, `${l.name}.mp3`), Buffer.concat(chunks));
    console.log('ok');
  } catch (err) {
    console.log('FAILED');
    console.error(`    ${err?.message || err}`);
  }
}

console.log('done');
