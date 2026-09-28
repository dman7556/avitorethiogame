const { execSync, spawn } = require('child_process');
const { resolve } = require('path');

const webDir = resolve(__dirname, '..', 'apps', 'web');

const child = spawn('npx', ['vite', '--host', '0.0.0.0'], {
  cwd: webDir,
  detached: true,
  stdio: ['ignore', 'pipe', 'pipe'],
  shell: true
});

const logFile = require('fs').createWriteStream(resolve(__dirname, 'vite.log'));
const errFile = require('fs').createWriteStream(resolve(__dirname, 'vite.err'));

child.stdout.pipe(logFile);
child.stderr.pipe(errFile);
child.unref();

console.log('Vite PID:', child.pid);
