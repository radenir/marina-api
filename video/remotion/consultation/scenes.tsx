// ---------------------------------------------------------------------------
// scenes.tsx — the nine scenes of "One Consultation".
//
// Every scene reads the frame relative to its own Sequence, so all beat numbers
// below are scene-local and line up with the `at` values in script.ts.
// ---------------------------------------------------------------------------
import React from 'react';
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  OffthreadVideo,
  staticFile,
} from 'remotion';
import {
  User,
  FileText,
  Stethoscope,
  Mic,
  Square,
  Download,
  Mail,
  Check,
  Play,
  X,
} from 'lucide-react';

import { Stage, Callout, ProofRow } from './components/Stage';
import {
  Waveform,
  LiveField,
  ScoreBadge,
  HintBox,
  TapDot,
  KeepUndoBar,
  OfflineBanner,
  PendingCounter,
  SubtitledLine,
  Caret,
} from './components/atoms';
import { typed, typedDone, flash, window_, at as springAt } from './motion';
import { pop, reveal, slideUp, scaleIn } from '../components/anim';
import { Logo } from '../components/Logo';
import {
  NAVY,
  NAVY_BG,
  NAVY_LIGHT,
  INK,
  MUTED,
  BORDER,
  FIELD,
  TINT,
  GREEN,
  AMBER,
  RED,
  FONT_FAMILY,
} from '../theme';
import {
  TRANSCRIPT,
  LIVE_FIELDS,
  AUTO_DIVIDER_AT,
  AUTO_SCROLL,
  VITAL_CELLS,
  SCORES,
  HINT_VITALS,
  HINT_EXAM,
  EXAM_SPOKEN,
  EXAM_SPOKEN_EN,
  EXAM_EXISTING,
  EXAM_WRITTEN,
  EDIT_BEFORE,
  EDIT_HEARD,
  EDIT_HEARD_EN,
  EDIT_AFTER,
  TEMPLATES,
  PROOF,
} from './script';

const mmss = (frame: number) => {
  const s = Math.floor(frame / 30);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const pad = { padding: '0 22px' } as const;

// ---------------------------------------------------------------------------
// Shared in-phone chrome
// ---------------------------------------------------------------------------

/// The recording header: red dot, elapsed timer, live/offline state.
///
/// `startedFrames` carries the clock across scenes. Every scene's frame counter
/// restarts at zero, so without it the timer would jump backwards to 00:00 the
/// moment we cut to the offline scene — in a film whose whole argument is
/// continuity, a rewinding clock is the one detail that gives it away.
const RecordHeader: React.FC<{
  frame: number;
  offline?: boolean;
  startedFrames?: number;
}> = ({ frame, offline = false, startedFrames = 0 }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      ...pad,
      paddingBottom: 10,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        style={{
          width: 13,
          height: 13,
          borderRadius: '50%',
          background: RED,
          opacity: 0.45 + Math.abs(Math.sin(frame / 9)) * 0.55,
        }}
      />
      <span style={{ fontSize: 22, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>
        {mmss(frame + startedFrames)}
      </span>
    </div>
    <span style={{ fontSize: 16, fontWeight: 700, color: offline ? RED : GREEN }}>
      {offline ? 'Holding on device' : 'Transcribing live'}
    </span>
  </div>
);

/// The report's three top tabs, with the active one lit.
const ReportTabs: React.FC<{ active: number; frame: number; switchAt?: number }> = ({
  active,
  frame,
  switchAt,
}) => {
  const shown = switchAt !== undefined && frame < switchAt ? 1 : active;
  const tabs = [
    { label: 'Patient', Icon: User },
    { label: 'Problem', Icon: FileText },
    { label: 'Findings', Icon: Stethoscope },
  ];
  return (
    <div style={{ display: 'flex', gap: 8, ...pad, paddingBottom: 12 }}>
      {tabs.map(({ label, Icon }, i) => {
        const on = i === shown;
        return (
          <div
            key={label}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 5,
              padding: '10px 0',
              borderRadius: 12,
              background: on ? TINT : 'transparent',
              border: `1px solid ${on ? 'rgba(10,75,120,0.22)' : 'transparent'}`,
            }}
          >
            <Icon size={24} color={on ? NAVY : MUTED} strokeWidth={on ? 2.4 : 2} />
            <span style={{ fontSize: 15, fontWeight: on ? 700 : 500, color: on ? NAVY : MUTED }}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
};

/// A section header carrying its quality score.
const ScoredHeader: React.FC<{
  frame: number;
  title: string;
  value: number;
  showAt: number;
}> = ({ frame, title, value, showAt }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    }}
  >
    <span style={{ fontSize: 19, fontWeight: 700, color: NAVY }}>{title}</span>
    <ScoreBadge frame={frame} value={value} showAt={showAt} />
  </div>
);

// ===========================================================================
// 1 — COLD OPEN. The paper form nobody can fill in, dissolving into the app.
// ===========================================================================
export const OpenScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // The form holds the frame alone, then hands over to the phone.
  const formOut = interpolate(frame, [230, 275], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const phoneIn = springAt(frame, fps, 250);
  const lampPulse = 0.86 + Math.sin(frame / 40) * 0.14;

  return (
    <AbsoluteFill style={{ background: '#05192a', fontFamily: FONT_FAMILY }}>
      {/* the red chart lamp */}
      <div
        style={{
          position: 'absolute',
          left: '32%',
          top: '-14%',
          width: 1100,
          height: 1100,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(220,60,45,${0.20 * lampPulse}) 0%, rgba(220,60,45,0) 60%)`,
        }}
      />

      {/* the blank Radio Medical form */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%,-50%) rotate(-2.4deg) scale(${interpolate(
            frame,
            [0, 230],
            [1.06, 1.0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          )})`,
          opacity: formOut,
          width: 620,
          background: '#f6f1e6',
          borderRadius: 4,
          padding: '46px 48px',
          boxShadow: '0 50px 120px rgba(0,0,0,0.6)',
        }}
      >
        <div style={{ fontSize: 25, fontWeight: 800, color: '#2b2b2b', letterSpacing: 0.4 }}>
          RADIO MEDICAL ADVICE
        </div>
        <div style={{ fontSize: 15, color: '#8a8378', marginTop: 5, marginBottom: 30 }}>
          Primary report form — to be completed by the medical officer
        </div>
        {[
          'Patient name',
          'Age / Gender',
          'Chief complaint',
          'History of present illness',
          'Vital signs',
          'Physical examination',
          'Medication given',
        ].map((l, i) => (
          <div key={l} style={{ marginBottom: 21, opacity: interpolate(frame, [i * 5, i * 5 + 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
            <div style={{ fontSize: 13, color: '#8a8378', letterSpacing: 0.6, textTransform: 'uppercase', fontWeight: 700 }}>
              {l}
            </div>
            <div style={{ height: 1, background: '#c9c0af', marginTop: 13 }} />
          </div>
        ))}
      </div>

      {/* …and the phone, offering the other way of doing it */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%,-50%) scale(${interpolate(phoneIn, [0, 1], [0.84, 0.92])})`,
          opacity: phoneIn,
          width: 560,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 210,
            height: 210,
            borderRadius: '50%',
            margin: '0 auto',
            background: `linear-gradient(160deg, ${NAVY_LIGHT} 0%, ${NAVY} 100%)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 0 0 ${18 + Math.sin(frame / 12) * 6}px rgba(13,110,175,0.16), 0 30px 70px rgba(0,0,0,0.5)`,
          }}
        >
          <Mic size={92} color="#fff" strokeWidth={2.1} />
        </div>
        <div
          style={{
            fontSize: 62,
            fontWeight: 800,
            color: '#fff',
            marginTop: 46,
            letterSpacing: -1,
            opacity: springAt(frame, fps, 292),
          }}
        >
          You talk.
        </div>
        <div
          style={{
            fontSize: 34,
            color: 'rgba(255,255,255,0.62)',
            marginTop: 12,
            opacity: springAt(frame, fps, 312),
          }}
        >
          Marina writes the report.
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ===========================================================================
// 2 — TALK. He dictates in Tagalog. The correction beat lives here.
// ===========================================================================
export const TalkScene: React.FC = () => {
  const frame = useCurrentFrame();
  const correctionAt = TRANSCRIPT[3].at;

  return (
    <Stage
      phoneTitle="Note Taker"
      activeTab="note"
      side={
        <>
          <Callout
            frame={frame}
            inAt={40}
            outAt={284}
            title="Speak your own language"
            body="Marina works out which one on its own — you never pick it from a list."
          />
          <Callout
            frame={frame}
            inAt={150}
            outAt={284}
            title="Nothing to type. No form to navigate."
          />
          <Callout
            frame={frame}
            inAt={296}
            title="Correct yourself mid-sentence"
            body="Marina takes the correction, not the mistake. Say things in any order you like."
            accent
          />
        </>
      }
    >
      <RecordHeader frame={frame} />

      <div style={{ ...pad, marginBottom: 6 }}>
        <Waveform frame={frame} active width={452} height={86} />
      </div>

      {/* the transcript, building itself line by line */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          margin: '4px 22px 0',
          padding: '18px 18px 8px',
          background: '#fff',
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          overflow: 'hidden',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: MUTED, letterSpacing: 0.7, marginBottom: 14 }}>
          TRANSCRIPT · TAGALOG DETECTED
        </div>
        {TRANSCRIPT.map((b, i) => (
          <SubtitledLine
            key={i}
            frame={frame}
            at={b.at}
            dur={b.dur}
            tl={b.tl}
            en={b.en}
            // The superseded "twice" fades back once the correction lands, so the
            // eye sees the report follow the last thing said.
            dim={i === 2 && frame >= correctionAt}
          />
        ))}
      </div>

      <div style={{ ...pad, padding: '14px 22px 18px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '15px 0',
            borderRadius: 14,
            background: NAVY,
            color: '#fff',
            fontSize: 21,
            fontWeight: 700,
          }}
        >
          <Square size={18} color="#fff" fill="#fff" /> Finish
        </div>
      </div>
    </Stage>
  );
};

// ===========================================================================
// 3 — BUILD. The report writes itself, then fills what was never spoken.
// ===========================================================================
export const BuildScene: React.FC = () => {
  const frame = useCurrentFrame();
  const spoken = LIVE_FIELDS.filter((f) => f.source === 'spoken');
  const auto = LIVE_FIELDS.filter((f) => f.source === 'auto');

  // The list nudges up as the auto group arrives, so the newest field is always
  // the one in view.
  const scroll = interpolate(frame, [AUTO_SCROLL[0], AUTO_SCROLL[1]], [0, -96], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const filled = LIVE_FIELDS.filter((f) => frame >= f.at).length;

  return (
    <Stage
      phoneTitle="Note Taker"
      activeTab="note"
      side={
        <>
          <Callout
            frame={frame}
            inAt={30}
            outAt={256}
            title="Written in clinical English"
            body="You spoke Tagalog. The report is already in the language the doctor ashore reads — with the grammar handled."
          />
          <Callout
            frame={frame}
            inAt={268}
            title="And the parts you never said"
            body="Vessel details from your profile. Position from GPS. Nearest port and the ETA at your cruise speed."
            accent
          />
        </>
      }
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          ...pad,
          paddingBottom: 12,
        }}
      >
        <span style={{ fontSize: 19, fontWeight: 700, color: NAVY }}>Live report</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: MUTED, fontVariantNumeric: 'tabular-nums' }}>
          {filled} of {LIVE_FIELDS.length} fields
        </span>
      </div>

      {/* The list scrolls under the header, so the top edge is feathered — a hard
          cut through a field label reads as a rendering fault rather than as
          content that has scrolled past. */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          maskImage: 'linear-gradient(to bottom, transparent 0, #000 26px)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 26px)',
        }}
      >
        <div style={{ ...pad, transform: `translateY(${scroll}px)` }}>
          {spoken.map((f) => (
            <LiveField
              key={f.label}
              frame={frame}
              label={f.label}
              value={f.value}
              fillAt={f.at}
              typeDur={f.multiline ? 58 : 22}
              multiline={f.multiline}
              source={f.source}
              compact
            />
          ))}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              margin: '4px 0 12px',
              opacity: window_(frame, AUTO_DIVIDER_AT, 100000, 12),
            }}
          >
            <div style={{ flex: 1, height: 1, background: BORDER }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: MUTED, letterSpacing: 0.8 }}>
              FILLED AUTOMATICALLY
            </span>
            <div style={{ flex: 1, height: 1, background: BORDER }} />
          </div>

          {auto.map((f) => (
            <LiveField
              key={f.label}
              frame={frame}
              label={f.label}
              value={f.value}
              fillAt={f.at}
              typeDur={18}
              source={f.source}
              compact
            />
          ))}
        </div>
      </div>
    </Stage>
  );
};

// ===========================================================================
// 4 — ASK. Marina names what's missing, in his language, and reads it aloud.
// ===========================================================================
export const AskScene: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <Stage
      phoneTitle="Medical Report"
      side={
        <>
          <Callout
            frame={frame}
            inAt={30}
            outAt={288}
            title="Every field is graded"
            body="Not against a generic checklist — against the protocol for this exact complaint."
          />
          <Callout
            frame={frame}
            inAt={300}
            title="You don't need to know what to ask"
            body="Marina picks the single most useful question you haven't answered, and asks it in your language."
            accent
          />
          <div style={{ marginTop: 14 }}>
            <ProofRow frame={frame} inAt={430} items={PROOF} />
          </div>
        </>
      }
      overlay={<TapDot frame={frame} tapAt={26} x={400} y={196} />}
    >
      <ReportTabs active={2} frame={frame} switchAt={30} />

      <div style={{ flex: 1, minHeight: 0, ...pad, overflow: 'hidden' }}>
        {/* the graded sections */}
        <div style={{ marginBottom: 16 }}>
          {SCORES.map((s, i) => (
            <div
              key={s.label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '11px 14px',
                background: '#fff',
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                marginBottom: 8,
                opacity: window_(frame, 44 + i * 10, 100000, 10),
              }}
            >
              <span style={{ fontSize: 18, fontWeight: 600, color: INK }}>{s.label}</span>
              <ScoreBadge frame={frame} value={s.value} showAt={56 + i * 10} />
            </div>
          ))}
        </div>

        <ScoredHeader frame={frame} title="Vital Signs" value={0} showAt={76} />

        {/* the empty vitals grid — the reason the hint fires */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
          {VITAL_CELLS.map((v, i) => (
            <div
              key={v.label}
              style={{
                background: FIELD,
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                padding: '11px 13px',
                opacity: window_(frame, 60 + i * 4, 100000, 8),
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: MUTED }}>{v.label}</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#b6c2cf', marginTop: 3 }}>—</div>
            </div>
          ))}
        </div>

        <HintBox frame={frame} showAt={330} text={HINT_VITALS.tl} speaking />
      </div>
    </Stage>
  );
};

// ===========================================================================
// 5 — SHOW. The real demo video, inside the hint, inside the phone.
// ===========================================================================
const VIDEO = 'videos/capillary-refill.mp4';

export const ShowScene: React.FC = () => {
  const frame = useCurrentFrame();

  const FULL_IN = 130;
  const FULL_OUT = 300;
  const full = window_(frame, FULL_IN, FULL_OUT, 12);
  const spokeAt = 330;
  const writtenAt = 392;

  return (
    <Stage
      phoneTitle="Medical Report"
      side={
        <>
          <Callout
            frame={frame}
            inAt={30}
            outAt={316}
            title="Some questions need your hands"
            body="So Marina shows you how — the right clip attached to the exact question that needs it."
          />
          <Callout
            frame={frame}
            inAt={328}
            title="Say what you saw"
            body="You speak plainly. Marina writes it the way a doctor needs to read it."
            accent
          />
        </>
      }
      overlay={
        <>
          <TapDot frame={frame} tapAt={118} x={272} y={720} />
          {/* fullscreen player, over the phone */}
          {full > 0.01 && (
            <div
              style={{
                // Inset by the bezel width so the device frame survives — a
                // fullscreen player that eats the bezel stops reading as "inside
                // a phone" and starts reading as a cutaway.
                position: 'absolute',
                inset: 11,
                borderRadius: 47,
                overflow: 'hidden',
                background: '#000',
                opacity: full,
                transform: `scale(${0.96 + full * 0.04})`,
              }}
            >
              <OffthreadVideo
                src={staticFile(VIDEO)}
                muted
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
              <div
                style={{
                  position: 'absolute',
                  top: 60,
                  right: 34,
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.18)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={28} color="#fff" strokeWidth={2.6} />
              </div>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  right: 0,
                  bottom: 66,
                  textAlign: 'center',
                  color: '#fff',
                  fontSize: 21,
                  fontWeight: 700,
                  fontFamily: FONT_FAMILY,
                  textShadow: '0 2px 12px rgba(0,0,0,0.8)',
                }}
              >
                Capillary refill test
              </div>
            </div>
          )}
        </>
      }
    >
      <ReportTabs active={2} frame={frame} />

      <div style={{ flex: 1, minHeight: 0, ...pad, overflow: 'hidden' }}>
        <ScoredHeader
          frame={frame}
          title="Physical Examination"
          value={frame >= writtenAt + 30 ? 85 : 40}
          showAt={20}
        />

        <div
          style={{
            background: FIELD,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: '13px 15px',
            fontSize: 17,
            lineHeight: 1.42,
            minHeight: 92,
            color: INK,
            boxShadow: `0 0 0 ${flash(frame, writtenAt, 40) * 3}px rgba(10,75,120,${flash(frame, writtenAt, 40) * 0.35})`,
          }}
        >
          {/* The field already had an examination in it. The answer is appended,
              not substituted — which is what actually happens, and it stops the
              existing text reading as greyed-out placeholder copy. */}
          {EXAM_EXISTING}
          {frame >= writtenAt && (
            <>
              {' '}
              {typed(EXAM_WRITTEN, frame, writtenAt, 48)}
              {!typedDone(EXAM_WRITTEN, frame, writtenAt, 48) && <Caret frame={frame} />}
            </>
          )}
        </div>

        {/* the hint, with the demo video living inside it */}
        <HintBox frame={frame} showAt={30} text={HINT_EXAM.tl}>
          <div
            style={{
              marginTop: 12,
              borderRadius: 12,
              overflow: 'hidden',
              position: 'relative',
              background: '#000',
              height: 208,
            }}
          >
            <OffthreadVideo
              src={staticFile(VIDEO)}
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div
              style={{
                position: 'absolute',
                right: 12,
                bottom: 12,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: 'rgba(0,0,0,0.55)',
                borderRadius: 999,
                padding: '7px 13px',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <Play size={14} color="#fff" fill="#fff" /> Tap to expand
            </div>
          </div>
        </HintBox>

        {/* what he says back, once he's done it */}
        {frame >= spokeAt && (
          <div
            style={{
              marginTop: 12,
              padding: '12px 15px',
              background: TINT,
              border: `1px solid rgba(10,75,120,0.18)`,
              borderRadius: 12,
              opacity: window_(frame, spokeAt, 100000, 10),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <Mic size={17} color={NAVY} strokeWidth={2.6} />
              <span style={{ fontSize: 13, fontWeight: 800, color: NAVY, letterSpacing: 0.6 }}>
                YOU SAID
              </span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: INK }}>
              {typed(EXAM_SPOKEN, frame, spokeAt, 40)}
            </div>
            {typedDone(EXAM_SPOKEN, frame, spokeAt, 40) && (
              <div style={{ fontSize: 15, color: MUTED, marginTop: 3 }}>{EXAM_SPOKEN_EN}</div>
            )}
          </div>
        )}
      </div>
    </Stage>
  );
};

// ===========================================================================
// 6 — VOICE. Fix any field by talking to it. Always reversible.
// ===========================================================================
export const VoiceScene: React.FC = () => {
  const frame = useCurrentFrame();
  const TAP = 30;
  const REC_IN = 44;
  const REC_OUT = 138;
  const HEARD = 148;
  const REWRITE = 214;
  const KEEP = 262;
  const recording = frame >= REC_IN && frame < REC_OUT;

  return (
    <Stage
      phoneTitle="Medical Report"
      side={
        <>
          <Callout
            frame={frame}
            inAt={24}
            outAt={200}
            title="Every field has a microphone"
            body="Remembered something? Say it. Marina rewrites the field in proper clinical language."
          />
          <Callout
            frame={frame}
            inAt={212}
            title="Always reversible"
            body="Marina shows you what it heard, and the change stays undoable. This becomes a medical record."
            accent
          />
        </>
      }
      overlay={<TapDot frame={frame} tapAt={TAP} x={404} y={318} />}
    >
      <ReportTabs active={1} frame={frame} />

      <div style={{ flex: 1, minHeight: 0, ...pad, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 16, fontWeight: 600, color: MUTED }}>Allergies</span>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: '50%',
              background: recording ? RED : TINT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: recording
                ? `0 0 0 ${6 + Math.abs(Math.sin(frame / 8)) * 6}px rgba(239,68,68,0.16)`
                : 'none',
            }}
          >
            <Mic size={21} color={recording ? '#fff' : NAVY} strokeWidth={2.5} />
          </div>
        </div>

        <div
          style={{
            background: FIELD,
            border: `1px solid ${frame >= REWRITE ? NAVY : BORDER}`,
            borderRadius: 12,
            padding: '13px 15px',
            fontSize: 18,
            lineHeight: 1.42,
            minHeight: 72,
            color: INK,
            boxShadow: `0 0 0 ${flash(frame, REWRITE, 40) * 3}px rgba(10,75,120,${flash(frame, REWRITE, 40) * 0.35})`,
          }}
        >
          {frame < REWRITE ? (
            EDIT_BEFORE
          ) : (
            <>
              {typed(EDIT_AFTER, frame, REWRITE, 44)}
              {!typedDone(EDIT_AFTER, frame, REWRITE, 44) && <Caret frame={frame} />}
            </>
          )}
        </div>

        {/* live mic */}
        {recording && (
          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'center' }}>
            <Waveform frame={frame} active bars={30} width={380} height={62} color={RED} />
          </div>
        )}

        {/* what Marina heard — shown so a mis-hearing is obvious */}
        {frame >= HEARD && (
          <div
            style={{
              marginTop: 16,
              padding: '12px 15px',
              background: TINT,
              border: `1px solid rgba(10,75,120,0.18)`,
              borderRadius: 12,
              opacity: window_(frame, HEARD, 100000, 10),
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 800, color: NAVY, letterSpacing: 0.6, marginBottom: 6 }}>
              MARINA HEARD
            </div>
            <div style={{ fontSize: 18, fontWeight: 600, color: INK }}>
              {typed(EDIT_HEARD, frame, HEARD, 46)}
            </div>
            {typedDone(EDIT_HEARD, frame, HEARD, 46) && (
              <div style={{ fontSize: 15, color: MUTED, marginTop: 3 }}>{EDIT_HEARD_EN}</div>
            )}
          </div>
        )}

        {frame >= KEEP && <KeepUndoBar frame={frame} showAt={KEEP} />}
      </div>
    </Stage>
  );
};

// ===========================================================================
// 7 — OFFLINE. The objection-killer. The link dies; the consultation doesn't.
// ===========================================================================
export const OfflineScene: React.FC = () => {
  const frame = useCurrentFrame();
  const DROP = 26;
  const BACK = 230;
  const offline = frame >= DROP && frame < BACK;

  return (
    <Stage
      phoneTitle="Note Taker"
      activeTab="note"
      side={
        <>
          <Callout
            frame={frame}
            inAt={34}
            outAt={226}
            title="The satellite drops"
            body="Marina keeps recording. The audio is held on the phone — not thrown away, not skipped."
          />
          <Callout
            frame={frame}
            inAt={238}
            title="And catches up by itself"
            body="The moment the link returns, the backlog uploads and the missing words appear in the report."
            accent
          />
          <Callout
            frame={frame}
            inAt={292}
            title="Even if the app is killed"
            body="The consultation is still there when you come back to it."
          />
        </>
      }
    >
      <OfflineBanner frame={frame} inAt={DROP} outAt={BACK} />
      {/* ~2 minutes into the same consultation the Talk scene started. */}
      <RecordHeader frame={frame} offline={offline} startedFrames={3900} />

      <div style={{ ...pad }}>
        <Waveform frame={frame} active width={452} height={80} color={offline ? RED : NAVY} />
      </div>

      <div style={{ flex: 1, minHeight: 0, ...pad, marginTop: 6 }}>
        <div
          style={{
            padding: '16px 18px',
            background: '#fff',
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: MUTED, letterSpacing: 0.7, marginBottom: 12 }}>
            TRANSCRIPT
          </div>
          <div style={{ fontSize: 18, lineHeight: 1.45, color: INK }}>
            {TRANSCRIPT[1].en}
          </div>
          {offline && (
            <div style={{ fontSize: 18, lineHeight: 1.45, color: '#b6c2cf', marginTop: 8 }}>
              ▪▪▪▪▪▪ ▪▪▪▪ ▪▪▪▪▪▪▪▪
            </div>
          )}
          {frame >= BACK + 34 && (
            <div
              style={{
                fontSize: 18,
                lineHeight: 1.45,
                color: INK,
                marginTop: 8,
                opacity: window_(frame, BACK + 34, 100000, 12),
              }}
            >
              {typed(TRANSCRIPT[4].en, frame, BACK + 34, 40)}
            </div>
          )}
        </div>

        <PendingCounter frame={frame} showAt={DROP + 14} peak={7} drainAt={BACK} drainDur={40} />
      </div>
    </Stage>
  );
};

// ===========================================================================
// 8 — SEND. One dictation, three official forms, then it's gone ashore.
// ===========================================================================
export const SendScene: React.FC = () => {
  const frame = useCurrentFrame();
  const PICK = 110;
  const SEND_TAP = 290;
  const SENT = 360;

  return (
    <Stage
      phoneTitle="Medical Report"
      side={
        <>
          <Callout
            frame={frame}
            inAt={30}
            outAt={334}
            title="One dictation, three official forms"
            body="Marina's own report, the Danish Radio Medical form, or the German TMAS form. The data doesn't change — only the paper does."
          />
          <Callout
            frame={frame}
            inAt={346}
            title="Nothing leaves the ship until you send it"
            body="Download it, or email it straight to the doctor ashore."
            accent
          />
        </>
      }
      overlay={<TapDot frame={frame} tapAt={PICK} x={272} y={452} />}
    >
      <div style={{ flex: 1, minHeight: 0, ...pad, paddingTop: 6, overflow: 'hidden' }}>
        {/* all green — the report is complete */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '13px 15px',
            background: '#f0fdf4',
            border: `1px solid ${GREEN}`,
            borderRadius: 12,
            marginBottom: 18,
            opacity: window_(frame, 14, 100000, 10),
          }}
        >
          <Check size={22} color={GREEN} strokeWidth={3} />
          <span style={{ fontSize: 18, fontWeight: 700, color: GREEN }}>
            All sections complete
          </span>
        </div>

        <div style={{ fontSize: 16, fontWeight: 700, color: MUTED, letterSpacing: 0.6, marginBottom: 10 }}>
          TEMPLATE
        </div>

        {TEMPLATES.map((t, i) => {
          // Selection starts on Marina and moves to the Danish form on the tap.
          const selected = frame < PICK ? i === 0 : i === 1;
          return (
            <div
              key={t.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderRadius: 13,
                marginBottom: 9,
                background: selected ? TINT : '#fff',
                border: `2px solid ${selected ? NAVY : BORDER}`,
                opacity: window_(frame, 26 + i * 8, 100000, 10),
              }}
            >
              <div>
                <div style={{ fontSize: 19, fontWeight: 700, color: selected ? NAVY : INK }}>
                  {t.label}
                </div>
                <div style={{ fontSize: 15, color: MUTED, marginTop: 2 }}>{t.sub}</div>
              </div>
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  border: `2px solid ${selected ? NAVY : BORDER}`,
                  background: selected ? NAVY : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {selected && <Check size={16} color="#fff" strokeWidth={3.4} />}
              </div>
            </div>
          );
        })}

        {/* export actions */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '15px 0',
              borderRadius: 13,
              border: `2px solid ${NAVY}`,
              color: NAVY,
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            <Download size={20} color={NAVY} strokeWidth={2.6} /> Download
          </div>
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '15px 0',
              borderRadius: 13,
              background: NAVY,
              color: '#fff',
              fontSize: 18,
              fontWeight: 700,
              transform: `scale(${1 - flash(frame, SEND_TAP, 18) * 0.04})`,
            }}
          >
            <Mail size={20} color="#fff" strokeWidth={2.6} /> Email PDF
          </div>
        </div>

        {/* sent confirmation */}
        {frame >= SENT && (
          <div
            style={{
              marginTop: 18,
              padding: '16px 18px',
              background: '#f0fdf4',
              border: `1px solid ${GREEN}`,
              borderRadius: 14,
              opacity: window_(frame, SENT, 100000, 12),
              transform: `translateY(${(1 - window_(frame, SENT, 100000, 12)) * 14}px)`,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Check size={22} color={GREEN} strokeWidth={3} />
              <span style={{ fontSize: 18, fontWeight: 800, color: GREEN }}>
                Report sent to the doctor
              </span>
            </div>
            <div style={{ fontSize: 15, color: MUTED, marginTop: 6 }}>
              rmd-maritime-medical-report.pdf
            </div>
          </div>
        )}
      </div>
    </Stage>
  );
};

// ===========================================================================
// 9 — END CARD.
// ===========================================================================
export const EndScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = pop(frame, fps, 4);
  const a1 = reveal(frame, fps, 22);
  const a2 = reveal(frame, fps, 40);

  return (
    <AbsoluteFill
      style={{
        background: NAVY_BG,
        fontFamily: FONT_FAMILY,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{ opacity: logo, transform: scaleIn(logo, 0.6) }}>
        <Logo size={188} />
      </div>
      <div
        style={{
          fontSize: 78,
          fontWeight: 800,
          color: '#fff',
          letterSpacing: -1.4,
          marginTop: 34,
          opacity: a1,
          transform: slideUp(a1, 24),
        }}
      >
        You talk. We write the report.
      </div>
      <div
        style={{
          fontSize: 32,
          color: 'rgba(255,255,255,0.66)',
          marginTop: 18,
          letterSpacing: 1.6,
          opacity: a2,
          transform: slideUp(a2, 18),
        }}
      >
        marinahealth.eu
      </div>
    </AbsoluteFill>
  );
};
