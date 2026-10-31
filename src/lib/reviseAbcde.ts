// ---------------------------------------------------------------------------
// reviseAbcde.ts — change the A–E assessment from a spoken instruction.
//
// The sibling of reviseVitals.ts for the A–E part of the report: thirty-odd
// tick boxes and short fields, so the officer speaks once for the whole of it
// ("collar fitted, no convulsions, pupils normal") rather than tapping each.
//
// The model sees and answers in the same plain terms as the extract's A–E
// batches (abcdeAnswersFromFields in, abcdeFields out), so a dictated change
// obeys exactly the rules an extracted one does: a box is ticked only on an
// explicit "yes"/"no", unknown words tick nothing. Anything he says that is not
// A–E comes back in `unmapped`, never dropped.
// ---------------------------------------------------------------------------
import { ovh } from './ovh.js';
import { chatWithFallback, type FallbackOpts } from './llmFallback.js';
import { config } from '../config.js';
import { parseLooseJson } from './reviseVitals.js';
import { ABCDE_FIELD_KEYS, abcdeAnswersFromFields, abcdeFields, isAbcdeBox } from './medicalExtractV2.js';

const REVISE_FALLBACK: FallbackOpts = {
  primaryModel: config.nebius.extractV2Model,
  timeoutMs: 10_000,
  backupClient: ovh,
  backupModel: config.ovh.model,
};

export type AbcdeFields = Record<string, string | boolean>;

export interface ReviseAbcdeResult {
  /** Every A–E field after the change: boxes true/false, text "" when empty. */
  fields: AbcdeFields;
  /** The fields whose value changed. */
  changed: string[];
  /** Anything he said that is not part of A–E — never dropped. */
  unmapped: string | null;
}

/** Every A–E key present, boxes as booleans and text as strings. */
export function completeAbcde(partial: Record<string, unknown>): AbcdeFields {
  const out: AbcdeFields = {};
  for (const key of ABCDE_FIELD_KEYS) {
    const v = partial[key];
    out[key] = isAbcdeBox(key) ? v === true : typeof v === 'string' ? v.trim() : '';
  }
  return out;
}

function buildPrompt(current: Record<string, unknown>, instruction: string): string {
  return `You are updating the A–E (Airway, Breathing, Circulation, Disability, Expose) assessment of a maritime medical report from what the ship's medical officer just said out loud. He may speak any language.

=== CURRENT A–E ANSWERS ===
${JSON.stringify(current, null, 1)}

=== WHAT THE OFFICER SAID ===
${instruction.trim()}

=== HOW TO APPLY IT ===
Return the same object with what he said applied. Every item he did not mention is copied through EXACTLY as it is, including empty ones.

ITEMS (same meaning as the report's A–E section):
- airwayClear, neckBackInjurySuspected, neckCollarFitted, convulsions, paralysis, pupilsNormal, topToToeDone, hypothermiaOrOverheating, temperatureMeasured: "yes" / "no" / "".
- airwayManoeuvres: list from "jaw lift", "suction", "guedel airway".
- breathingPattern: list from "fast", "slow", "shallow", "deep", "normal".
- pulseMeasuredAt: "wrist" / "neck" / "groin" / "".
- skinColour: "pale" / "reddish" / "bluish" / "normal" / "".
- cprStartedAt: "hh:mm". oxygenLitresPerMin, capillaryRefillSeconds: digits only.
- breathingOther, skinFeel, pupilsDescription, topToToeFindings, hypothermiaOrOverheatingFindings, temperatureMeasuredAt: a short phrase in plain English.

RULES (follow strictly):
1. Only change what he actually said. Never infer one item from another or fill a gap to look complete.
2. "yes"/"no" only on an explicit statement or denial ("no convulsions" → convulsions "no").
3. To clear an item he explicitly retracted ("remove the collar", "that was wrong"), set it to "" or remove the word from the list.
4. Translate to English.
5. ANYTHING he said that is not part of A–E — a vital sign, a symptom, a medicine, a note — goes into "unmapped", translated to English, as a complete clinical phrase. His words are never discarded; never drop or soften what he said. If everything he said was A–E, "unmapped" is "".

Return ONE JSON object: the updated answers with exactly the keys above, plus "unmapped".`;
}

export async function reviseAbcde(current: Record<string, unknown>, instruction: string): Promise<ReviseAbcdeResult> {
  const before = completeAbcde(current);
  const completion = await chatWithFallback(
    {
      messages: [{ role: 'user', content: buildPrompt(abcdeAnswersFromFields(before), instruction) }],
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1200,
      reasoning_effort: 'low',
    } as never,
    REVISE_FALLBACK,
  );

  const raw = completion.choices[0]?.message?.content ?? '';
  const parsed = parseLooseJson(raw);
  if (!parsed) {
    console.error('[reviseAbcde] non-JSON response: %s', raw.slice(0, 200));
    throw new Error('Revision returned malformed output');
  }

  // Back through the extract's own rules. The temperature argument is empty:
  // "measured" comes from the answers here, not from a vital.
  const fields = completeAbcde(abcdeFields(parsed, parsed, ''));
  const changed = ABCDE_FIELD_KEYS.filter((k) => fields[k] !== before[k]);
  const unmapped = typeof parsed.unmapped === 'string' && parsed.unmapped.trim() ? parsed.unmapped.trim() : null;
  return { fields, changed, unmapped };
}
