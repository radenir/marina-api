// ImproveScreen — mirrors ReportView.swift ImproveSheet + template picker:
// AI-suggested follow-up questions (some with a "Watch video" demo), and the
// PDF template selector (Marina vs Denmark / Radio Medical).
import React from 'react';
import { Sparkles, Play, Mic, Check } from 'lucide-react';
import { NAVY, INK, MUTED, BORDER, TINT, FIELD, FOLLOWUPS } from '../theme';

const QuestionRow: React.FC<{ q: string; video?: boolean; index: number }> = ({
  q,
  video,
  index,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      border: `1px solid ${BORDER}`,
      borderRadius: 14,
      padding: '15px 16px',
      marginBottom: 12,
      background: '#fff',
    }}
  >
    <span
      style={{
        width: 30,
        height: 30,
        flex: 'none',
        borderRadius: '50%',
        background: TINT,
        color: NAVY,
        fontSize: 16,
        fontWeight: 800,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {index}
    </span>
    <span style={{ fontSize: 20, color: INK, fontWeight: 600, flex: 1, lineHeight: 1.3 }}>{q}</span>
    {video ? (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 15,
          fontWeight: 700,
          color: NAVY,
          background: 'rgba(10,75,120,0.10)',
          padding: '6px 11px',
          borderRadius: 999,
          flex: 'none',
        }}
      >
        <Play size={15} fill={NAVY} color={NAVY} /> Watch video
      </span>
    ) : (
      <Mic size={22} color={MUTED} />
    )}
  </div>
);

const TemplateOption: React.FC<{ label: string; sub: string; flag: string; on?: boolean }> = ({
  label,
  sub,
  flag,
  on,
}) => (
  <div
    style={{
      flex: 1,
      border: `2px solid ${on ? NAVY : BORDER}`,
      borderRadius: 14,
      padding: '13px 15px',
      background: on ? 'rgba(10,75,120,0.06)' : FIELD,
      position: 'relative',
    }}
  >
    <div style={{ fontSize: 26, marginBottom: 4 }}>{flag}</div>
    <div style={{ fontSize: 20, fontWeight: 800, color: INK }}>{label}</div>
    <div style={{ fontSize: 15, color: MUTED }}>{sub}</div>
    {on && (
      <span
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: NAVY,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Check size={16} color="#fff" strokeWidth={3} />
      </span>
    )}
  </div>
);

export const ImproveScreen: React.FC = () => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '10px 24px' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <Sparkles size={26} color={NAVY} />
      <span style={{ fontSize: 27, fontWeight: 800, color: INK }}>Improve Report</span>
    </div>
    <div style={{ fontSize: 18, color: MUTED, marginBottom: 18 }}>
      Suggested follow-up questions
    </div>

    <QuestionRow index={1} q={FOLLOWUPS[0]} />
    <QuestionRow index={2} q={FOLLOWUPS[1]} />
    <QuestionRow index={3} q="Perform a focused abdominal examination." video />

    <div style={{ flex: 1 }} />

    <div style={{ fontSize: 17, fontWeight: 700, color: MUTED, letterSpacing: 1, marginBottom: 10 }}>
      TEMPLATE
    </div>
    <div style={{ display: 'flex', gap: 12 }}>
      <TemplateOption label="Marina" sub="Seafarer report" flag="⚓️" on />
      <TemplateOption label="Denmark" sub="Radio Medical" flag="🇩🇰" />
    </div>
  </div>
);
