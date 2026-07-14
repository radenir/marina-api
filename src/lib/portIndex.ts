/**
 * Port lookup against the NGA World Port Index (WPI), version Pub 150.
 *
 * Data sits at public/data/world-ports.json — about 3,800 commercial /
 * military ports worldwide with lat/lon. Small enough (~380 KB) that we
 * load it into memory at startup and linear-scan on every lookup. For
 * this size a KD-tree or PostGIS index buys nothing — a single request
 * does ~3,800 cheap distance calcs, sub-millisecond.
 *
 * Refresh the data with `node scripts/build-port-index.mjs` (the script
 * downloads UpdatedPub150.csv from NGA and rebuilds the JSON).
 */

import { readFileSync } from 'fs';
import { join } from 'path';

export interface Port {
  id: number;
  name: string;
  /** English / common alias when the primary `name` is in a local language (e.g. "Copenhagen" for "Kobenhavn"). */
  alt_name: string | null;
  country: string | null;
  unlocode: string | null;
  lat: number;
  lon: number;
}

export interface NearestPort extends Port {
  /** Great-circle distance from the query point, km. */
  distance_km: number;
}

let PORTS: Port[] | null = null;

function load(): Port[] {
  if (PORTS) return PORTS;
  const path = join(process.cwd(), 'public/data/world-ports.json');
  PORTS = JSON.parse(readFileSync(path, 'utf8')) as Port[];
  return PORTS;
}

/**
 * Normalise for matching: strip diacritics and upper-case, so a spoken/typed
 * "Gdańsk" matches the index's ASCII "Gdansk" (→ PLGDN). Unlocodes are ASCII,
 * so folding them is a harmless no-op.
 */
function fold(s: string): string {
  return s.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
}

/** Haversine distance in km. */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // earth radius km
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Return the `limit` nearest ports to (lat, lon), sorted by distance ascending.
 * Returns an empty array if no ports lie within `maxKm` (defaults to no cap).
 */
export function findNearestPorts(
  lat: number,
  lon: number,
  limit = 5,
  maxKm = Infinity,
): NearestPort[] {
  const ports = load();
  const result: NearestPort[] = [];
  for (const p of ports) {
    const distance_km = haversineKm(lat, lon, p.lat, p.lon);
    if (distance_km > maxKm) continue;
    result.push({ ...p, distance_km });
  }
  result.sort((a, b) => a.distance_km - b.distance_km);
  return result.slice(0, limit);
}

/** Total number of ports indexed — useful for /health-style checks. */
export function portCount(): number {
  return load().length;
}

/**
 * Substring/code search across the port index. Returns top matches sorted by
 * a simple relevance score: exact LOCODE > LOCODE prefix > name starts-with >
 * name substring. Case-insensitive. Empty query returns [].
 */
export function searchPorts(query: string, limit = 10): Port[] {
  const ports = load();
  const q = fold(query);
  if (!q) return [];

  const scored: { port: Port; score: number }[] = [];
  for (const p of ports) {
    const code = fold(p.unlocode || '');
    const name = fold(p.name);
    const alt = fold(p.alt_name || '');
    let score = 0;
    if (code === q) score = 100;
    else if (code.startsWith(q)) score = 80;
    else if (name === q || alt === q) score = 70;
    else if (name.startsWith(q) || alt.startsWith(q)) score = 60;
    else if (name.includes(q) || alt.includes(q)) score = 40;
    else if (code.includes(q)) score = 30;
    if (score > 0) scored.push({ port: p, score });
  }
  scored.sort((a, b) => b.score - a.score || a.port.name.localeCompare(b.port.name));
  return scored.slice(0, limit).map(s => s.port);
}
