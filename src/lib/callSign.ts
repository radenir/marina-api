// ---------------------------------------------------------------------------
// callSign.ts — a call sign spoken in the radio alphabet, written as a code.
//
// Officers spell the call sign the way they do on the radio: "Lima X-ray Tango
// Victor Niner". The model copied the words, so the report and the PDF said
// "Lima X-ray Tango Victor Niner" instead of "LXTV9" (partner test, script 01,
// 2026-11). The conversion is done in code, not by the model, so it reads the
// same every time.
//
// Only a value made ENTIRELY of spelling words, single letters and digits is
// converted. Anything else ("ship's call sign unknown", a name) stays as it is.
// ---------------------------------------------------------------------------

/** ICAO/ITU spelling alphabet, with the usual spellings and radio numbers. */
const SPELLING: Record<string, string> = {
  alfa: 'A', alpha: 'A', bravo: 'B', charlie: 'C', delta: 'D', echo: 'E', foxtrot: 'F',
  golf: 'G', hotel: 'H', india: 'I', juliett: 'J', juliet: 'J', kilo: 'K', lima: 'L',
  mike: 'M', november: 'N', oscar: 'O', papa: 'P', quebec: 'Q', romeo: 'R', sierra: 'S',
  tango: 'T', uniform: 'U', victor: 'V', whiskey: 'W', whisky: 'W', xray: 'X', yankee: 'Y',
  zulu: 'Z',
  zero: '0', nadazero: '0', one: '1', wun: '1', unaone: '1', two: '2', bissotwo: '2',
  three: '3', tree: '3', terrathree: '3', four: '4', fower: '4', kartefour: '4',
  five: '5', fife: '5', pantafive: '5', six: '6', soxisix: '6', seven: '7', setteseven: '7',
  eight: '8', ait: '8', oktoeight: '8', nine: '9', niner: '9', novenine: '9',
};

/**
 * "Lima X-ray Tango Victor Niner" → "LXTV9"; "L X T V 9" → "LXTV9";
 * "Lima X-ray Tango Victor 9" → "LXTV9". Returns the value unchanged when it is
 * not a spelled code — "LXTV9" itself, a name, "unknown".
 */
export function normalizeCallSign(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const value = raw.trim();
  if (!value) return '';
  // "X-ray" and "X ray" are one word; dashes and commas separate the others.
  const tokens = value
    .toLowerCase()
    .replace(/\bx[\s-]+ray\b/g, 'xray')
    .split(/[\s,.;:/-]+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const t of tokens) {
    if (SPELLING[t]) out.push(SPELLING[t]);
    else if (/^[a-z0-9]$/.test(t)) out.push(t.toUpperCase());
    else return value;
  }
  const code = out.join('');
  // A call sign is a short code; a long run of letters is something else.
  return /^[A-Z0-9]{3,9}$/.test(code) ? code : value;
}
