#!/usr/bin/env node
/**
 * Fetches OpenFlights airports.dat and writes content/airports.json
 * (IATA airports only: code, city, name).
 */
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createInterface } from 'readline';
import { get } from 'https';

function parseCsvFields(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const url =
  'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat';

const req = await new Promise((resolve, reject) => {
  get(url, (r) => {
    if (r.statusCode === 301 || r.statusCode === 302) {
      get(r.headers.location, resolve).on('error', reject);
      r.resume();
      return;
    }
    resolve(r);
  }).on('error', reject);
});

if (req.statusCode !== 200) {
  console.error('HTTP', req.statusCode);
  process.exit(1);
}

const rl = createInterface({ input: req, crlfDelay: Infinity });
const seen = new Set();
const rows = [];

for await (const line of rl) {
  if (!line.trim()) continue;
  const f = parseCsvFields(line);
  const iata = (f[4] || '').trim();
  if (!/^[A-Z]{3}$/.test(iata)) continue;
  if (seen.has(iata)) continue;
  seen.add(iata);
  const city = (f[2] || '').trim() || iata;
  const name = (f[1] || '').trim() || city;
  rows.push([iata, city, name]);
}

rows.sort((a, b) => a[0].localeCompare(b[0]));

const outPath = new URL('../content/airports.json', import.meta.url);
const tmp = outPath.pathname + '.tmp';
const stream = createWriteStream(tmp, { encoding: 'utf8' });
stream.write('{"v":1,"a":');
stream.write(JSON.stringify(rows));
stream.write('}\n');
await new Promise((resolve, reject) => {
  stream.end((e) => (e ? reject(e) : resolve()));
});

const { renameSync } = await import('fs');
renameSync(tmp, outPath.pathname);
console.log('Wrote', rows.length, 'airports to', outPath.pathname);
