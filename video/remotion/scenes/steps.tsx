// steps.tsx — the nine middle steps of the tour. Each pairs a caption with a
// REAL simulator screenshot (public/shots/*.png), shown full-bleed in the phone
// via the shared StepScene layout.
import React from 'react';
import { StepScene } from './StepScene';
import { NAVY } from '../theme';

const nv = { color: NAVY };

export const StartScene: React.FC = () => (
  <StepScene
    step={1}
    kicker="Getting started"
    title={<>Sign in,<br />and you’re aboard</>}
    body={
      <>
        Sign in with your Marina account. New accounts verify their email and are
        activated by our team.
      </>
    }
    shot="shots/01-login.png"
  />
);

export const NoteScene: React.FC = () => (
  <StepScene
    step={2}
    kicker="Note Taker"
    title={<>Just talk —<br />it writes the report</>}
    body={
      <>
        Tap record and describe the patient. Marina transcribes as you speak and
        builds a structured report <span style={nv}>live on screen</span>.
      </>
    }
    shot="shots/03-note.png"
  />
);

export const ProfileScene: React.FC = () => (
  <StepScene
    step={3}
    kicker="Your profile"
    title={<>Set your vessel<br />once</>}
    body={
      <>
        Marina pre-fills your vessel details into <span style={nv}>every report</span> —
        ship, call sign, medicine chest and more.
      </>
    }
    shot="shots/profile.png"
  />
);

export const SetupScene: React.FC = () => (
  <StepScene
    step={4}
    kicker="AI Interview"
    title={<>Two people,<br />two languages</>}
    body={
      <>
        Pick the patient’s language and your own. Marina speaks to each of you in
        your <span style={nv}>own tongue</span>.
      </>
    }
    shot="shots/interview-setup.png"
  />
);

export const StagesScene: React.FC = () => (
  <StepScene
    step={5}
    kicker="AI Interview"
    title={<>A guided,<br />9-stage interview</>}
    body={
      <>
        Marina asks about the symptom, history and medications, then hands over to
        you for vitals and a physical exam — <span style={nv}>reading every question aloud</span>.
      </>
    }
    shot="shots/interview-chat.png"
  />
);

export const TranslatorScene: React.FC = () => (
  <StepScene
    step={6}
    kicker="Translator"
    title={<>Talk naturally,<br />both ways</>}
    body={
      <>
        The Translator transcribes, translates and <span style={nv}>speaks each side
        aloud</span> — so patient and officer can just talk.
      </>
    }
    shot="shots/translator.png"
  />
);

export const ReportScene: React.FC = () => (
  <StepScene
    step={7}
    kicker="Medical Report"
    title={<>One report,<br />five tabs</>}
    body={
      <>
        Patient, problem, examination, treatment and observations — each tab tracks
        what’s filled in. <span style={nv}>Every field is editable</span>.
      </>
    }
    shot="shots/report.png"
  />
);

export const ImproveScene: React.FC = () => (
  <StepScene
    step={8}
    kicker="Improve & templates"
    title={<>Smarter reports,<br />your format</>}
    body={
      <>
        Improve Report suggests AI follow-ups — some with demo videos. Then choose a
        template: <span style={nv}>Marina or the Danish Radio Medical form</span>.
      </>
    }
    shot="shots/improve.png"
  />
);

export const PdfScene: React.FC = () => (
  <StepScene
    step={9}
    kicker="Export"
    title={<>Send it to<br />the doctor</>}
    body={
      <>
        Download or email the finished PDF — a clean clinical report, ready for the
        <span style={nv}> doctor onshore</span>.
      </>
    }
    shot="shots/pdf.png"
  />
);
