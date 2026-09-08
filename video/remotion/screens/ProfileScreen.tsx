// ProfileScreen — mirrors ProfileView.swift: the vessel details form whose
// values pre-fill every report, plus the "Use my location" → nearest-port chip
// that represents the GPS feature.
import React from 'react';
import { MapPin } from 'lucide-react';
import { Field, PillButton } from '../components/ui';
import { NAVY, INK, MUTED, GREEN } from '../theme';

export const ProfileScreen: React.FC = () => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 24px 0' }}>
    <div style={{ fontSize: 17, fontWeight: 700, color: MUTED, letterSpacing: 1, margin: '4px 0 12px' }}>
      VESSEL
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
      <Field label="Ship name" value="MV Pacific Star" />
      <Field label="Call sign" value="ABCD1" />
      <Field label="Satellite phone" value="+870 776 210" />
      <Field label="Medicine chest" value="A" />
      <Field label="Cruise speed (knots)" value="15" />
      <Field label="Company" value="Pacific Lines" />
    </div>

    <div
      style={{
        marginTop: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(5,150,105,0.08)',
        border: `1px solid rgba(5,150,105,0.35)`,
        borderRadius: 14,
        padding: '14px 16px',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 19, fontWeight: 700, color: GREEN }}>
        <MapPin size={22} color={GREEN} /> Use my location
      </span>
      <span style={{ fontSize: 18, color: INK, fontWeight: 600 }}>Nearest: Las Palmas · 86 nm</span>
    </div>

    <div style={{ fontSize: 18, color: MUTED, lineHeight: 1.35, margin: '18px 2px 22px' }}>
      We’ll use these to pre-fill your vessel info on every report.
    </div>

    <PillButton style={{ width: '100%' }}>Save</PillButton>
  </div>
);
