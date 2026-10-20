// Runs the sync server and the Vite dev server side by side.
import { spawn } from 'node:child_process';

const procs = [
  spawn('npm', ['run', 'dev:server'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill('SIGTERM'));
procs.forEach((p) => p.on('exit', (code) => { stop(); process.exit(code ?? 0); }));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
