/**
 * One-off / maintenance: parse index.html (or js/app.raw.js) for legacy const blocks
 * and emit content/trip-data.json. Run: node scripts/extract-trip-data.mjs [path-to-html]
 */
import fs from 'fs';
import vm from 'vm';

const path = process.argv[2] || 'index.html';
const html = fs.readFileSync(path, 'utf8');

function extractAfterConst(name) {
  const prefix = `const ${name} = `;
  const i = html.indexOf(prefix);
  if (i < 0) throw new Error(`missing const ${name}`);
  let j = i + prefix.length;
  while (/\s/.test(html[j])) j++;
  return j;
}

function matchBalanced(html, start) {
  const open = html[start];
  const close = open === '[' ? ']' : open === '{' ? '}' : null;
  if (!close) throw new Error(`expected [ or { at ${start}, got ${open}`);
  let depth = 0;
  let q = null;
  let esc = false;
  for (let k = start; k < html.length; k++) {
    const c = html[k];
    if (q) {
      if (esc) {
        esc = false;
        continue;
      }
      if (c === '\\') {
        esc = true;
        continue;
      }
      if (c === q) {
        q = null;
        continue;
      }
      continue;
    }
    if (c === '"' || c === "'") {
      q = c;
      continue;
    }
    if (c === open) depth++;
    if (c === close) {
      depth--;
      if (depth === 0) return html.slice(start, k + 1);
    }
  }
  throw new Error('unbalanced bracket');
}

function evalLiteral(js) {
  return vm.runInNewContext(`(${js})`, Object.create(null));
}

const appVer = html.match(/const APP_VERSION = '([^']+)'/);
if (!appVer) throw new Error('APP_VERSION not found');

const names = [
  'VERSIONS',
  'DAYS_TAS1',
  'DAYS_TAS2',
  'DAYS_MELB',
  'STAYS',
  'CHECKLIST',
  'CL_META',
  'COSTS',
  'TIPS',
];

const out = {
  appVersion: appVer[1],
  versions: evalLiteral(matchBalanced(html, extractAfterConst('VERSIONS'))),
  itinerary: {
    tas1: evalLiteral(matchBalanced(html, extractAfterConst('DAYS_TAS1'))),
    tas2: evalLiteral(matchBalanced(html, extractAfterConst('DAYS_TAS2'))),
    melb: evalLiteral(matchBalanced(html, extractAfterConst('DAYS_MELB'))),
  },
  stays: evalLiteral(matchBalanced(html, extractAfterConst('STAYS'))),
  checklist: evalLiteral(matchBalanced(html, extractAfterConst('CHECKLIST'))),
  clMeta: evalLiteral(matchBalanced(html, extractAfterConst('CL_META'))),
  costs: evalLiteral(matchBalanced(html, extractAfterConst('COSTS'))),
  tips: evalLiteral(matchBalanced(html, extractAfterConst('TIPS'))),
};

fs.mkdirSync('content', { recursive: true });
fs.writeFileSync('content/trip-data.json', JSON.stringify(out, null, 2) + '\n', 'utf8');
console.log('Wrote content/trip-data.json (' + (fs.statSync('content/trip-data.json').size / 1024).toFixed(1) + ' KB)');
