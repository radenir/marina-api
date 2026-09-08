// StepScene — the shared layout for every walkthrough step: a light app-style
// background, a left caption column, and a right phone that eases in and gently
// bobs. Individual step scenes just supply caption text + the phone screen.
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import { Caption } from '../components/Caption';
import { PhoneFrame } from '../components/PhoneFrame';
import { DeviceShot } from '../components/DeviceShot';
import { Logo } from '../components/Logo';
import { reveal } from '../components/anim';
import { SCENE_BG, NAVY, FONT_FAMILY } from '../theme';

const PHONE_SCALE = 0.9;

export const StepScene: React.FC<{
  step: number;
  kicker: string;
  title: React.ReactNode;
  body: React.ReactNode;
  // Either a rendered mockup screen…
  screen?: React.ReactNode;
  phoneTitle?: string;
  activeTab?: string;
  phoneBg?: string;
  // …or a real simulator screenshot (public/shots/*.png) shown full-bleed.
  shot?: string;
}> = ({ step, kicker, title, body, screen, phoneTitle, activeTab, phoneBg, shot }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const phoneIn = reveal(frame, fps, 4);
  const bob = Math.sin(frame / 26) * 8;
  const scale = interpolate(phoneIn, [0, 1], [0.86, PHONE_SCALE]);

  return (
    <AbsoluteFill style={{ background: SCENE_BG, fontFamily: FONT_FAMILY }}>
      {/* soft brand glow */}
      <div
        style={{
          position: 'absolute',
          right: -180,
          top: -160,
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(13,110,175,0.16) 0%, rgba(13,110,175,0) 62%)`,
        }}
      />
      {/* faint logo watermark */}
      <Logo
        size={620}
        style={{
          position: 'absolute',
          left: -140,
          bottom: -160,
          opacity: 0.05,
        }}
      />

      {/* caption column */}
      <div
        style={{
          position: 'absolute',
          left: 130,
          top: 0,
          height: '100%',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Caption step={step} kicker={kicker} title={title} body={body} />
      </div>

      {/* phone */}
      <div
        style={{
          position: 'absolute',
          right: 150,
          top: '50%',
          transform: `translateY(calc(-50% + ${bob}px)) scale(${scale})`,
          opacity: phoneIn,
        }}
      >
        {shot ? (
          <DeviceShot src={shot} />
        ) : (
          <PhoneFrame title={phoneTitle} activeTab={activeTab} bg={phoneBg}>
            {screen}
          </PhoneFrame>
        )}
      </div>
    </AbsoluteFill>
  );
};
