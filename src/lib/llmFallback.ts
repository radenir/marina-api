import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/index.js';
import { nebius } from './nebius.js';
import { ovh } from './ovh.js';
import { config } from '../config.js';

/** If the primary provider (Nebius) doesn't answer within this window, fall back to OVH. */
const PRIMARY_TIMEOUT_MS = 5000;

/**
 * Run a chat completion on the primary provider (Nebius). If it errors or does not
 * respond within 5 seconds, fall back to gpt-oss-120b on OVHcloud AI Endpoints.
 *
 * Pass `params` WITHOUT a `model` field — each provider's model name is filled in.
 */
export async function chatWithFallback(
  params: Omit<ChatCompletionCreateParamsNonStreaming, 'model'>,
  opts: { primaryModel?: string } = {},
): Promise<ChatCompletion> {
  const primaryModel = opts.primaryModel ?? config.nebius.model;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRIMARY_TIMEOUT_MS);
  try {
    return (await nebius.chat.completions.create(
      { ...params, model: primaryModel },
      { signal: controller.signal },
    )) as ChatCompletion;
  } catch (err) {
    console.warn(
      `[llm] primary Nebius/${primaryModel} failed or timed out (${(err as Error).message}); ` +
      `falling back to OVH ${config.ovh.model}`,
    );
    return (await ovh.chat.completions.create({ ...params, model: config.ovh.model })) as ChatCompletion;
  } finally {
    clearTimeout(timer);
  }
}
