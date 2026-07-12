import OpenAI from 'openai';
import { config } from '../config.js';

// OVHcloud AI Endpoints (OpenAI-compatible) — backup provider for chat completions.
export const ovh = new OpenAI({
  apiKey: config.ovh.apiKey,
  baseURL: config.ovh.baseUrl,
});

// Dedicated backup for the medical interview / extract (Qwen3.5-397B).
export const ovhInterview = new OpenAI({
  apiKey: config.ovhInterview.apiKey,
  baseURL: config.ovhInterview.baseUrl,
});
