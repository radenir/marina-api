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
 * The voice to speak each language with.
 *
 * `language_code` fixes *pronunciation* — which phonemes the graphemes map to —
 * but not *accent*. The speaker's own phonetic habits ride along, so the single
 * English fallback voice this used to use read every language with an American
 * accent: French with an English R, Mandarin with its tones flattened. Each
 * entry below is a native speaker of its language.
 *
 * Three have no native voice in the ElevenLabs library at all:
 *   - ur  Urdu     → a Hindi voice. Hindi and Urdu are the same spoken language.
 *   - fa  Farsi    → a Persian speaker's voice, tagged English by the library.
 *   - th  Thai     → a Vietnamese voice. Not native, but Thai is tonal, and a
 *                    tonal-language speaker carries pitch contours that an
 *                    English one flattens into meaninglessness.
 *   - hy  Armenian → an English voice. The library has no Armenian voice of any
 *                    kind, native or adjacent.
 *
 * Anything unmapped falls back to `config.elevenlabs.ttsVoiceId`.
 */
const TTS_VOICE_BY_LANG: Record<string, string> = {
  ar: 'VwC51uc4PUblWEJSPzeo', // Abrar Sabbah — modern standard
  bg: 'CBDgRB8OyxYGowoi5iXR', // Mimi — Sofia
  cs: '6cRTgsxIM2vjQneUzTWb', // Jordan
  da: '4RklGmuxoAskAbGXplXN', // Camilla
  de: '7eVMgwCnXydb3CikjV7a', // Lea — Clear and Feminine
  el: '7smwXrU3C1PfaspIIUZB', // Sophia
  es: 'zl7szWVBXnpgrJmAalgz', // Lily — Latin American
  fa: 'WwAjIyMBDBNl1dvId9Xe', // Nazy Entezari — no native Farsi voice exists
  fi: 'YSabzCJMvEHDduIDMdwV', // Aurora
  fr: 'FvmvwvObRqIHojkEGh5N', // Adina
  hi: 'Ms9OTvWb99V6DwRHZn6q', // Monika Sogam — Deep and Clear
  hr: '0jvpZ98RZwx5FBOSZAc3', // Maja
  hu: 'xjlfQQ3ynqiEyRpArrT8', // Vera
  hy: 'cgSgspJ2msm6clMCkdW9', // Jessica — no Armenian voice exists at all
  id: 'WQ4h6sgS9p2XXvLsESBT', // Selina
  it: 'CiwzbDpaN3pQXjTgx3ML', // Aida
  ja: '0ptCJp0xgdabdcpVtCB5', // Yoko Honda
  ko: 'UvkXHIJzOBYWOI51BDKp', // Jeong-Ah
  ms: '15Y62ZlO8it2f5wduybx', // Shazrina — Malaysian
  nl: 'D6MRWCKoavI2xUJXmaCb', // Jennifer
  no: 'uNsWM1StCcpydKYOjKyu', // Mia Starset — Oslo
  pl: 'lehrjHysCyPSvjt0uSy6', // Marta
  pt: 'ORgG8rwdAiMYRug8RJwR', // Ana Alice — Brazilian
  ro: '3z9q8Y7plHbvhDZehEII', // Antonia
  ru: 'AB9XsbSA4eLG12t2myjN', // Larisa Actrisa
  sk: 'xT8vKMZLI8RxWI3JZMPJ', // Mia
  sv: 'aSLKtNoVBZlxQEMsnGL2', // Sanna Hartfield — Stockholm
  ta: 'Nda4CxqYPMJ65wadFnhJ', // Harini
  th: 'X0V9HEDEuaVhVqzVPUKM', // Giang (Vietnamese) — no native Thai voice exists
  tl: 'uB4mdw2feSGsIhOhlVRR', // Carmela
  tr: 'Hvrobr8BhLPfiaSv2cHi', // Gamze Özdemir — Istanbul
  uk: 'zDLnIEu0UzYpFE8fq9aq', // Mila G
  ur: 'o85TqPN3F4P7dWae2paA', // Reva (Hindi) — no native Urdu voice exists
  vi: 'X0V9HEDEuaVhVqzVPUKM', // Giang
  zh: 'hkfHEbBvdQFNX4uWHqRF', // Stacy
};

/**
 * Synthesise speech from text via ElevenLabs TTS and return the raw MP3 bytes.
 * `languageCode` (app ISO code) picks both the voice and the pronunciation.
 * Returns audio/mpeg (mp3_44100_128).
 */
export async function elevenLabsTextToSpeech(
  text: string,
  languageCode?: string,
): Promise<Buffer> {
  const elLang = languageCode ? (TTS_LANG_CODE_MAP[languageCode] ?? languageCode) : undefined;
  const voiceId =
    (languageCode ? TTS_VOICE_BY_LANG[languageCode] : undefined) ?? config.elevenlabs.ttsVoiceId;
  const res = await fetch(
    `${config.elevenlabs.baseUrl}/v1/text-to-speech/${voiceId}`,
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
