import type { InterviewState } from './interviewTypes.js';
import { buildSystemPrompt, STAGES } from './interviewWorkflow.js';
import { getToolDefs, executeTool } from './interviewTools.js';
import { nebius } from './nebius.js';
import { config } from '../config.js';
import type { ChatCompletionMessageParam, ChatCompletion } from 'openai/resources/index.js';

function toMessages(history: Record<string, unknown>[]): ChatCompletionMessageParam[] {
  return history as unknown as ChatCompletionMessageParam[];
}

const MAX_TOKENS = 2048;
const MAX_TOOL_ITERATIONS = 40;
const TEMPERATURE = 0.3;
const FREQUENCY_PENALTY = 0.5;
const STAGE_ADVANCING_TOOLS = new Set(['completeStage', 'logPrimarySymptom']);

interface AgentResult {
  reply: string;
  newState: InterviewState;
  done: boolean;
  report: string | null;
}

function buildResult(state: InterviewState, reply: string): AgentResult {
  return {
    reply,
    newState: state,
    done: state.done || false,
    report: state.report || null,
  };
}

/**
 * Process one user message through the agent loop.
 * Fully stateless — takes state in, returns updated state + reply.
 *
 * Conversation history is stored in OpenAI format:
 *   { role: 'user',      content: string }
 *   { role: 'assistant', content: string|null, tool_calls?: [...] }
 *   { role: 'tool',      tool_call_id: string, content: string }
 *
 * The system prompt is NOT stored in history — it is prepended fresh on every
 * API call so stage transitions take effect immediately.
 */
export async function runAgent(state: InterviewState, userText: string): Promise<AgentResult> {
  // Start with the user message appended to history
  let currentState: InterviewState = {
    ...state,
    conversationHistory: [...state.conversationHistory, { role: 'user', content: userText }],
  };

  let systemPrompt = buildSystemPrompt(currentState);
  let stageTools = getToolDefs(STAGES[Math.min(currentState.stage, 8)]?.tools || ['completeStage']);

  let iterations = 0;
  let lastToolName: string | null = null;

  // ── Tool-use loop ─────────────────────────────────────────────────────────
  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    // Prepend fresh system message; never stored in state history
    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      ...toMessages(currentState.conversationHistory),
    ];

    const requestParams: Parameters<typeof nebius.chat.completions.create>[0] = {
      model: config.nebius.model,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      frequency_penalty: FREQUENCY_PENALTY,
      messages,
    };
    if (stageTools.length > 0) {
      requestParams.tools = stageTools as Parameters<typeof nebius.chat.completions.create>[0]['tools'];
      requestParams.tool_choice = 'auto';
    }

    const response = await nebius.chat.completions.create(requestParams) as ChatCompletion;
    const choice = response.choices[0];
    const msg = choice.message;

    // Store the assistant turn in history (with tool_calls if present)
    const assistantEntry: Record<string, unknown> = { role: 'assistant', content: msg.content ?? null };
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      assistantEntry.tool_calls = msg.tool_calls;
    }
    currentState = {
      ...currentState,
      conversationHistory: [...currentState.conversationHistory, assistantEntry],
    };

    // ── No tool calls → done with this user turn ──────────────────────────
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      const replyText = msg.content?.trim() || '';

      // If reply is empty, discard the empty assistant entry and retry once
      // with a nudge so the LLM has something new to react to.
      if (replyText === '' && !STAGE_ADVANCING_TOOLS.has(lastToolName ?? '')) {
        const cleanHistory = currentState.conversationHistory.slice(0, -1);
        const retryParams: Parameters<typeof nebius.chat.completions.create>[0] = {
          model: config.nebius.model,
          max_tokens: MAX_TOKENS,
          temperature: TEMPERATURE,
          frequency_penalty: FREQUENCY_PENALTY,
          messages: [
            { role: 'system', content: systemPrompt },
            ...toMessages(cleanHistory),
            { role: 'user', content: '[continue]' },
          ],
        };
        if (stageTools.length > 0) {
          retryParams.tools = stageTools as Parameters<typeof nebius.chat.completions.create>[0]['tools'];
          retryParams.tool_choice = 'auto';
        }
        const retryResponse = await nebius.chat.completions.create(retryParams) as ChatCompletion;
        const retryMsg = retryResponse.choices[0].message;

        if (retryMsg.tool_calls && retryMsg.tool_calls.length > 0) {
          const retryEntry: Record<string, unknown> = { role: 'assistant', content: retryMsg.content ?? null, tool_calls: retryMsg.tool_calls };
          currentState = { ...currentState, conversationHistory: [...cleanHistory, retryEntry] };
          continue;
        }

        currentState = {
          ...currentState,
          conversationHistory: [...cleanHistory, { role: 'assistant', content: retryMsg.content ?? null }],
        };
        return buildResult(currentState, retryMsg.content?.trim() || '');
      }

      return buildResult(currentState, replyText);
    }

    // ── Tool calls → execute each, push tool result messages ─────────────
    let stageAdvanced = false;

    for (const toolCall of msg.tool_calls) {
      if (!('function' in toolCall)) continue;
      const toolName = (toolCall as { id: string; function: { name: string; arguments: string } }).function.name;
      let toolInput: Record<string, unknown>;
      try {
        toolInput = JSON.parse((toolCall as { id: string; function: { name: string; arguments: string } }).function.arguments || '{}') as Record<string, unknown>;
      } catch {
        toolInput = {};
      }
      const toolCallId = (toolCall as { id: string }).id;

      lastToolName = toolName;
      const stageBefore = currentState.stage;
      const { result, newState } = executeTool(toolName, toolInput, currentState);

      const toolResultMessage: Record<string, unknown> = {
        role: 'tool',
        tool_call_id: toolCallId,
        content: JSON.stringify(result),
      };

      currentState = {
        ...newState,
        conversationHistory: [...newState.conversationHistory, toolResultMessage],
      };

      // Detect stage advancement from any tool
      if (currentState.stage !== stageBefore) {
        stageAdvanced = true;
      }
    }

    // Rebuild system prompt / tool list when stage changed
    if (stageAdvanced) {
      systemPrompt = buildSystemPrompt(currentState);
      if (currentState.done) {
        break;
      }
      stageTools = getToolDefs(STAGES[Math.min(currentState.stage, 8)]?.tools || ['completeStage']);

      // Inject a stage-open trigger so the new stage LLM doesn't mistake the
      // previous "nothing to add" as completing this stage.
      // For stages 6-8 the medical officer takes over — reinforce the MO language
      // right here so it is the most recent instruction before the LLM responds.
      // Only reinforce MO language for stages 6-8 — patient stages were already
      // working correctly and adding a language reminder there conflicts with the
      // "call completeStage with no text output" completion rule.
      const isMOStage = currentState.stage >= 6;
      const langReminder = isMOStage && currentState.variables.medicalOfficerLanguage
        ? ` You MUST respond in ${currentState.variables.medicalOfficerLanguage} only — do not use any other language.`
        : '';
      currentState = {
        ...currentState,
        conversationHistory: [
          ...currentState.conversationHistory,
          {
            role: 'user',
            content: `[Stage transition complete. You MUST ask the first question of this new stage now. Do NOT call completeStage until all questions have been asked and answered.${langReminder}]`,
          },
        ],
      };

      // Force a text-only response to get the opening question of the new stage.
      const openingResponse = await nebius.chat.completions.create({
        model: config.nebius.model,
        max_tokens: MAX_TOKENS,
        temperature: TEMPERATURE,
        frequency_penalty: FREQUENCY_PENALTY,
        messages: [
          { role: 'system', content: systemPrompt },
          ...toMessages(currentState.conversationHistory),
        ],
      });
      const openingMsg = openingResponse.choices[0].message;
      currentState = {
        ...currentState,
        conversationHistory: [...currentState.conversationHistory, { role: 'assistant', content: openingMsg.content ?? null }],
      };
      return buildResult(currentState, openingMsg.content || '');
    }

    // Loop — next iteration lets the model respond to tool results
  }

  // Iteration limit hit — make one final text-only call to get a graceful response
  try {
    const fallbackResponse = await nebius.chat.completions.create({
      model: config.nebius.model,
      max_tokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      frequency_penalty: FREQUENCY_PENALTY,
      messages: [
        { role: 'system', content: systemPrompt },
        ...toMessages(currentState.conversationHistory),
        { role: 'user', content: '[Please summarise what has been covered so far and ask if the medical officer has anything to add.]' },
      ],
    });
    const fallbackMsg = fallbackResponse.choices[0].message;
    currentState = {
      ...currentState,
      conversationHistory: [...currentState.conversationHistory, { role: 'assistant', content: fallbackMsg.content ?? null }],
    };
    return buildResult(currentState, fallbackMsg.content || '');
  } catch {
    return buildResult(currentState, '');
  }
}

/**
 * Generate the opening greeting for a new session without modifying conversation history.
 * The LLM produces the greeting in the patient's language based on the stage 0 system prompt.
 */
export async function generateGreeting(state: InterviewState): Promise<AgentResult> {
  const systemPrompt = buildSystemPrompt(state);
  const response = await nebius.chat.completions.create({
    model: config.nebius.model,
    max_tokens: 128,
    temperature: TEMPERATURE,
    frequency_penalty: FREQUENCY_PENALTY,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `[Begin: introduce yourself as Marina and ask the patient what is going on. Respond in ${state.variables.patientLanguage}. One sentence only.]` },
    ],
  });
  const reply = response.choices[0]?.message?.content?.trim() || '';
  return { reply, newState: state, done: false, report: null };
}
