// Caption — the left-hand text column that titles each step of the tour.
// Reveals its lines on staggered springs, matching the ad's motion language.
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { NAVY, INK, MUTED, FONT_FAMILY } from '../theme';
import { reveal, slideUp } from './anim';

export const Caption: React.FC<{
  step: number;
  kicker: string;
  title: React.ReactNode;
  body: React.ReactNode;
  startDelay?: number;
}> = ({ step, kicker, title, body, startDelay = 6 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const a1 = reveal(frame, fps, startDelay);
  const a2 = reveal(frame, fps, startDelay + 10);
  const a3 = reveal(frame, fps, startDelay + 22);

  return (
    <div style={{ width: 820, fontFamily: FONT_FAMILY }}>
      {/* step pill */}
      <div style={{ opacity: a1, transform: slideUp(a1, 20) }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            padding: '10px 20px',
            borderRadius: 999,
            background: 'rgba(10,75,120,0.10)',
            color: NAVY,
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: 0.5,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: '50%',
              background: NAVY,
              color: '#fff',
              fontSize: 20,
              fontWeight: 800,
            }}
          >
            {step}
          </span>
          {kicker}
        </div>
      </div>

      {/* title */}
      <div
        style={{
          opacity: a2,
          transform: slideUp(a2, 26),
          fontSize: 76,
          fontWeight: 800,
          color: INK,
          letterSpacing: -2,
          lineHeight: 1.02,
          margin: '28px 0 26px',
        }}
      >
        {title}
      </div>

      {/* body */}
      <div
        style={{
          opacity: a3,
          transform: slideUp(a3, 26),
          fontSize: 34,
          fontWeight: 500,
          color: MUTED,
          lineHeight: 1.4,
          maxWidth: 720,
        }}
      >
        {body}
      </div>
    </div>
  );
};
