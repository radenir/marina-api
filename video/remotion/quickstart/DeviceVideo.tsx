// DeviceVideo — an iPhone bezel wrapping a REAL screen recording of the app,
// the moving-image sibling of components/DeviceShot. The clip already contains
// the status bar, dynamic island, nav title and tab bar, so no chrome is drawn
// here: this is literally the app, filmed. Clips live in public/clips/ and are
// captured by MarinaUITests/QuickstartFilmTests via video/scripts/record-demo.sh.
import React from 'react';
import { OffthreadVideo, staticFile } from 'remotion';

// iPhone 17 Pro capture is 1206×2622 (ratio 0.4600). Match DeviceShot's sizing
// so the phone is the same size whether a beat uses a still or a clip.
export const SHOT_W = 524;
export const SHOT_H = Math.round((SHOT_W * 2622) / 1206); // 1139
const BEZEL = 11;
const RADIUS = 56;

export const DeviceVideo: React.FC<{
  /// Path under public/, e.g. 'clips/qs-profile.mp4'.
  src: string;
  /// Seconds into the clip to start — skips dead time at the head of a capture.
  startFrom?: number;
  /// Playback rate; a raw take paced for a camera can be nudged faster.
  playbackRate?: number;
  style?: React.CSSProperties;
}> = ({ src, startFrom = 0, playbackRate = 1, style }) => (
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
    <div
      style={{
        width: SHOT_W,
        height: SHOT_H,
        borderRadius: RADIUS,
        overflow: 'hidden',
      }}
    >
      <OffthreadVideo
        src={staticFile(src)}
        startFrom={startFrom > 0 ? Math.round(startFrom * 30) : undefined}
        playbackRate={playbackRate}
        muted
        style={{
          width: SHOT_W,
          height: SHOT_H,
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </div>
  </div>
);
