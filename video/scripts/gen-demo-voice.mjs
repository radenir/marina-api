// ---------------------------------------------------------------------------
// gen-demo-voice.mjs — generate the soundbytes the APP ITSELF hears.
//
//   node scripts/gen-demo-voice.mjs           # (re)generate every soundbyte
//   node scripts/gen-demo-voice.mjs problem   # only names containing "problem"
//   DEMO_VOICE_ID=<id> node scripts/gen-demo-voice.mjs
//
// This is NOT the narration. gen-vo.mjs writes the voiceover a VIEWER hears
// over the finished film; these files are played into the simulator's
// microphone during the take, so the app transcribes them for real. What comes
// out of Marina's dictation in the video is therefore genuinely what Marina
// made of this audio — not text pasted in behind the scenes.
//
// Consequences for how these lines are written:
//
//   * No SSML. <break> tags are narration polish; a dictating officer does not
//     pause on cue, and the tags would be read into the transcript by any
//     model that does not strip them.
//   * Spoken register, not written. Sentence fragments, "uh", a correction
//     halfway through — that is what the transcriber will meet at sea, and the
//     film's claim is that Marina copes with it.
//   * Numbers said aloud the way a person says them ("thirty-eight point six"),
//     because that is what the microphone would actually carry.
//   * Seven seconds each, hard. The take waits out every soundbyte in real
//     time, so length here is length on screen: the first cut ran four minutes
//     of dictation and played as a recital rather than a demo. Roughly
//     eighteen spoken words fits. Say the one thing the field is for and stop —
//     the point being shown is that Marina files it correctly, not that the
//     officer is thorough.
//
// The `name` is the contract: DemoFilmTests.swift asks for a soundbyte by this
// exact name, and record-demo.sh plays public/soundbytes/<name>.mp3.
//
// Reads ELEVENLABS_API_KEY (and optional ELEVENLABS_BASE_URL) from the parent
// marina-api/.env, same as gen-vo.mjs.
// ---------------------------------------------------------------------------
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..'); // video/
const OUT_DIR = join(REPO, 'public', 'soundbytes');

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

// Defaults to the same known-good voice gen-vo.mjs uses. Override with
// DEMO_VOICE_ID to give the officer a different voice from the narrator —
// worth doing, since in the finished film the two are heard back to back.
const VOICE_ID = process.env.DEMO_VOICE_ID || 'bfGb7JTLUnZebZRiFYyq';

const client = new ElevenLabsClient({
  apiKey: API_KEY,
  ...(BASE_URL ? { environment: BASE_URL } : {}),
});

// ---------------------------------------------------------------------------
// The consultation.
//
// One patient, one complaint, told in the order an officer would actually tell
// it. Keep this consistent with the patient typed in DemoFilmTests.swift —
// a video where the header says Santos and the dictation says someone else is
// worse than no video.
//
//   Ramil Santos, 34, Filipino AB. Right lower abdominal pain, ~18 hours.
//   Reads as possible appendicitis: the case that makes a master consider
//   diverting, which is why it is the right one to show.
// ---------------------------------------------------------------------------
const SOUNDBYTES = [
  {
    name: 'sb-problem-description',
    text: "Right lower abdominal pain since yesterday evening. Constant, seven out of ten.",
  },
  {
    name: 'sb-medical-history',
    text: "No chronic illness, no medication, no allergies. Nothing abdominal.",
  },
  {
    name: 'sb-findings-vitals',
    text: "Temperature thirty-eight point four. Pulse one hundred four. Blood pressure one twenty-five over eighty.",
  },
  {
    name: 'sb-findings-exam',
    text: "Tender in the right lower quadrant, with rebound and guarding. Bowel sounds reduced.",
  },
];

const filter = process.argv[2];
const jobs = filter ? SOUNDBYTES.filter((s) => s.name.includes(filter)) : SOUNDBYTES;

mkdirSync(OUT_DIR, { recursive: true });

console.log(`Voice ${VOICE_ID} · ${jobs.length} soundbyte(s) → ${OUT_DIR}`);

for (const s of jobs) {
  process.stdout.write(`  ${s.name} … `);
  try {
    const stream = await client.textToSpeech.convert(VOICE_ID, {
      text: s.text,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
      voiceSettings: {
        // Lower stability than the narration: a shade more variation reads as
        // a person reporting a case rather than a voice actor performing one.
        stability: 0.4,
        similarityBoost: 0.75,
        style: 0.0,
        useSpeakerBoost: true,
      },
    });
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    writeFileSync(join(OUT_DIR, `${s.name}.mp3`), Buffer.concat(chunks));
    console.log('ok');
  } catch (err) {
    console.log('FAILED');
    console.error(`    ${err?.message || err}`);
  }
}

console.log('done');
