import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;
const releaseRoot = path.join(root, 'release');
const stage = path.join(releaseRoot, `datchord-${version}`);
const zipPath = path.join(releaseRoot, `datchord-${version}.zip`);

console.log(`\nBuilding Datchord ${version}...`);
execSync(process.platform === 'win32' ? 'npm.cmd run build' : 'npm run build', {
  cwd: root,
  stdio: 'inherit',
});

console.log('\nPreparing portable release...');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

for (const entry of ['dist', 'server']) {
  const source = path.join(root, entry);
  if (!existsSync(source)) throw new Error(`Missing ${entry}; run the build first.`);
  cpSync(source, path.join(stage, entry), { recursive: true });
}

cpSync(path.join(root, 'README.md'), path.join(stage, 'README.md'));
for (const file of ['Datchord.bat', 'datchord.sh', 'LEEME.txt']) {
  cpSync(path.join(root, 'packaging', file), path.join(stage, file));
}

writeFileSync(
  path.join(stage, 'package.json'),
  `${JSON.stringify(
    {
      name: pkg.name,
      version,
      private: true,
      type: 'module',
      description: 'Datchord portable build',
      scripts: { start: 'node server/index.js' },
      engines: { node: '>=24' },
    },
    null,
    2,
  )}\n`,
);

rmSync(zipPath, { force: true });
if (process.platform === 'win32') {
  execFileSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${stage.replace(/'/g, "''")}' -DestinationPath '${zipPath.replace(/'/g, "''")}' -Force`,
    ],
    { stdio: 'inherit' },
  );
} else {
  execFileSync('zip', ['-r', zipPath, path.basename(stage)], {
    cwd: releaseRoot,
    stdio: 'inherit',
  });
}

const digest = createHash('sha256').update(readFileSync(zipPath)).digest('hex');
const checksumPath = `${zipPath}.sha256`;
writeFileSync(checksumPath, `${digest}  ${path.basename(zipPath)}\n`);

console.log('\nCreated:');
console.log(`  ${zipPath}`);
console.log(`  ${checksumPath}`);
