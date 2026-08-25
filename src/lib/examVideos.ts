import { config } from '../config.js';

/**
 * Maps (canonical English exam name, question number) → demo video URL.
 *
 * Keys use the same canonical examName the frontend already receives in
 * ExamFollowupQuestion (the one stamped from examinationDisplayNames in
 * symptomGuidelines.ts). URLs are absolute against config.apiUrl — the
 * API itself serves these files from public/videos at /videos/*.
 *
 * Mappings were verified frame-by-frame against the files in public/videos on 2026-08-25;
 * videos-list.txt is the delivery record but had three slots wrong (see below), so the
 * footage itself is the source of truth. Note the shipped file numbers follow the numbering
 * of the commissioning brief's scenario list, NOT the question they illustrate.
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
  // video-8 shows pupil SIZE and SHAPE (one pupil dilates, arrow marks it); no light is
  // ever shone. It was previously on Q7 (light reaction), which it does not depict.
  'Eye examination::4': `${VIDEO_BASE}/video-8.mp4`,  // pupils round?
  'Eye examination::5': `${VIDEO_BASE}/video-8.mp4`,  // pupils same size?
  // Q7 (light reaction) has no video until one is produced.
  'Eye examination::8': `${VIDEO_BASE}/video-24.mp4`, // counting fingers

  // Simple neurologic check (videos 9, 10, 11)
  // video-9 is an EYEBROW RAISE (forehead wrinkles on one side only), not a smile. It was
  // previously on Q1 (smile), which it does not depict. Q1 has no video until one is made.
  'Simple neurologic check::3': `${VIDEO_BASE}/video-9.mp4`,  // raise eyebrows
  'Simple neurologic check::4': `${VIDEO_BASE}/video-10.mp4`, // arms strength
  'Simple neurologic check::5': `${VIDEO_BASE}/video-11.mp4`, // leg strength

  // Advanced neurologic check — reuses the Simple-neuro and Eye demos for the questions
  // whose wording is identical or describes the same manoeuvre.
  'Advanced neurologic check::4':  `${VIDEO_BASE}/video-8.mp4`,  // pupils similar size and round
  'Advanced neurologic check::9':  `${VIDEO_BASE}/video-9.mp4`,  // raise eyebrows
  'Advanced neurologic check::14': `${VIDEO_BASE}/video-11.mp4`, // lying down, lift leg, push down

  // Throat check (videos 12, 13, 14)
  'Throat check::1': `${VIDEO_BASE}/video-12.mp4`, // throat examination
  'Throat check::2': `${VIDEO_BASE}/video-13.mp4`, // tonsillitis check
  'Throat check::6': `${VIDEO_BASE}/video-14.mp4`, // mouth opening test

  // Dental examination Q4 is the same sentence as Throat check Q6, word for word.
  'Dental examination::4': `${VIDEO_BASE}/video-14.mp4`, // mouth opening test

  // Infection focus check Q2 asks the same tonsil inspection as Throat check Q2.
  'Infection focus check::2': `${VIDEO_BASE}/video-13.mp4`, // tonsils / white patches

  // Dehydration check — video-15 is the skin-turgor pinch only. It was previously also on
  // Q2 (dry tongue/lips/mouth), which never appears in the footage.
  'Dehydration check::1': `${VIDEO_BASE}/video-15.mp4`,

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
