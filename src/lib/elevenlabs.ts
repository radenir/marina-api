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
