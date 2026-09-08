// InterviewChatScreen — mirrors MarinaView.swift interview phase: Skip Stage /
// "Stage n / 9" bar, assistant questions (officer language + italic patient
// translation + speaker icon), patient answers as blue user bubbles, mic.
import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Volume2, ChevronRight } from 'lucide-react';
import { AppHeader, MicButton } from '../components/ui';
import { reveal, slideUp } from '../components/anim';
import {
  NAVY,
  INK,
  MUTED,
  BORDER,
  PATIENT_BLUE,
  INTERVIEW_TURNS,
} from '../theme';

const AssistantBubble: React.FC<{ en: string; tr: string; appear: number; speaking: boolean }> = ({
  en,
  tr,
  appear,
  speaking,
}) => (
  <div style={{ opacity: appear, transform: slideUp(appear, 16), marginBottom: 16, maxWidth: '86%' }}>
    <div
      style={{
        background: '#f1f3f5',
        borderRadius: '4px 20px 20px 20px',
        padding: '15px 17px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 22, lineHeight: 1.35, color: INK, fontWeight: 600, flex: 1 }}>{en}</span>
        <Volume2 size={22} color={speaking ? NAVY : MUTED} strokeWidth={2.2} />
      </div>
      <div style={{ fontSize: 19, lineHeight: 1.35, color: MUTED, fontStyle: 'italic', marginTop: 8 }}>
        {tr}
      </div>
    </div>
  </div>
);

const UserBubble: React.FC<{ en: string; tr: string; appear: number }> = ({ en, tr, appear }) => (
  <div
    style={{
      opacity: appear,
      transform: slideUp(appear, 16),
      marginBottom: 16,
      maxWidth: '86%',
      marginLeft: 'auto',
    }}
  >
    <div
      style={{
        background: PATIENT_BLUE,
        borderRadius: '20px 4px 20px 20px',
        padding: '15px 17px',
        color: '#fff',
      }}
    >
      <div style={{ fontSize: 22, lineHeight: 1.35, fontWeight: 600 }}>{tr}</div>
      <div style={{ fontSize: 19, lineHeight: 1.35, opacity: 0.85, fontStyle: 'italic', marginTop: 8 }}>
        {en}
      </div>
    </div>
  </div>
);

export const InterviewChatScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  // stagger the three turns in across the scene
  const delays = [12, 130, 270];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <AppHeader
        right={
          <span style={{ fontSize: 18, fontWeight: 800, color: NAVY }}>Stage 3 / 9</span>
        }
      />
      {/* skip-stage / stage row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 22px',
          borderBottom: `1px solid ${BORDER}`,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 17, fontWeight: 700, color: MUTED }}>
          Skip Stage <ChevronRight size={18} color={MUTED} />
        </span>
        <span style={{ fontSize: 16, color: MUTED }}>Associated Symptoms</span>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', padding: '18px 22px' }}>
        <AssistantBubble
          en={INTERVIEW_TURNS[0].en}
          tr={INTERVIEW_TURNS[0].tr}
          appear={reveal(frame, fps, delays[0])}
          speaking={frame > delays[0] && frame < delays[1]}
        />
        <UserBubble
          en={INTERVIEW_TURNS[1].en}
          tr={INTERVIEW_TURNS[1].tr}
          appear={reveal(frame, fps, delays[1])}
        />
        <AssistantBubble
          en={INTERVIEW_TURNS[2].en}
          tr={INTERVIEW_TURNS[2].tr}
          appear={reveal(frame, fps, delays[2])}
          speaking={frame > delays[2]}
        />
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', padding: '6px 0 22px' }}>
        <MicButton recording={frame % 60 > 30} size={100} />
      </div>
    </div>
  );
};
