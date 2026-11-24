import { existsSync, readdirSync, rmSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'data');
const uploadsDir = path.join(dataDir, 'uploads');

for (const file of ['datchord.db', 'datchord.db-wal', 'datchord.db-shm']) {
  const target = path.join(dataDir, file);
  if (existsSync(target)) {
    unlinkSync(target);
    console.log(`Removed ${path.relative(root, target)}`);
  }
}

if (existsSync(uploadsDir)) {
  for (const file of readdirSync(uploadsDir)) {
    const target = path.join(uploadsDir, file);
    try {
      rmSync(target, { force: true });
    } catch {
      /* ignore */
    }
  }
  console.log('Cleared uploaded files');
}

console.log('Datchord data reset. A clean workspace will be created on next start.');
