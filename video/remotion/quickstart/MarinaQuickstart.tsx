// ---------------------------------------------------------------------------
// MarinaQuickstart — the 90-second quickstart film.
//
// Same sequencing machinery as the other two films (scenes end to end, each
// overlapping the next by FADE for a cross-dissolve, voiceover on the absolute
// timeline). What differs: the phone in every beat is a REAL screen recording
// (public/clips/qs-*.mp4) played via DeviceVideo, with only captions drawn on
// top. See ../../SCENARIO-quickstart.md.
// ---------------------------------------------------------------------------
import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';

import {
  FADE,
  TITLE_FRAMES,
  PROFILE_FRAMES,
  START_FRAMES,
  UPDATE_FRAMES,
  SEND_FRAMES,
  END_FRAMES,
  BEATS,
  TITLE,
  END,
  type Beat,
} from './script';
import { DeviceVideo } from './DeviceVideo';
import { Callout } from '../consultation/components/Stage';
import { Logo } from '../components/Logo';
import { reveal } from '../components/anim';
import {
  SCENE_BG,
  NAVY_BG,
  NAVY,
  MUTED,
  FONT_FAMILY,
  TINT,
} from '../theme';

// ---------------------------------------------------------------------------
// FadeWrap — the cross-dissolve envelope, identical to the other films.
// ---------------------------------------------------------------------------
const FadeWrap: React.FC<{ durationInFrames: number; children: React.ReactNode }> = ({
  durationInFrames,
  children,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, FADE, durationInFrames - FADE, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  return <AbsoluteFill style={{ opacity }}>{children}</AbsoluteFill>;
};

// ---------------------------------------------------------------------------
// BeatScene — phone clip left, captions right. The phone is the subject; the
// callouts arrive one at a time beside whatever is on screen.
// ---------------------------------------------------------------------------
const PHONE_SCALE = 0.855;

const BeatScene: React.FC<{ beat: Beat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entry = reveal(frame, fps, 3);
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

      {/* phone — the real screen recording */}
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
        {beat.clip ? (
          <DeviceVideo src={beat.clip} startFrom={(beat.trimFrom ?? 0) / 30} />
        ) : (
          <div style={{ width: 546, height: 1161 }} />
        )}
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
        {beat.captions.map((c, i) => (
          <Callout
            key={i}
            frame={frame}
            inAt={c.at}
            title={c.title}
            body={c.body}
            accent={c.accent}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// TitleScene / EndScene — brand cards, no phone.
// ---------------------------------------------------------------------------
const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const up = reveal(frame, fps, 4);
  return (
    <AbsoluteFill
      style={{
        background: NAVY_BG,
        fontFamily: FONT_FAMILY,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Logo size={150} style={{ opacity: up, marginBottom: 40 }} />
      <div
        style={{
          opacity: up,
          transform: `translateY(${(1 - up) * 20}px)`,
          color: '#fff',
          fontSize: 92,
          fontWeight: 800,
          letterSpacing: -1.5,
        }}
      >
        {TITLE.heading}
      </div>
      <div
        style={{
          opacity: up,
          color: 'rgba(255,255,255,0.8)',
          fontSize: 38,
          marginTop: 16,
          fontWeight: 600,
        }}
      >
        {TITLE.sub}
      </div>
    </AbsoluteFill>
  );
};

const EndScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const up = reveal(frame, fps, 3);
  return (
    <AbsoluteFill
      style={{
        background: NAVY_BG,
        fontFamily: FONT_FAMILY,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Logo size={140} style={{ opacity: up, marginBottom: 34 }} />
      <div style={{ display: 'flex', gap: 16, marginBottom: 30 }}>
        {END.chips.map((c, i) => {
          const p = interpolate(frame, [10 + i * 8, 24 + i * 8], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <div
              key={c}
              style={{
                opacity: p,
                transform: `translateY(${(1 - p) * 14}px)`,
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: 14,
                padding: '14px 26px',
                color: '#fff',
                fontSize: 30,
                fontWeight: 700,
              }}
            >
              {c}
            </div>
          );
        })}
      </div>
      <div
        style={{
          opacity: up,
          color: 'rgba(255,255,255,0.85)',
          fontSize: 32,
          fontWeight: 600,
          letterSpacing: 0.5,
        }}
      >
        {END.url}
      </div>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Compose: title · four beats · end, cross-dissolved, with VO on the timeline.
// ---------------------------------------------------------------------------
const SCENES: { key: string; dur: number; Comp: React.FC }[] = [
  { key: 'title', dur: TITLE_FRAMES, Comp: TitleScene },
  { key: 'profile', dur: PROFILE_FRAMES, Comp: () => <BeatScene beat={BEATS[0]} /> },
  { key: 'start', dur: START_FRAMES, Comp: () => <BeatScene beat={BEATS[1]} /> },
  { key: 'update', dur: UPDATE_FRAMES, Comp: () => <BeatScene beat={BEATS[2]} /> },
  { key: 'send', dur: SEND_FRAMES, Comp: () => <BeatScene beat={BEATS[3]} /> },
  { key: 'end', dur: END_FRAMES, Comp: EndScene },
];

// Which VO clip plays at each scene, and its lead-in.
const VO_AT: { scene: string; name: string; from: number }[] = [
  { scene: 'title', name: TITLE.vo.name, from: TITLE.vo.from },
  ...BEATS.map((b) => ({ scene: b.key, name: b.vo.name, from: b.vo.from })),
  { scene: 'end', name: END.vo.name, from: END.vo.from },
];

export const MarinaQuickstart: React.FC = () => {
  let cursor = 0;
  const placed = SCENES.map((s) => {
    const from = cursor;
    cursor += s.dur; // the extra FADE overlaps into the next scene
    return { ...s, from };
  });
  const startOf = (key: string) => placed.find((p) => p.key === key)?.from ?? 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#04263d' }}>
      {placed.map(({ key, from, dur, Comp }) => (
        <Sequence key={key} from={from} durationInFrames={dur + FADE}>
          <FadeWrap durationInFrames={dur + FADE}>
            <Comp />
          </FadeWrap>
        </Sequence>
      ))}

      {VO_AT.map((v) => (
        <Sequence
          key={v.name}
          from={startOf(v.scene) + v.from}
          durationInFrames={640}
        >
          <Audio src={staticFile(`audio/${v.name}.mp3`)} volume={1} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
