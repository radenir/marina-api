// ---------------------------------------------------------------------------
// motion.ts — the animation primitives this film needs and the walkthrough
// didn't. The walkthrough only ever moved whole phones (see components/anim.ts);
// here things move *inside* the phone, so we need to talk about time in terms of
// "when does this field fill" rather than "when does this card enter".
//
// Everything takes an explicit `frame` rather than calling useCurrentFrame(),
// so these stay usable inside .map() and in non-component helpers.
// ---------------------------------------------------------------------------
import { interpolate, spring } from 'remotion';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/// The leading substring of `text` that has been "typed" by `frame`.
///
/// Typing is deliberately linear, not eased: a spring here reads as a stutter
/// because the eye tracks the last character, not the envelope.
export const typed = (text: string, frame: number, from: number, dur: number) => {
  const n = interpolate(frame, [from, from + dur], [0, text.length], clamp);
  return text.slice(0, Math.round(n));
};

/// Whether `text` has finished typing — used to decide when the caret goes away.
export const typedDone = (text: string, frame: number, from: number, dur: number) =>
  frame >= from + dur;

/// A gentle 0→1 once `at` passes. The film's default entrance.
export const at = (frame: number, fps: number, when: number, delay = 0) =>
  spring({ frame: frame - when - delay, fps, config: { damping: 200 } });

/// 0→1→0. Used for the highlight that flares behind a field the instant it
/// fills, so the eye is pulled to the field that just changed rather than having
/// to scan the whole form.
export const flash = (frame: number, when: number, dur = 26) =>
  interpolate(frame, [when, when + dur * 0.22, when + dur], [0, 1, 0], clamp);

/// A value counting up — score badges, pending-segment counters.
export const countTo = (frame: number, when: number, dur: number, value: number) =>
  Math.round(interpolate(frame, [when, when + dur], [0, value], clamp));

/// Hold at 0, rise, hold at 1, fall — for elements that appear and leave again
/// within one scene (the tap ripple, the offline banner).
export const window_ = (
  frame: number,
  inAt: number,
  outAt: number,
  ramp = 10
) =>
  interpolate(
    frame,
    [inAt, inAt + ramp, outAt - ramp, outAt],
    [0, 1, 1, 0],
    clamp
  );

/// Simulated microphone level for the waveform.
///
/// Two incommensurable sine frequencies per bar plus a per-bar phase offset. One
/// frequency reads as a metronome; the beat pattern of two never repeats over a
/// scene, so it reads as speech.
export const micLevel = (frame: number, i: number, active: boolean) => {
  if (!active) return 0.04;
  const a = Math.sin(frame / 4.1 + i * 0.73);
  const b = Math.sin(frame / 9.7 + i * 0.31);
  const speech = Math.sin(frame / 21) * 0.35 + 0.65; // slow breath envelope
  return Math.min(1, Math.abs(a * 0.6 + b * 0.4) * speech + 0.06);
};

/// Where a value on the report came from, for the little provenance tag.
export const sourceColor = (source: 'spoken' | 'auto', navy: string, muted: string) =>
  source === 'spoken' ? navy : muted;
