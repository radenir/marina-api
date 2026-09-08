// TranslatorScreen — mirrors TranslatorView.swift: labelled bilingual bubbles
// ("Patient" / "Medical Officer") each showing original + italic translation,
// with two language-coded mic buttons at the bottom.
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { Volume2 } from 'lucide-react';
import { AppHeader, MicButton } from '../components/ui';
import { reveal, slideUp } from '../components/anim';
import { INK, MUTED, PATIENT_BLUE, OFFICER_GREEN } from '../theme';

const Turn: React.FC<{
  who: string;
  color: string;
  original: string;
  translation: string;
  align: 'left' | 'right';
  appear: number;
}> = ({ who, color, original, translation, align, appear }) => (
  <div
    style={{
      opacity: appear,
      transform: slideUp(appear, 16),
      marginBottom: 20,
      maxWidth: '88%',
      marginLeft: align === 'right' ? 'auto' : 0,
    }}
  >
    <div style={{ fontSize: 16, fontWeight: 800, color, marginBottom: 6, textAlign: align }}>
      {who}
    </div>
    <div
      style={{
        background: '#fff',
        border: `1.5px solid ${color}`,
        borderRadius: 18,
        padding: '15px 17px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 22, fontWeight: 600, color: INK, flex: 1, lineHeight: 1.35 }}>
          {original}
        </span>
        <Volume2 size={22} color={color} strokeWidth={2.2} />
      </div>
      <div style={{ fontSize: 19, fontStyle: 'italic', color: MUTED, marginTop: 8, lineHeight: 1.35 }}>
        {translation}
      </div>
    </div>
  </div>
);

export const TranslatorScreen: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <AppHeader right={<span style={{ fontSize: 17, fontWeight: 700, color: MUTED }}>ES ⇄ EN</span>} />

      <div style={{ flex: 1, overflow: 'hidden', padding: '22px 22px' }}>
        <Turn
          who="Patient"
          color={PATIENT_BLUE}
          original="Me duele mucho el estómago desde anoche."
          translation="My stomach has hurt badly since last night."
          align="left"
          appear={reveal(frame, fps, 12)}
        />
        <Turn
          who="Medical Officer"
          color={OFFICER_GREEN}
          original="Do you feel nauseous, or have you vomited?"
          translation="¿Tiene náuseas o ha vomitado?"
          align="right"
          appear={reveal(frame, fps, 90)}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '6px 40px 24px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <MicButton recording={frame % 80 < 40} size={92} />
          <span style={{ fontSize: 18, fontWeight: 800, color: PATIENT_BLUE }}>ES</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: '50%',
              background: `linear-gradient(160deg, #10b981 0%, ${OFFICER_GREEN} 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 12px 30px rgba(5,150,105,0.3)',
            }}
          >
            <span style={{ color: '#fff', fontSize: 30 }}>🎙</span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, color: OFFICER_GREEN }}>EN</span>
        </div>
      </div>
    </div>
  );
};
