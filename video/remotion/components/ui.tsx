// Small in-phone UI atoms reused across screens: app header row, field rows,
// section cards, pill buttons, mic button, status dots, completion badges.
import React from 'react';
import { Mic } from 'lucide-react';
import { Logo } from './Logo';
import {
  NAVY,
  INK,
  MUTED,
  BORDER,
  FIELD,
  TINT,
  GREEN,
  AMBER,
  RED,
  NAVY_LIGHT,
} from '../theme';

// The compact in-app header used inside chat/translator screens.
export const AppHeader: React.FC<{ right?: React.ReactNode }> = ({ right }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '6px 22px 12px',
      borderBottom: `1px solid ${BORDER}`,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Logo size={30} />
      <span style={{ fontSize: 24, fontWeight: 800, color: NAVY }}>Marina</span>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {right}
    </div>
  </div>
);

export const OnlineDot: React.FC = () => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: GREEN, fontSize: 16, fontWeight: 600 }}>
    <span style={{ width: 10, height: 10, borderRadius: '50%', background: GREEN }} />
    Online
  </span>
);

// A labelled read-only field row (used in report/profile screens).
export const Field: React.FC<{ label: string; value?: string; grow?: boolean }> = ({
  label,
  value,
}) => (
  <div style={{ marginBottom: 12 }}>
    <div style={{ fontSize: 15, fontWeight: 600, color: MUTED, marginBottom: 5 }}>{label}</div>
    <div
      style={{
        background: FIELD,
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: '13px 15px',
        fontSize: 20,
        color: value ? INK : '#b6c2cf',
        minHeight: 24,
      }}
    >
      {value || '—'}
    </div>
  </div>
);

// A collapsible-looking section card header with a filled/total badge.
export const SectionCard: React.FC<{
  title: string;
  filled: number;
  total: number;
  children?: React.ReactNode;
}> = ({ title, filled, total, children }) => {
  const ratio = filled / total;
  const color = filled === 0 ? RED : ratio >= 1 ? GREEN : AMBER;
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        borderRadius: 16,
        overflow: 'hidden',
        marginBottom: 14,
        background: '#fff',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          background: TINT,
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 700, color: NAVY }}>{title}</span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: '#fff',
            background: color,
            borderRadius: 999,
            padding: '4px 12px',
          }}
        >
          {filled}/{total}
        </span>
      </div>
      {children && <div style={{ padding: '12px 16px' }}>{children}</div>}
    </div>
  );
};

export const PillButton: React.FC<{
  children: React.ReactNode;
  filled?: boolean;
  color?: string;
  style?: React.CSSProperties;
}> = ({ children, filled = true, color = NAVY, style }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      padding: '15px 22px',
      borderRadius: 14,
      fontSize: 21,
      fontWeight: 700,
      background: filled ? color : 'transparent',
      color: filled ? '#fff' : color,
      border: `2px solid ${color}`,
      ...style,
    }}
  >
    {children}
  </div>
);

// The big circular record button.
export const MicButton: React.FC<{ recording?: boolean; size?: number }> = ({
  recording = false,
  size = 118,
}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: recording
        ? RED
        : `linear-gradient(160deg, ${NAVY_LIGHT} 0%, ${NAVY} 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxShadow: recording
        ? '0 0 0 12px rgba(239,68,68,0.18)'
        : '0 14px 34px rgba(10,75,120,0.35)',
    }}
  >
    {recording ? (
      <div style={{ width: size * 0.32, height: size * 0.32, borderRadius: 8, background: '#fff' }} />
    ) : (
      <Mic size={size * 0.42} color="#fff" strokeWidth={2.2} />
    )}
  </div>
);
