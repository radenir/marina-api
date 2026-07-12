import type OpenAI from 'openai';
import type { ChatCompletion, ChatCompletionCreateParamsNonStreaming } from 'openai/resources/index.js';
import { nebius } from './nebius.js';
import { ovh } from './ovh.js';
import { config } from '../config.js';

/** If the primary provider (Nebius) doesn't answer within this window, fall back. */
const DEFAULT_TIMEOUT_MS = 5000;

export interface FallbackOpts {
  /** Model name for the primary (Nebius) call. Defaults to config.nebius.model. */
  primaryModel?: string;
  /** How long to wait for the primary before aborting and falling back. */
  timeoutMs?: number;
  /** Backup OpenAI-compatible client. Defaults to the OVH gpt-oss-120b endpoint. */
  backupClient?: OpenAI;
  /** Model name for the backup call. Defaults to config.ovh.model. */
  backupModel?: string;
  /**
   * Extra params merged into the backup request only (e.g. `{ reasoning_effort: 'none' }`
   * to silence a reasoning model's hidden chain-of-thought). Not sent to the primary.
   */
  backupParams?: Record<string, unknown>;
}

/**
 * Run a chat completion on the primary provider (Nebius). If it errors or does not
 * respond within `timeoutMs`, fall back to a backup OpenAI-compatible endpoint.
 *
 * Pass `params` WITHOUT a `model` field — each provider's model name is filled in.
 */
export async function chatWithFallback(
  params: Omit<ChatCompletionCreateParamsNonStreaming, 'model'>,
  opts: FallbackOpts = {},
): Promise<ChatCompletion> {
  const primaryModel = opts.primaryModel ?? config.nebius.model;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const backupClient = opts.backupClient ?? ovh;
  const backupModel = opts.backupModel ?? config.ovh.model;
  const backupParams = opts.backupParams ?? {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return (await nebius.chat.completions.create(
      { ...params, model: primaryModel },
      { signal: controller.signal },
    )) as ChatCompletion;
  } catch (err) {
    console.warn(
      `[llm] primary Nebius/${primaryModel} failed or timed out after ${timeoutMs}ms ` +
      `(${(err as Error).message}); falling back to ${backupModel}`,
    );
    return (await backupClient.chat.completions.create({
      ...params,
      ...backupParams,
      model: backupModel,
    } as ChatCompletionCreateParamsNonStreaming)) as ChatCompletion;
  } finally {
    clearTimeout(timer);
  }
}
