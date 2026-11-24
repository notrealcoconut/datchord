import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve('src/i18n/locales');
const canonicalFile = 'en.json';
const locales = fs
  .readdirSync(dir)
  .filter((name) => name.endsWith('.json'))
  .sort();

function flatten(value, prefix = '', target = new Map()) {
  for (const [key, entry] of Object.entries(value)) {
    const next = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      flatten(entry, next, target);
    } else {
      target.set(next, String(entry));
    }
  }
  return target;
}

function baseKey(key) {
  return key.replace(/_(zero|one|two|few|many|other)$/, '');
}

function placeholders(text) {
  return new Set(Array.from(text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g), (match) => match[1]));
}

function groupByBase(entries) {
  const grouped = new Map();
  for (const [key, text] of entries) {
    const base = baseKey(key);
    if (!grouped.has(base)) grouped.set(base, { keys: new Set(), placeholders: new Set() });
    const group = grouped.get(base);
    group.keys.add(key);
    for (const placeholder of placeholders(text)) group.placeholders.add(placeholder);
  }
  return grouped;
}

const canonical = groupByBase(flatten(JSON.parse(fs.readFileSync(path.join(dir, canonicalFile), 'utf8'))));
let failures = 0;

for (const locale of locales) {
  if (locale === canonicalFile) continue;
  const file = path.join(dir, locale);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`✗ ${locale}: invalid JSON — ${error.message}`);
    failures += 1;
    continue;
  }
  const entries = groupByBase(flatten(parsed));
  const missing = [...canonical.keys()].filter((key) => !entries.has(key));
  const extra = [...entries.keys()].filter((key) => !canonical.has(key));
  const placeholderIssues = [];
  for (const [key, group] of canonical) {
    const translated = entries.get(key);
    if (!translated) continue;
    const missingPlaceholders = [...group.placeholders].filter((name) => !translated.placeholders.has(name));
    const extraPlaceholders = [...translated.placeholders].filter((name) => !group.placeholders.has(name));
    if (missingPlaceholders.length || extraPlaceholders.length) {
      placeholderIssues.push(
        `${key} (missing: ${missingPlaceholders.join(', ') || 'none'}; extra: ${extraPlaceholders.join(', ') || 'none'})`,
      );
    }
  }
  const problems = missing.length + extra.length + placeholderIssues.length;
  if (problems === 0) {
    console.log(`✓ ${locale}: ${entries.size} keys match ${canonicalFile}`);
    continue;
  }
  failures += 1;
  console.error(`✗ ${locale}`);
  if (missing.length) console.error(`  missing keys: ${missing.join(', ')}`);
  if (extra.length) console.error(`  extra keys: ${extra.join(', ')}`);
  if (placeholderIssues.length) console.error(`  placeholders: ${placeholderIssues.join('; ')}`);
}

if (failures > 0) {
  console.error(`\n${failures} locale(s) need attention.`);
  process.exitCode = 1;
} else {
  console.log(`\nAll ${locales.length} locales are consistent.`);
}
