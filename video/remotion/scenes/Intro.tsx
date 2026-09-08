// Intro — the opening brand card: logo pops in over the navy gradient, then the
// name, tagline and one-line explanation of what Marina is.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { Logo } from '../components/Logo';
import { pop, reveal, slideUp, scaleIn } from '../components/anim';
import { NAVY_BG, FONT_FAMILY } from '../theme';

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoIn = pop(frame, fps, 6);
  const t1 = reveal(frame, fps, 24);
  const t2 = reveal(frame, fps, 40);
  const t3 = reveal(frame, fps, 66);

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
      {/* concentric rings */}
      {[520, 760, 1040].map((d, i) => (
        <div
          key={d}
          style={{
            position: 'absolute',
            width: d,
            height: d,
            borderRadius: '50%',
            border: '1px solid rgba(255,255,255,0.09)',
            opacity: reveal(frame, fps, 4 + i * 4),
          }}
        />
      ))}

      <div style={{ opacity: logoIn, transform: scaleIn(logoIn, 0.4), filter: 'brightness(0) invert(1)' }}>
        <Logo size={190} />
      </div>

      <div
        style={{
          opacity: t1,
          transform: slideUp(t1, 22),
          fontSize: 108,
          fontWeight: 800,
          letterSpacing: -3,
          marginTop: 28,
        }}
      >
        Marina
      </div>
      <div
        style={{
          opacity: t2,
          transform: slideUp(t2, 20),
          fontSize: 38,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.9)',
          marginTop: 6,
        }}
      >
        Maritime Medical Incident Reporting
      </div>
      <div
        style={{
          opacity: t3,
          transform: slideUp(t3, 20),
          fontSize: 30,
          fontWeight: 400,
          color: 'rgba(255,255,255,0.72)',
          marginTop: 26,
          maxWidth: 1120,
          textAlign: 'center',
          lineHeight: 1.4,
        }}
      >
        When a crew member falls ill at sea with no doctor aboard, Marina turns an
        officer’s words into a clinical report for a doctor onshore.
      </div>
    </AbsoluteFill>
  );
};
