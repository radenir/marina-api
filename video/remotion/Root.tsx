// Root — registers both compositions with Remotion.
//
//   MarinaWalkthrough  — the feature tour (every mode, real static screenshots)
//   MarinaConsultation — one patient end to end, with the app itself animated
import React from 'react';
import { Composition } from 'remotion';
import { MarinaWalkthrough } from './MarinaWalkthrough';
import { MarinaConsultation } from './consultation/MarinaConsultation';
import { MarinaQuickstart } from './quickstart/MarinaQuickstart';
import { FPS, WIDTH, HEIGHT, TOTAL_FRAMES } from './theme';
import { CONSULTATION_FRAMES } from './consultation/script';
import { QUICKSTART_FRAMES } from './quickstart/script';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="MarinaWalkthrough"
      component={MarinaWalkthrough}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="MarinaConsultation"
      component={MarinaConsultation}
      durationInFrames={CONSULTATION_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
    <Composition
      id="MarinaQuickstart"
      component={MarinaQuickstart}
      durationInFrames={QUICKSTART_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  </>
);
