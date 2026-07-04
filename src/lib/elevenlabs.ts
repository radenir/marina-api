import { config } from '../config.js';

export async function elevenLabsTranscribe(
  buffer: Buffer,
  filename: string,
  mimetype: string,
  language?: string,
): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimetype }), filename);
  form.append('model_id', config.elevenlabs.model);
  if (language) form.append('language_code', language);

  const res = await fetch(`${config.elevenlabs.baseUrl}/v1/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': config.elevenlabs.apiKey },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`ElevenLabs STT ${res.status}: ${text}`);
  }

  const json = (await res.json()) as { text?: string };
  if (!json.text) throw new Error('Empty response from ElevenLabs STT');
  return json.text;
}

/**
 * Map app language codes to ElevenLabs language codes where they differ.
 * The app uses `tl` (ISO 639-1) for Filipino; ElevenLabs expects `fil`.
 */
const TTS_LANG_CODE_MAP: Record<string, string> = { tl: 'fil' };

/**
 * Synthesise speech from text via ElevenLabs TTS and return the raw MP3 bytes.
 * The configured voice is language-agnostic; `languageCode` (app ISO code)
 * enforces pronunciation for the target language. Returns audio/mpeg (mp3_44100_128).
 */
export async function elevenLabsTextToSpeech(
  text: string,
  languageCode?: string,
): Promise<Buffer> {
  const elLang = languageCode ? (TTS_LANG_CODE_MAP[languageCode] ?? languageCode) : undefined;
  const res = await fetch(
    `${config.elevenlabs.baseUrl}/v1/text-to-speech/${config.elevenlabs.ttsVoiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': config.elevenlabs.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: config.elevenlabs.ttsModel,
        ...(elLang ? { language_code: elLang } : {}),
      }),
    },
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`ElevenLabs TTS ${res.status}: ${detail}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
