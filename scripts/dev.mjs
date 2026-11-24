import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const children = [];

function run(label, command, args, env) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: 'inherit',
    windowsHide: false,
  });
  child.on('exit', (code) => {
    if (code && code !== 0) console.error(`${label} exited with code ${code}`);
    shutdown(code || 0);
  });
  children.push(child);
  return child;
}

let shuttingDown = false;
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
    }
  }
  setTimeout(() => process.exit(code), 150);
}

run('API', process.execPath, ['--watch', 'server/index.js'], { PORT: '3001', NODE_ENV: 'development' });
run('Web', process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js')], { NODE_ENV: 'development' });

console.log('\n  Datchord dev');
console.log('  Web: http://localhost:5173');
console.log('  API: http://localhost:3001\n');

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
