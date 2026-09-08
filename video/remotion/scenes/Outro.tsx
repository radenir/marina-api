// Outro — the closing brand card: slowly rotating logo, name, closing tagline,
// and the marinahealth.eu call-to-action.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Logo } from '../components/Logo';
import { pop, reveal, slideUp, scaleIn } from '../components/anim';
import { NAVY_BG, FONT_FAMILY } from '../theme';

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoIn = pop(frame, fps, 4);
  const spin = interpolate(frame, [0, 150], [0, 16]);
  const t1 = reveal(frame, fps, 22);
  const t2 = reveal(frame, fps, 44);
  const cta = pop(frame, fps, 70);

  return (
    <AbsoluteFill
      style={{
        background: NAVY_BG,
        fontFamily: FONT_FAMILY,
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
      }}
    >
      <div
        style={{
          opacity: logoIn,
          transform: `${scaleIn(logoIn, 0.4)} rotate(${spin}deg)`,
          filter: 'brightness(0) invert(1)',
        }}
      >
        <Logo size={168} />
      </div>

      <div
        style={{
          opacity: t1,
          transform: slideUp(t1, 20),
          fontSize: 96,
          fontWeight: 800,
          letterSpacing: -2,
          marginTop: 26,
        }}
      >
        Marina
      </div>
      <div
        style={{
          opacity: t2,
          transform: slideUp(t2, 18),
          fontSize: 36,
          fontWeight: 500,
          color: 'rgba(255,255,255,0.85)',
          marginTop: 8,
        }}
      >
        Maritime medical reporting, in any language.
      </div>

      <div
        style={{
          opacity: cta,
          transform: scaleIn(cta, 0.7),
          marginTop: 40,
          padding: '18px 40px',
          borderRadius: 999,
          background: '#fff',
          color: '#0a4b78',
          fontSize: 34,
          fontWeight: 800,
        }}
      >
        marinahealth.eu
      </div>
    </AbsoluteFill>
  );
};
