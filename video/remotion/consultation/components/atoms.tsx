// ---------------------------------------------------------------------------
// atoms.tsx — the animated in-phone parts. These are the difference between
// this film and the walkthrough: ../components/ui.tsx draws a field, this draws
// a field *filling*.
// ---------------------------------------------------------------------------
import React from 'react';
import { Lightbulb, Mic, Check, Undo2, WifiOff, Volume2 } from 'lucide-react';
import {
  NAVY,
  INK,
  MUTED,
  BORDER,
  FIELD,
  GREEN,
  AMBER,
  RED,
  TINT,
  FONT_FAMILY,
} from '../../theme';
import { typed, typedDone, flash, countTo, micLevel, window_ } from '../motion';

// ---------------------------------------------------------------------------
// Waveform — the recording indicator. Bars are mirrored around the centre line
// like the app's, and collapse to a flat line when not recording.
// ---------------------------------------------------------------------------
export const Waveform: React.FC<{
  frame: number;
  active: boolean;
  bars?: number;
  width?: number;
  height?: number;
  color?: string;
}> = ({ frame, active, bars = 42, width = 420, height = 92, color = NAVY }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      width,
      height,
    }}
  >
    {Array.from({ length: bars }).map((_, i) => {
      const h = Math.max(4, micLevel(frame, i, active) * height);
      return (
        <div
          key={i}
          style={{
            width: 5,
            height: h,
            borderRadius: 3,
            background: color,
            opacity: active ? 0.55 + (h / height) * 0.45 : 0.25,
          }}
        />
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Caret — the blinking cursor that follows typed text.
// ---------------------------------------------------------------------------
export const Caret: React.FC<{ frame: number; color?: string }> = ({
  frame,
  color = NAVY,
}) => (
  <span
    style={{
      display: 'inline-block',
      width: 3,
      height: '1em',
      verticalAlign: 'text-bottom',
      marginLeft: 2,
      background: color,
      opacity: Math.floor(frame / 8) % 2 === 0 ? 1 : 0,
    }}
  />
);

// ---------------------------------------------------------------------------
// LiveField — a report field that fills itself at a given frame, with a navy
// flare behind it so the eye lands on whatever just changed.
// ---------------------------------------------------------------------------
export const LiveField: React.FC<{
  frame: number;
  label: string;
  value: string;
  fillAt: number;
  typeDur?: number;
  multiline?: boolean;
  source?: 'spoken' | 'auto';
  compact?: boolean;
}> = ({
  frame,
  label,
  value,
  fillAt,
  typeDur = 26,
  multiline = false,
  source,
  compact = false,
}) => {
  const shown = typed(value, frame, fillAt, typeDur);
  const done = typedDone(value, frame, fillAt, typeDur);
  const started = frame >= fillAt;
  const glow = flash(frame, fillAt, 34);

  return (
    <div style={{ marginBottom: compact ? 9 : 13, position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 5,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 600, color: MUTED }}>{label}</span>
        {source === 'auto' && started && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: NAVY,
              background: TINT,
              borderRadius: 999,
              padding: '2px 8px',
              opacity: glow > 0 ? 1 : 0.8,
            }}
          >
            AUTO
          </span>
        )}
      </div>
      <div
        style={{
          background: FIELD,
          border: `1px solid ${BORDER}`,
          borderRadius: 12,
          padding: multiline ? '12px 15px' : '13px 15px',
          fontSize: multiline ? 17 : 20,
          lineHeight: multiline ? 1.42 : 1.2,
          color: started ? INK : '#b6c2cf',
          minHeight: multiline ? 76 : 26,
          // The flare: a navy ring + tint that fades out over ~1s.
          boxShadow: `0 0 0 ${glow * 3}px rgba(10,75,120,${glow * 0.35})`,
          transition: 'none',
        }}
      >
        {started ? (
          <>
            {shown}
            {!done && <Caret frame={frame} />}
          </>
        ) : (
          '—'
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ScoreBadge — the per-field 0–100 quality score, counting up. Red below 40,
// amber below 80, green above. Mirrors ReportScoreEngine's badge.
// ---------------------------------------------------------------------------
export const ScoreBadge: React.FC<{
  frame: number;
  value: number;
  showAt: number;
  dur?: number;
}> = ({ frame, value, showAt, dur = 30 }) => {
  const n = countTo(frame, showAt, dur, value);
  const color = value === 0 ? RED : value < 40 ? RED : value < 80 ? AMBER : GREEN;
  const on = frame >= showAt;
  return (
    <span
      style={{
        fontSize: 15,
        fontWeight: 800,
        color: '#fff',
        background: color,
        borderRadius: 999,
        padding: '3px 11px',
        opacity: on ? 1 : 0,
      }}
    >
      {n}%
    </span>
  );
};

// ---------------------------------------------------------------------------
// HintBox — the amber coaching box. Officer's language is the primary line; the
// English original is deliberately not shown, exactly as in the app.
// ---------------------------------------------------------------------------
export const HintBox: React.FC<{
  frame: number;
  showAt: number;
  text: string;
  speaking?: boolean;
  children?: React.ReactNode;
}> = ({ frame, showAt, text, speaking = false, children }) => {
  const p = window_(frame, showAt, showAt + 100000, 12);
  const slide = (1 - p) * 22;
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${slide}px)`,
        background: '#fffbeb',
        border: `1px solid ${AMBER}`,
        borderRadius: 14,
        padding: '14px 16px',
        marginTop: 12,
        fontFamily: FONT_FAMILY,
      }}
    >
      <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
        <Lightbulb size={22} color={AMBER} strokeWidth={2.4} style={{ flex: 'none', marginTop: 2 }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, lineHeight: 1.38, color: INK, fontWeight: 600 }}>
            {text}
          </div>
          {speaking && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                marginTop: 9,
                color: AMBER,
                fontSize: 15,
                fontWeight: 700,
              }}
            >
              <Volume2
                size={18}
                color={AMBER}
                strokeWidth={2.6}
                style={{ opacity: 0.5 + Math.abs(Math.sin(frame / 6)) * 0.5 }}
              />
              Read aloud
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// TapDot — a fingertip press. Two expanding rings plus a solid dot, so a tap is
// legible at a glance without a hand model in the frame.
// ---------------------------------------------------------------------------
export const TapDot: React.FC<{
  frame: number;
  tapAt: number;
  x: number;
  y: number;
}> = ({ frame, tapAt, x, y }) => {
  const t = frame - tapAt;
  if (t < 0 || t > 34) return null;
  const ring = (delay: number) => {
    const k = (t - delay) / 26;
    if (k < 0 || k > 1) return null;
    return {
      transform: `translate(-50%,-50%) scale(${0.4 + k * 1.9})`,
      opacity: (1 - k) * 0.55,
    };
  };
  const r1 = ring(0);
  const r2 = ring(8);
  return (
    <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'none' }}>
      {[r1, r2].map(
        (r, i) =>
          r && (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: 78,
                height: 78,
                borderRadius: '50%',
                border: `3px solid ${NAVY}`,
                ...r,
              }}
            />
          )
      )}
      <div
        style={{
          position: 'absolute',
          width: 34,
          height: 34,
          borderRadius: '50%',
          background: 'rgba(10,75,120,0.35)',
          transform: 'translate(-50%,-50%)',
          opacity: Math.max(0, 1 - t / 20),
        }}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// KeepUndoBar — the confirm strip under a voice edit. The edit has already
// landed in the field; this is what makes it reversible.
// ---------------------------------------------------------------------------
export const KeepUndoBar: React.FC<{ frame: number; showAt: number }> = ({
  frame,
  showAt,
}) => {
  const p = window_(frame, showAt, showAt + 100000, 10);
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        marginTop: 10,
        opacity: p,
        transform: `translateY(${(1 - p) * 12}px)`,
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '12px 0',
          borderRadius: 12,
          background: NAVY,
          color: '#fff',
          fontSize: 18,
          fontWeight: 700,
        }}
      >
        <Check size={20} color="#fff" strokeWidth={2.8} /> Keep
      </div>
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '12px 0',
          borderRadius: 12,
          border: `2px solid ${MUTED}`,
          color: MUTED,
          fontSize: 18,
          fontWeight: 700,
        }}
      >
        <Undo2 size={20} color={MUTED} strokeWidth={2.8} /> Undo
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// OfflineBanner + PendingCounter — the app's own offline affordances. The
// counter draining back to zero is the argument; the banner is just context.
// ---------------------------------------------------------------------------
export const OfflineBanner: React.FC<{
  frame: number;
  inAt: number;
  outAt: number;
}> = ({ frame, inAt, outAt }) => {
  const p = window_(frame, inAt, outAt, 8);
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${(1 - p) * -14}px)`,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: '#fef2f2',
        borderBottom: `1px solid ${RED}`,
        padding: '11px 20px',
        color: RED,
        fontSize: 17,
        fontWeight: 700,
      }}
    >
      <WifiOff size={20} color={RED} strokeWidth={2.6} />
      No satellite link
    </div>
  );
};

export const PendingCounter: React.FC<{
  frame: number;
  showAt: number;
  peak: number;
  drainAt: number;
  drainDur: number;
}> = ({ frame, showAt, peak, drainAt, drainDur }) => {
  if (frame < showAt) return null;
  const rising = countTo(frame, showAt, drainAt - showAt, peak);
  const draining = peak - countTo(frame, drainAt, drainDur, peak);
  const n = frame < drainAt ? rising : draining;
  const done = n === 0 && frame >= drainAt;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        background: done ? '#f0fdf4' : TINT,
        border: `1px solid ${done ? GREEN : BORDER}`,
        borderRadius: 12,
        padding: '12px 15px',
        marginTop: 12,
        fontSize: 17,
        fontWeight: 600,
        color: done ? GREEN : NAVY,
      }}
    >
      {done ? (
        <>
          <Check size={20} color={GREEN} strokeWidth={2.8} />
          All parts transcribed — nothing lost
        </>
      ) : (
        <>
          <Mic size={20} color={NAVY} strokeWidth={2.4} />
          {n} {n === 1 ? 'part' : 'parts'} held on the phone
        </>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SubtitledLine — a spoken line: the officer's own language large, the English
// translation beneath it. Never dub him; the two-language stack IS the argument.
// ---------------------------------------------------------------------------
export const SubtitledLine: React.FC<{
  frame: number;
  at: number;
  dur: number;
  tl: string;
  en: string;
  dim?: boolean;
}> = ({ frame, at, dur, tl, en, dim = false }) => {
  if (frame < at) return null;
  const shown = typed(tl, frame, at, dur);
  const done = typedDone(tl, frame, at, dur);
  return (
    <div style={{ marginBottom: 12, opacity: dim ? 0.45 : 1 }}>
      <div style={{ fontSize: 20, lineHeight: 1.35, color: INK, fontWeight: 600 }}>
        {shown}
        {!done && <Caret frame={frame} />}
      </div>
      {done && (
        <div style={{ fontSize: 16, lineHeight: 1.35, color: MUTED, marginTop: 3 }}>
          {en}
        </div>
      )}
    </div>
  );
};
