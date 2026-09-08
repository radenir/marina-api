// ---------------------------------------------------------------------------
// script.ts — timing, narration and clip wiring for "90-Second Quickstart".
//
// Unlike the consultation film, the phone here is a REAL screen recording
// (out/qs-*.mp4), captured by QuickstartFilmTests, with Remotion drawing only
// ON TOP of it — captions and a title/end card. Nothing inside the phone is
// re-animated. See ../../SCENARIO-quickstart.md.
//
// Beat lengths are sized to each VO clip plus a lead-in (`from`) and a tail, so
// the cross-dissolve never clips the narrator. Re-measure after any narration
// edit:
//   cd public/audio && for f in vo-qs-*.mp3; do \
//     printf "%-10s %4.0f\n" "$f" \
//     "$(echo "$(ffprobe -v error -show_entries format=duration -of csv=p=0 $f)*30"|bc)"; done
// ---------------------------------------------------------------------------

// ---- Beat lengths (frames @ 30 fps) ----------------------------------------
// VO measured: qs-0 169 · qs-1 458 · qs-2 562 · qs-3 583 · qs-4 426 · qs-5 160
export const TITLE_FRAMES = 210; //  vo-qs-0  5.7s
export const PROFILE_FRAMES = 500; // vo-qs-1 15.3s
export const START_FRAMES = 600; //   vo-qs-2 18.8s
export const UPDATE_FRAMES = 620; //  vo-qs-3 19.5s
export const SEND_FRAMES = 470; //    vo-qs-4 14.2s
export const END_FRAMES = 200; //     vo-qs-5  5.3s

export const QUICKSTART_FRAMES =
  TITLE_FRAMES +
  PROFILE_FRAMES +
  START_FRAMES +
  UPDATE_FRAMES +
  SEND_FRAMES +
  END_FRAMES; // 2600 frames ≈ 87s

export const FADE = 16;

// ---------------------------------------------------------------------------
// Beats. `clip` is the screen recording that plays inside the phone bezel;
// `trimFrom` skips the dead time at the front of a raw capture (sign-in
// timeouts, navigation) so the beat opens on the action. `vo.from` is the
// lead-in before the narrator starts, in frames from the beat's start.
//
// Captions are timed in frames from the beat's start; each is a short verbatim
// line shown in the callout column beside whatever is happening on the phone.
// ---------------------------------------------------------------------------
export interface Caption {
  at: number;
  title: string;
  body?: string;
  accent?: boolean;
}

export interface Beat {
  key: string;
  frames: number;
  clip?: string; // staticFile path under public/, e.g. 'clips/qs-profile.mp4'
  trimFrom?: number; // frames to skip at the head of the raw clip
  vo: { name: string; from: number };
  captions: Caption[];
}

export const BEATS: Beat[] = [
  {
    key: 'profile',
    frames: PROFILE_FRAMES,
    clip: 'clips/qs-profile.mp4',
    trimFrom: 0,
    vo: { name: 'vo-qs-1', from: 10 },
    captions: [
      { at: 40, title: 'Cruise speed drives every ETA' },
      { at: 300, title: 'No autosave — always tap Save', accent: true },
    ],
  },
  // start and update are two halves of the SAME capture (qs-notetaker.mp4) —
  // the manifest films them as one continuous recording (they share the
  // session) and splits here with trimFrom. start opens on the tap + prefill;
  // update opens just before the Update-report tap and runs to the filled report.
  {
    key: 'start',
    frames: START_FRAMES,
    clip: 'clips/qs-notetaker.mp4',
    trimFrom: 270, // ~9s: the record tap
    vo: { name: 'vo-qs-2', from: 10 },
    captions: [
      { at: 40, title: 'Open the Note Taker, tap the mic — once' },
      {
        at: 300,
        title: 'One tap: record + prefill + locate',
        body: 'Ship, date and GPS fill in before you speak.',
        accent: true,
      },
    ],
  },
  {
    key: 'update',
    frames: UPDATE_FRAMES,
    clip: 'clips/qs-notetaker.mp4',
    trimFrom: 840, // ~28s: just before the Update-report tap, runs to filled
    vo: { name: 'vo-qs-3', from: 10 },
    captions: [
      {
        at: 30,
        title: 'Recording ≠ report',
        body: 'The report only rebuilds when you tap Update.',
      },
      { at: 320, title: 'Update report — tap it often', accent: true },
    ],
  },
  {
    key: 'send',
    frames: SEND_FRAMES,
    clip: 'clips/qs-send.mp4',
    trimFrom: 0,
    vo: { name: 'vo-qs-4', from: 10 },
    captions: [
      { at: 40, title: '3 official forms · one dictation' },
      {
        at: 250,
        title: 'Nothing reaches shore until you send it',
        accent: true,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Title and end cards — no phone, just brand + the four verbs the film teaches.
// ---------------------------------------------------------------------------
export const TITLE = {
  vo: { name: 'vo-qs-0', from: 16 },
  heading: 'Marina in 90 seconds',
  sub: 'Four things, and you’re ready',
};

export const END = {
  vo: { name: 'vo-qs-5', from: 12 },
  chips: ['Save', 'Tap', 'Update', 'Send'],
  url: 'marinahealth.eu',
};
