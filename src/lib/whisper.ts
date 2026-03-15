import OpenAI from 'openai';
import { config } from '../config.js';

export const whisper = new OpenAI({
  apiKey: config.whisper.apiKey,
  baseURL: config.whisper.baseUrl,
});
