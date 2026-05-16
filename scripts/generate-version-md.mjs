/**
 * Writes VERSION.md from content/trip-data.json (versions[] + appVersion).
 * Run from repo root: node scripts/generate-version-md.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const tripPath = join(root, 'content', 'trip-data.json');
const data = JSON.parse(readFileSync(tripPath, 'utf8'));
const versions = [...data.versions].reverse();

let out = `# Triple — version history\n\n`;
out += `**Shipped app version:** \`${data.appVersion}\` (must match \`content/trip-data.json\` → \`appVersion\`).\n\n`;
out += `This file lists every shipped version from newest to oldest. The **source of truth** is \`content/trip-data.json\` → \`versions\` (same strings power the in-app changelog, sidebar version pill, and “What’s new”).\n\n`;
out += `After editing \`versions\` in JSON, regenerate this file:\n\n`;
out += `\`\`\`bash\nnode scripts/generate-version-md.mjs\n\`\`\`\n\n`;
out += `---\n\n`;

for (const v of versions) {
  const tag = v.latest ? ' **· current release**' : '';
  out += `## ${v.v} — ${v.date}${tag}\n\n`;
  out += `### ${v.title}\n\n`;
  for (const c of v.changes) {
    out += `- ${c}\n`;
  }
  out += `\n`;
}

writeFileSync(join(root, 'VERSION.md'), out, 'utf8');
console.log(`Wrote VERSION.md (${versions.length} versions, app ${data.appVersion})`);
