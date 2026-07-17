import { config } from '../config.js';

/**
 * Maps (canonical English exam name, question number) → demo video URL.
 *
 * Keys use the same canonical examName the frontend already receives in
 * ExamFollowupQuestion (the one stamped from examinationDisplayNames in
 * symptomGuidelines.ts). URLs are absolute against config.apiUrl — the
 * API itself serves these files from public/videos at /videos/*.
 *
 * Source of truth for the mapping is videos-list.txt at the repo root.
 * Where one video covers a range of questions (e.g. Pulse check Q1–3),
 * each question gets the same URL. Where two videos exist for the same
 * question (C-ABCDE Q1: pressure vs. tourniquet), only the first listed
 * (pressure, video-17) is wired up; the other file is still in the public
 * folder for future use.
 */

const VIDEO_BASE = `${config.apiUrl.replace(/\/$/, '')}/videos`;

const videoMap: Record<string, string> = {
  // Vital signs (videos 1-5)
  'Vital signs::1': `${VIDEO_BASE}/video-5.mp4`,   // Temperature
  'Vital signs::2': `${VIDEO_BASE}/video-2.mp4`,   // Respiration rate
  'Vital signs::3': `${VIDEO_BASE}/video-4.mp4`,   // Heart rate
  'Vital signs::4': `${VIDEO_BASE}/video-3.mp4`,   // Blood pressure
  'Vital signs::5': `${VIDEO_BASE}/video-1.mp4`,   // SpO2

  // Capillary Refill test (video 6)
  'Capillary Refill test::1': `${VIDEO_BASE}/video-6.mp4`,

  // Abdomen examination (video 7) — four-quadrant palpation.
  'Abdomen examination::4': `${VIDEO_BASE}/video-7.mp4`,
  // Same palpation demo for the Abdominal Pain pathway's own exam (Q2 is the
  // "press across all four quadrants" question) — the most common abdominal
  // complaint, which otherwise had no video.
  'Abdominal pain exam::2': `${VIDEO_BASE}/video-7.mp4`,

  // Eye examination (videos 8, 22, 23, 24)
  'Eye examination::1': `${VIDEO_BASE}/video-22.mp4`, // redness around iris
  'Eye examination::2': `${VIDEO_BASE}/video-23.mp4`, // redness around white part
  'Eye examination::7': `${VIDEO_BASE}/video-8.mp4`,  // pupil reaction
  'Eye examination::8': `${VIDEO_BASE}/video-24.mp4`, // counting fingers

  // Simple neurologic check (videos 9, 10, 11)
  'Simple neurologic check::1': `${VIDEO_BASE}/video-9.mp4`,  // face symmetry
  'Simple neurologic check::4': `${VIDEO_BASE}/video-10.mp4`, // arms strength
  'Simple neurologic check::5': `${VIDEO_BASE}/video-11.mp4`, // leg strength

  // Throat check (videos 12, 13, 14)
  'Throat check::1': `${VIDEO_BASE}/video-12.mp4`, // throat examination
  'Throat check::2': `${VIDEO_BASE}/video-13.mp4`, // tonsillitis check
  'Throat check::6': `${VIDEO_BASE}/video-14.mp4`, // mouth opening test

  // Dehydration check (video 15 covers both questions)
  'Dehydration check::1': `${VIDEO_BASE}/video-15.mp4`,
  'Dehydration check::2': `${VIDEO_BASE}/video-15.mp4`,

  // Pulse check (video 16 covers all three questions)
  'Pulse check::1': `${VIDEO_BASE}/video-16.mp4`,
  'Pulse check::2': `${VIDEO_BASE}/video-16.mp4`,
  'Pulse check::3': `${VIDEO_BASE}/video-16.mp4`,

  // C-ABCDE assessment (video 17 = pressure; video 18 = tourniquet is unmapped)
  'C-ABCDE assessment::1': `${VIDEO_BASE}/video-17.mp4`,

  // Thrombosis and edema check (video 20)
  'Thrombosis and edema check::5': `${VIDEO_BASE}/video-20.mp4`,

  // Breathing check (video 25)
  'Breathing check::5': `${VIDEO_BASE}/video-25.mp4`,
};

export function getExamVideoUrl(examName: string, questionNumber: number): string | undefined {
  return videoMap[`${examName}::${questionNumber}`];
}
