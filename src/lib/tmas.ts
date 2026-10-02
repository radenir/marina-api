/**
 * Telemedical Assistance Services (TMAS) — who a ship can send a medical
 * report to, which form each one gets, and the one address we send it to.
 *
 * Source: the TMAS directory in the Mariner's Medico Guide app (Gard / Helse
 * Bergen), transcribed 2026-10-02. Every service listed takes all ships
 * regardless of flag state, so the flag does not pick the TMAS — the officer
 * does, and the TMAS then picks the form.
 *
 * TEMPLATE RULE: Denmark gets the RMD form, Germany the TMAS Germany form,
 * everyone else the Marina report unless stated otherwise here.
 *
 * EMAIL is the single address /ai/email-pdf sends to when called with
 * `tmas`. Where a service publishes several, the one for medical advice was
 * chosen and the rest are kept in `otherEmails` for display only. A service
 * with no published address has `email: null` and cannot be emailed — the
 * report is downloaded and sent by the ship's own means.
 *
 * This is code rather than a table on purpose: an address here decides where
 * a patient's medical report goes, so a change should be a reviewed commit.
 */
import type { PdfTemplate } from './emailQueue.js';

export interface Tmas {
  /** Stable id, lower-case ISO 3166-1 alpha-2 of the operating country. */
  id: string;
  country: string;
  name: string;
  /** ISO 639-1 codes the service answers in. */
  languages: string[];
  phones: { number: string; label?: string }[];
  /** The address reports are emailed to; null when none is published. */
  email: string | null;
  /** Caveat on `email`, shown to the officer before sending. */
  emailNote?: string;
  /** Further published addresses, for display only — never sent to. */
  otherEmails?: { email: string; label: string }[];
  template: PdfTemplate;
  hours: string;
  /** Restrictions the officer should see before choosing this service. */
  notes?: string[];
}

export const TMAS: readonly Tmas[] = [
  {
    id: 'no', country: 'Norway', name: 'NSMDM Radio Medico',
    languages: ['en', 'no'],
    phones: [{ number: '+47 51 68 36 01' }],
    email: 'advice@radiomedico.no',
    template: 'marina', hours: '24/7',
    notes: ['Inmarsat: 32 through Eik earth station', 'Video conference by agreement'],
  },
  {
    id: 'au', country: 'Australia', name: 'Life Flight',
    languages: ['en'],
    phones: [{ number: '+61 2 62 30 68 11', label: 'Medical emergencies only' }],
    email: 'rccaus@amsa.gov.au',
    template: 'marina', hours: '24/7',
    notes: ['Inmarsat: SAC 38', 'HF-DSC: JRCC Australia using urgency call 00 50 300 01',
      'Recreational and domestic commercial vessels dial 000 for urgent medical assistance'],
  },
  {
    id: 'ca', country: 'Canada', name: 'Joint Rescue Coordination Centre (JRCC)',
    languages: ['en'],
    phones: [{ number: '+1 902 427 8200' }, { number: '+1 800 565 1582' }],
    email: null,
    template: 'marina', hours: '24/7',
  },
  {
    id: 'dk', country: 'Denmark', name: 'Radio Medical',
    languages: ['en', 'da'],
    phones: [{ number: '+45 75 45 67 66' }],
    email: 'RMD@RSYD.dk', emailNote: 'Non-emergency only — call for emergencies.',
    template: 'rmd', hours: '24/7',
  },
  {
    id: 'fr', country: 'France', name: 'CCMM',
    languages: ['fr'],
    phones: [{ number: '+33 321 872 187' }],
    email: 'ccmm@chu-toulouse.fr',
    template: 'marina', hours: '24/7 emergencies only; non-urgent Mon–Fri 08:00–18:00 UTC+1',
    notes: ['Inmarsat: 32 through Aussaguel'],
  },
  {
    id: 'de', country: 'Germany', name: 'Medico Cuxhaven',
    languages: ['en', 'de'],
    phones: [{ number: '+49 4721 785' }],
    email: 'medico@tmas-germany.de',
    template: 'german', hours: '24/7',
  },
  {
    id: 'it', country: 'Italy', name: 'CIRM',
    languages: ['en', 'fr', 'it'],
    phones: [{ number: '+39 065 9290 263' }],
    email: 'telesoccorso@cirm.it',
    otherEmails: [{ email: 'telesoccorso@cirmtmas.it', label: 'Alternative address' }],
    template: 'marina', hours: '24/7',
  },
  {
    id: 'nl', country: 'Netherlands', name: 'KNRM Radio Medical',
    languages: ['en', 'nl'],
    phones: [{ number: '+31 223 542 500', label: 'Netherlands Coast Guard' }],
    email: '32@rmd.knrm.nl', emailNote: 'Medical advice address.',
    otherEmails: [
      { email: '38@rmd.knrm.nl', label: 'Urgent' },
      { email: '00@rmd.knrm.nl', label: 'Non-urgent' },
    ],
    template: 'marina', hours: '24/7',
    notes: ['Inmarsat: 32 through Burum earth station'],
  },
  {
    id: 'pl', country: 'Poland', name: 'UCMTM',
    languages: ['en', 'pl'],
    phones: [{ number: '+48 586 998 460' }],
    email: null,
    template: 'marina', hours: '24/7',
  },
  {
    id: 'za', country: 'South Africa', name: 'Cape Town MRCC',
    languages: ['en', 'af'],
    phones: [{ number: '+27 219 383 300' }],
    email: 'mrcc.ct@samsa.org.za',
    template: 'marina', hours: '24/7',
  },
  {
    id: 'es', country: 'Spain', name: 'ISM Radio Medico',
    languages: ['es'],
    phones: [{ number: '+34 913 103 475' }],
    email: 'centroradiomedico.ism@seg-social.es',
    template: 'marina', hours: '24/7 emergencies only; non-urgent Mon–Fri 09:00–15:00 UTC+2',
    notes: ['Video consultation possible with advance notice'],
  },
  {
    id: 'se', country: 'Sweden', name: 'SMA TMAS',
    languages: ['sv', 'en'],
    phones: [{ number: '+46 10 492 7900' }],
    email: null,
    template: 'marina', hours: '24/7 emergencies only',
  },
  {
    id: 'tr', country: 'Turkey', name: 'TMAS',
    languages: ['en', 'tr'],
    phones: [{ number: '+90 444 83 53' }],
    email: 'telesaglik@saglik.gov.tr',
    template: 'marina', hours: '24/7',
  },
  {
    id: 'gb', country: 'United Kingdom', name: 'UK MRCC TMAS',
    languages: ['en'],
    phones: [{ number: '+44 344 3820 026' }, { number: '+44 208 3127 386' }],
    email: null,
    template: 'marina', hours: '24/7',
  },
  {
    id: 'us', country: 'United States', name: 'US Coastguard TMAS',
    languages: ['en'],
    phones: [
      { number: '+1 617 223 8555', label: 'Atlantic – Northeast' },
      { number: '+1 757 398 6231', label: 'Atlantic – Mid-Atlantic' },
      { number: '+1 305 415 6800', label: 'Atlantic – Southeast' },
      { number: '+1 504 589 6225', label: 'Atlantic – Heartland, Gulf of Mexico' },
      { number: '+1 216 902 6117', label: 'Atlantic – Great Lakes' },
      { number: '+1 907 463 2000', label: 'Pacific – Alaska' },
      { number: '+1 510 437 3701', label: 'Pacific – Pacific Northwest' },
      { number: '+1 206 220 7001', label: 'Pacific – Pacific Southwest' },
      { number: '+1 808 535 3333', label: 'Pacific – Hawaii and the Pacific' },
    ],
    email: null,
    template: 'marina', hours: '24/7',
    notes: ['US waters only'],
  },
];

export function findTmas(id: string): Tmas | undefined {
  return TMAS.find((t) => t.id === id.toLowerCase());
}
