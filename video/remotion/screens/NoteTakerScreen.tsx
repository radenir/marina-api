// NoteTakerScreen — mirrors NoteTakerView.swift recording state: pulsing REC
// dot + timer, a live waveform, the running transcript, and the live report
// sections building up (LiveReportView) with color-coded fill counts.
import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { AppHeader, SectionCard, MicButton } from '../components/ui';
import { NAVY, INK, MUTED, RED, LIVE_TRANSCRIPT, REPORT_SECTIONS } from '../theme';

// A live audio waveform of 40 bars driven by the frame.
const Waveform: React.FC = () => {
  const frame = useCurrentFrame();
  const bars = 40;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, height: 54 }}>
      {Array.from({ length: bars }).map((_, i) => {
        const h =
          14 +
          Math.abs(Math.sin(frame / 5 + i * 0.7)) * 26 +
          Math.abs(Math.sin(frame / 3.2 + i)) * 12;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              height: h,
              borderRadius: 3,
              background: NAVY,
              opacity: 0.55 + (h / 52) * 0.45,
            }}
          />
        );
      })}
    </div>
  );
};

export const NoteTakerScreen: React.FC<{ transcriptWords?: number }> = ({
  transcriptWords = 999,
}) => {
  const frame = useCurrentFrame();
  const pulse = 0.5 + 0.5 * Math.abs(Math.sin(frame / 10));
  const secs = Math.floor(frame / 30) + 12;
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');

  // reveal transcript words progressively
  const words = LIVE_TRANSCRIPT.split(' ');
  const shown = Math.min(words.length, transcriptWords);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <AppHeader
        right={
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              color: RED,
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: RED,
                opacity: pulse,
              }}
            />
            {mm}:{ss}
          </span>
        }
      />

      <div style={{ padding: '16px 22px 0' }}>
        <Waveform />
        <div
          style={{
            marginTop: 14,
            fontSize: 20,
            lineHeight: 1.4,
            color: INK,
            background: '#f5f8fb',
            borderRadius: 14,
            padding: '14px 16px',
            minHeight: 96,
          }}
        >
          {words.slice(0, shown).join(' ')}
          <span style={{ color: NAVY, opacity: pulse }}> ▌</span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 22px 8px',
        }}
      >
        <span style={{ fontSize: 20, fontWeight: 800, color: INK }}>Live report</span>
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: NAVY,
            background: 'rgba(10,75,120,0.10)',
            padding: '5px 12px',
            borderRadius: 999,
          }}
        >
          Auto-refresh ⟳
        </span>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: '0 22px' }}>
        {REPORT_SECTIONS.map((s) => (
          <SectionCard key={s.label} title={s.label} filled={s.filled} total={s.total} />
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 30,
          padding: '10px 0 20px',
        }}
      >
        <span style={{ fontSize: 19, fontWeight: 700, color: MUTED }}>Pause</span>
        <MicButton recording size={92} />
        <span style={{ fontSize: 19, fontWeight: 700, color: RED }}>Stop</span>
      </div>
    </div>
  );
};
