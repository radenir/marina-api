import OpenAI from 'openai';
import { config } from '../config.js';

export const nebius = new OpenAI({
  apiKey: config.nebius.apiKey,
  baseURL: config.nebius.baseUrl,
});
