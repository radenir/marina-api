// Shared animation helpers — the two signature motions from the marina-ad.
import { spring, interpolate } from 'remotion';

// Gentle critically-damped reveal (no overshoot) — for text/UI element entrances.
export const reveal = (frame: number, fps: number, delay = 0) =>
  spring({ frame: frame - delay, fps, config: { damping: 200 } });

// Bouncy "pop" — for brand marks and cards that should feel energetic.
export const pop = (frame: number, fps: number, delay = 0) =>
  spring({
    frame: frame - delay,
    fps,
    config: { damping: 11, stiffness: 110, mass: 0.6 },
  });

// Map a 0..1 spring value to a vertical slide-in transform.
export const slideUp = (appear: number, px = 26) =>
  `translateY(${interpolate(appear, [0, 1], [px, 0])}px)`;

// Map a 0..1 spring value to a scale-up transform.
export const scaleIn = (appear: number, from = 0.7) =>
  `scale(${interpolate(appear, [0, 1], [from, 1])})`;
