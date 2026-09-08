// InterviewSetupScreen — mirrors MarinaView.swift setup phase: "Select
// Languages:" with a Patient card and a Medical Officer card, then Start.
import React from 'react';
import { User, Stethoscope, Play, ChevronRight } from 'lucide-react';
import { PillButton } from '../components/ui';
import { NAVY, INK, MUTED, BORDER, TINT } from '../theme';

const LanguageCard: React.FC<{
  role: string;
  icon: React.ReactNode;
  native: string;
  english: string;
}> = ({ role, icon, native, english }) => (
  <div
    style={{
      border: `1px solid ${BORDER}`,
      borderRadius: 18,
      padding: '20px 20px',
      background: '#fff',
      marginBottom: 18,
      boxShadow: '0 4px 16px rgba(8,35,60,0.06)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 12,
          background: TINT,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>
      <span style={{ fontSize: 24, fontWeight: 800, color: INK }}>{role}</span>
    </div>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        border: `1px solid ${BORDER}`,
        borderRadius: 12,
        padding: '15px 16px',
      }}
    >
      <div>
        <div style={{ fontSize: 23, fontWeight: 700, color: INK }}>{native}</div>
        <div style={{ fontSize: 17, color: MUTED }}>{english}</div>
      </div>
      <ChevronRight size={24} color={MUTED} />
    </div>
  </div>
);

export const InterviewSetupScreen: React.FC = () => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '18px 26px' }}>
    <div style={{ fontSize: 26, fontWeight: 800, color: INK, marginBottom: 22 }}>
      Select Languages:
    </div>
    <LanguageCard
      role="Patient"
      icon={<User size={26} color={NAVY} />}
      native="Español"
      english="Spanish"
    />
    <LanguageCard
      role="Medical Officer"
      icon={<Stethoscope size={26} color={NAVY} />}
      native="English"
      english="English"
    />
    <div style={{ flex: 1 }} />
    <PillButton style={{ width: '100%' }}>
      <Play size={22} fill="#fff" color="#fff" /> Start
    </PillButton>
  </div>
);
