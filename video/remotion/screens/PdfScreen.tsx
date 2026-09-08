// PdfScreen — the final output: a mini A4 clinical report preview (mirroring
// public/templates/seafarer-medical-report.html header + section cards) with
// the Email PDF / Download PDF actions from ReportView.swift.
import React from 'react';
import { Mail, Download } from 'lucide-react';
import { Logo } from '../components/Logo';
import { PillButton } from '../components/ui';
import { NAVY, INK, MUTED, BORDER, TINT, TINT_LINE } from '../theme';

const PageSection: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({
  n,
  title,
  children,
}) => (
  <div style={{ border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: TINT,
        borderBottom: `1px solid ${TINT_LINE}`,
        padding: '6px 10px',
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: NAVY,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: NAVY,
          color: '#fff',
          fontSize: 11,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {n}
      </span>
      {title}
    </div>
    <div style={{ padding: '8px 10px' }}>{children}</div>
  </div>
);

const Kv: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '2px 0' }}>
    <span style={{ color: MUTED }}>{k}</span>
    <span style={{ color: INK, fontWeight: 600 }}>{v}</span>
  </div>
);

export const PdfScreen: React.FC = () => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#eaeef3' }}>
    <div style={{ flex: 1, overflow: 'hidden', padding: '22px 26px 0' }}>
      {/* the A4 sheet */}
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          boxShadow: '0 10px 30px rgba(15,23,42,0.14)',
          padding: '22px 22px',
          height: '100%',
        }}
      >
        {/* header */}
        <div style={{ textAlign: 'center', borderBottom: `2px solid ${NAVY}`, paddingBottom: 12, marginBottom: 14 }}>
          <Logo size={46} style={{ margin: '0 auto 4px' }} />
          <div style={{ fontSize: 19, fontWeight: 700, color: NAVY }}>Marina Health</div>
          <div style={{ fontSize: 12, letterSpacing: 2, color: MUTED, fontWeight: 700, marginTop: 3 }}>
            SEAFARER MEDICAL REPORT
          </div>
        </div>

        <PageSection n={1} title="Patient & Vessel">
          <Kv k="Patient" v="Male · ~40 yrs" />
          <Kv k="Vessel" v="MV Pacific Star (ABCD1)" />
          <Kv k="Position" v="27°N 15°W · Las Palmas 86 nm" />
        </PageSection>
        <PageSection n={2} title="Problem">
          <div style={{ fontSize: 14, color: INK, lineHeight: 1.4 }}>
            Severe chest pain radiating to the left arm, onset 2 h ago, with dyspnoea and diaphoresis.
          </div>
        </PageSection>
        <PageSection n={3} title="Examination">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4 }}>
            <Kv k="HR" v="104" />
            <Kv k="BP" v="148/92" />
            <Kv k="SpO₂" v="95%" />
            <Kv k="RR" v="22" />
            <Kv k="Temp" v="37.1°" />
            <Kv k="AVPU" v="Alert" />
          </div>
        </PageSection>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 14, padding: '18px 26px 24px', background: '#fff' }}>
      <PillButton filled={false} style={{ flex: 1 }}>
        <Mail size={20} /> Email PDF
      </PillButton>
      <PillButton style={{ flex: 1 }}>
        <Download size={20} color="#fff" /> Download PDF
      </PillButton>
    </div>
  </div>
);
