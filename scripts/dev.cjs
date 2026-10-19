const { spawn } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

const children = [];

function start(label, args, cwd = root) {
  const opts = { cwd, stdio: 'inherit', env: { ...process.env } };
  let child;
  if (process.env.npm_execpath) {
    child = spawn(process.execPath, [process.env.npm_execpath, ...args], opts);
  } else {
    child = spawn(npmCmd, args, { ...opts, shell: true });
  }
  children.push(child);
  child.on('exit', (code, signal) => {
    console.log(`[${label}] stopped (${signal || 'code ' + code})`);
    shutdown();
  });
}

function shutdown() {
  for (const child of children) {
    if (child && !child.killed) child.kill();
  }
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('Starting Fortune Sacco API on http://localhost:5000/api');
console.log('Starting Admin Review Portal at http://localhost:5176');
console.log('Press Ctrl+C to stop both.');

start('API', ['run', 'start:dev'], path.join(root, 'backend'));
start('ADMIN', ['run', 'dev'], root);