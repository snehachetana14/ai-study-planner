// Starts the API (port 5000) and the React dev server (port 5173) together: `npm run dev`
const { spawn } = require('node:child_process');
const path = require('node:path');

const isWindows = process.platform === 'win32';
const children = [];

function run(name, folder) {
  const child = spawn(isWindows ? 'npm.cmd' : 'npm', ['run', 'dev'], {
    cwd: path.join(__dirname, '..', folder),
    stdio: 'inherit',
    shell: isWindows,
  });
  child.on('exit', (code) => {
    console.log(`[${name}] stopped (exit code ${code})`);
    for (const c of children) if (c !== child) c.kill();
    process.exit(code || 0);
  });
  children.push(child);
}

run('server', 'server');
run('client', 'client');
console.log('\nOpen http://localhost:5173 in your browser. Press Ctrl+C to stop both.\n');

process.on('SIGINT', () => {
  for (const c of children) c.kill();
  process.exit(0);
});
