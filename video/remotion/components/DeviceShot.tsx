// DeviceShot — an iPhone bezel wrapping a REAL simulator screenshot shown
// full-bleed. The screenshot already contains the status bar, dynamic island,
// nav title and tab bar, so no app chrome is drawn here — this is literally the
// app. Screenshots are captured from the booted simulator into public/shots/.
import React from 'react';
import { Img, staticFile } from 'remotion';

// iPhone 17 Pro capture is 1206×2622 (ratio 0.4600).
export const SHOT_W = 524;
export const SHOT_H = Math.round((SHOT_W * 2622) / 1206); // 1139
const BEZEL = 11;
const RADIUS = 56;

export const DeviceShot: React.FC<{ src: string; style?: React.CSSProperties }> = ({
  src,
  style,
}) => (
  <div
    style={{
      width: SHOT_W + BEZEL * 2,
      height: SHOT_H + BEZEL * 2,
      borderRadius: RADIUS + BEZEL,
      background: '#0b1f30',
      boxShadow: '0 40px 90px rgba(8,35,60,0.35), 0 8px 24px rgba(8,35,60,0.25)',
      padding: BEZEL,
      ...style,
    }}
  >
    <Img
      src={staticFile(src)}
      style={{
        width: SHOT_W,
        height: SHOT_H,
        objectFit: 'cover',
        borderRadius: RADIUS,
        display: 'block',
      }}
    />
  </div>
);
