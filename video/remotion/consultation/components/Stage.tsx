// ---------------------------------------------------------------------------
// Stage.tsx — the shared layout for every scene of the consultation film.
//
// Deliberately NOT ../scenes/StepScene: that one puts a static screenshot on the
// right and a wall of text on the left, which is the correct shape for a slide
// and the wrong shape here. In this film the phone is the subject, so it sits
// left-of-centre and large, and the copy is reduced to short callouts that
// arrive one at a time beside whatever is happening on screen. The viewer should
// be watching the app, not reading a paragraph.
// ---------------------------------------------------------------------------
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { PhoneFrame } from '../../components/PhoneFrame';
import { Logo } from '../../components/Logo';
import { reveal, slideUp } from '../../components/anim';
import { window_ } from '../motion';
import { SCENE_BG, NAVY, INK, MUTED, FONT_FAMILY, TINT } from '../../theme';

const PHONE_SCALE = 0.855;

// ---------------------------------------------------------------------------
// Callout — one short claim, timed to the beat on screen that proves it.
// ---------------------------------------------------------------------------
export const Callout: React.FC<{
  frame: number;
  inAt: number;
  outAt?: number;
  title: string;
  body?: string;
  accent?: boolean;
}> = ({ frame, inAt, outAt = 100000, title, body, accent = false }) => {
  const p = window_(frame, inAt, outAt, 12);
  if (p <= 0.001) return null;
  return (
    <div
      style={{
        opacity: p,
        transform: `translateY(${(1 - p) * 26}px)`,
        background: accent ? NAVY : 'rgba(255,255,255,0.86)',
        border: `1px solid ${accent ? NAVY : 'rgba(10,75,120,0.14)'}`,
        borderRadius: 20,
        padding: body ? '24px 30px' : '20px 30px',
        marginBottom: 18,
        boxShadow: '0 18px 44px rgba(8,35,60,0.10)',
        maxWidth: 880,
      }}
    >
      <div
        style={{
          fontSize: 40,
          fontWeight: 800,
          letterSpacing: -0.6,
          lineHeight: 1.18,
          color: accent ? '#fff' : NAVY,
        }}
      >
        {title}
      </div>
      {body && (
        <div
          style={{
            fontSize: 25,
            lineHeight: 1.45,
            marginTop: 10,
            color: accent ? 'rgba(255,255,255,0.86)' : MUTED,
          }}
        >
          {body}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ProofRow — the three verifiable numbers, used once, on the scene that earns
// them. Kept small: they support the demo, they don't replace it.
// ---------------------------------------------------------------------------
export const ProofRow: React.FC<{
  frame: number;
  inAt: number;
  items: { n: string; label: string }[];
}> = ({ frame, inAt, items }) => (
  <div style={{ display: 'flex', gap: 16 }}>
    {items.map((it, i) => {
      const p = window_(frame, inAt + i * 7, 100000, 10);
      return (
        <div
          key={it.label}
          style={{
            opacity: p,
            transform: `translateY(${(1 - p) * 16}px)`,
            background: TINT,
            border: `1px solid rgba(10,75,120,0.14)`,
            borderRadius: 16,
            padding: '16px 24px',
          }}
        >
          <div style={{ fontSize: 44, fontWeight: 800, color: NAVY, lineHeight: 1 }}>
            {it.n}
          </div>
          <div style={{ fontSize: 19, color: MUTED, marginTop: 6, fontWeight: 600 }}>
            {it.label}
          </div>
        </div>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Stage — background, watermark, the phone, and a right-hand callout column.
// ---------------------------------------------------------------------------
export const Stage: React.FC<{
  /// Large nav title drawn by PhoneFrame ("Note Taker", "Medical Report", …).
  phoneTitle?: string;
  /// Which bottom tab is lit. Omit entirely for the report, which is a sheet.
  activeTab?: string;
  /// The animated app screen.
  children: React.ReactNode;
  /// Callouts, already timed by the caller.
  side?: React.ReactNode;
  /// Overlays drawn on top of the phone (tap ripples, fullscreen video).
  overlay?: React.ReactNode;
}> = ({ phoneTitle, activeTab, children, side, overlay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entry = reveal(frame, fps, 3);
  // A far slower, shallower drift than the walkthrough's bob — at this size a
  // 8px sine reads as the phone wobbling rather than floating, and it fights the
  // motion happening inside the screen.
  const drift = Math.sin(frame / 58) * 3.5;

  return (
    <AbsoluteFill style={{ background: SCENE_BG, fontFamily: FONT_FAMILY }}>
      <div
        style={{
          position: 'absolute',
          right: -220,
          top: -200,
          width: 1000,
          height: 1000,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(13,110,175,0.15) 0%, rgba(13,110,175,0) 62%)',
        }}
      />
      <Logo
        size={640}
        style={{ position: 'absolute', left: -170, bottom: -190, opacity: 0.045 }}
      />

      {/* phone */}
      <div
        style={{
          position: 'absolute',
          left: 148,
          top: '50%',
          transform: `translateY(calc(-50% + ${drift}px)) scale(${PHONE_SCALE})`,
          transformOrigin: 'center',
          opacity: entry,
        }}
      >
        <PhoneFrame title={phoneTitle} activeTab={activeTab}>
          {children}
        </PhoneFrame>
        {overlay}
      </div>

      {/* callout column */}
      <div
        style={{
          position: 'absolute',
          left: 760,
          top: 0,
          width: 1010,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          paddingRight: 60,
        }}
      >
        {side}
      </div>
    </AbsoluteFill>
  );
};
