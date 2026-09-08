// ---------------------------------------------------------------------------
// MarinaConsultation — "One Consultation", the step-by-step film.
//
// Same sequencing machinery as MarinaWalkthrough (scenes laid end to end, each
// overlapping the next by FADE for a cross-dissolve, voiceover placed on the
// absolute timeline). What differs is what's inside the scenes: the walkthrough
// shows static screenshots of the app, this one animates the app itself.
// ---------------------------------------------------------------------------
import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  Audio,
  staticFile,
  useCurrentFrame,
  interpolate,
} from 'remotion';

import {
  FADE,
  OPEN_FRAMES,
  TALK_FRAMES,
  BUILD_FRAMES,
  ASK_FRAMES,
  SHOW_FRAMES,
  VOICE_FRAMES,
  OFFLINE_FRAMES,
  SEND_FRAMES,
  END_FRAMES,
  VO,
} from './script';

import {
  OpenScene,
  TalkScene,
  BuildScene,
  AskScene,
  ShowScene,
  VoiceScene,
  OfflineScene,
  SendScene,
  EndScene,
} from './scenes';

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

const SCENES: { key: string; dur: number; Comp: React.FC }[] = [
  { key: 'open', dur: OPEN_FRAMES, Comp: OpenScene },
  { key: 'talk', dur: TALK_FRAMES, Comp: TalkScene },
  { key: 'build', dur: BUILD_FRAMES, Comp: BuildScene },
  { key: 'ask', dur: ASK_FRAMES, Comp: AskScene },
  { key: 'show', dur: SHOW_FRAMES, Comp: ShowScene },
  { key: 'voice', dur: VOICE_FRAMES, Comp: VoiceScene },
  { key: 'offline', dur: OFFLINE_FRAMES, Comp: OfflineScene },
  { key: 'send', dur: SEND_FRAMES, Comp: SendScene },
  { key: 'end', dur: END_FRAMES, Comp: EndScene },
];

export const MarinaConsultation: React.FC = () => {
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

      {VO.map((v) => (
        <Sequence key={v.name} from={startOf(v.scene) + v.from} durationInFrames={560}>
          <Audio src={staticFile(`audio/${v.name}.mp3`)} volume={1} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
