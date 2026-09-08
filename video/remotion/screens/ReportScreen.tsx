// ReportScreen — mirrors ReportView.swift: title "Medical Report", the 5
// category icon-tabs, and the Examination tab content (vital-signs grid +
// a section card with fill count). Every field looks editable.
import React from 'react';
import { User, FileText, Stethoscope, Pill, Activity, Sparkles } from 'lucide-react';
import { SectionCard } from '../components/ui';
import { NAVY, INK, MUTED, BORDER, FIELD, TINT, VITALS } from '../theme';

const TABS = [
  { key: 'patient', label: 'Patient', Icon: User },
  { key: 'problem', label: 'Problem', Icon: FileText },
  { key: 'exam', label: 'Examination', Icon: Stethoscope },
  { key: 'treatment', label: 'Treatment', Icon: Pill },
  { key: 'observation', label: 'Observation', Icon: Activity },
];

const VitalCell: React.FC<{ label: string; value: string; unit: string }> = ({
  label,
  value,
  unit,
}) => (
  <div style={{ background: FIELD, border: `1px solid ${BORDER}`, borderRadius: 12, padding: '12px 13px' }}>
    <div style={{ fontSize: 15, fontWeight: 600, color: MUTED }}>{label}</div>
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 4 }}>
      <span style={{ fontSize: 26, fontWeight: 800, color: INK }}>{value}</span>
      <span style={{ fontSize: 15, color: MUTED }}>{unit}</span>
    </div>
  </div>
);

export const ReportScreen: React.FC<{ active?: string }> = ({ active = 'exam' }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
    {/* nav title row with Improve icon */}
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '2px 24px 10px',
      }}
    >
      <span style={{ fontSize: 30, fontWeight: 800, color: INK }}>Medical Report</span>
      <Sparkles size={26} color={NAVY} />
    </div>

    {/* 5 icon tabs */}
    <div style={{ display: 'flex', gap: 6, padding: '0 16px 12px' }}>
      {TABS.map(({ key, label, Icon }) => {
        const on = key === active;
        return (
          <div
            key={key}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
              padding: '10px 0',
              borderRadius: 12,
              background: on ? NAVY : TINT,
            }}
          >
            <Icon size={22} color={on ? '#fff' : MUTED} strokeWidth={2.2} />
            <span style={{ fontSize: 13, fontWeight: 700, color: on ? '#fff' : MUTED }}>{label}</span>
          </div>
        );
      })}
    </div>

    <div style={{ flex: 1, overflow: 'hidden', padding: '4px 22px' }}>
      <SectionCard title="Vital Signs" filled={6} total={7}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          {VITALS.map((v) => (
            <VitalCell key={v.label} label={v.label} value={v.value} unit={v.unit} />
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Performed Actions" filled={1} total={2}>
        <div style={{ fontSize: 19, color: INK, lineHeight: 1.4 }}>
          Administered aspirin 300 mg, patient rested in recovery position…
        </div>
      </SectionCard>
    </div>
  </div>
);
