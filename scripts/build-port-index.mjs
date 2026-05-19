import { readFileSync, writeFileSync } from 'fs';

// Minimal RFC 4180 CSV parser.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const csv = readFileSync('/tmp/wpi.csv', 'utf8').replace(/^﻿/, '');
const rows = parseCsv(csv);
const header = rows[0].map(h => h.trim());
const idx = (k) => header.indexOf(k);

const cName = idx('Main Port Name');
const cCountry = idx('Country Code');
const cLocode = idx('UN/LOCODE');
const cId = idx('World Port Index Number');
const cLat = idx('Latitude');
const cLon = idx('Longitude');

const slim = [];
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  if (!r || r.length < cLon + 1) continue;
  const lat = parseFloat(r[cLat]);
  const lon = parseFloat(r[cLon]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;
  const name = (r[cName] || '').trim();
  if (!name) continue;
  slim.push({
    id: Number(r[cId]) || 0,
    name,
    country: (r[cCountry] || '').trim() || null,
    unlocode: ((r[cLocode] || '').trim().replace(/\s+/g, '')) || null,
    lat,
    lon,
  });
}

const json = JSON.stringify(slim);
writeFileSync('/tmp/world-ports.json', json);
console.log(`CSV rows (incl. header): ${rows.length}`);
console.log(`Valid ports parsed: ${slim.length}`);
console.log(`JSON size: ${(Buffer.byteLength(json) / 1024).toFixed(1)} KB`);
console.log('Samples:');
console.log(JSON.stringify(slim.slice(0, 2), null, 2));
console.log('...');
console.log(JSON.stringify(slim.find(p => p.unlocode === 'USHNL') || slim[1500], null, 2));
