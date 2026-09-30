import { spawn } from 'node:child_process';
import path from 'node:path';
import { root, localDatabase, prepare } from './runtime.mjs';
import { startInbox } from './local-inbox.mjs';
const children = []; let runtime; let closeInbox; let stopping = false;
async function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const child of children) child.kill(); closeInbox?.();
  await Promise.all(children.map(child => child.exitCode !== null ? Promise.resolve() : new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 5000); })));
  if (runtime) await runtime.pg.stop(); process.exit(code);
}
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
try {
  runtime = await localDatabase(); await prepare(runtime.env); closeInbox = await startInbox();
  for (const [file, args, cwd] of [
    ['backend/src/server.js', [], root],
    ['lab/fixtures/server.mjs', [], root],
    ['frontend/node_modules/vite/bin/vite.js', ['--host', '127.0.0.1', '--port', '5173', '--strictPort'], path.join(root, 'frontend')],
  ]) {
    const child = spawn(process.execPath, [path.join(root, file), ...args], { cwd, env: runtime.env, stdio: 'inherit', windowsHide: true });
    children.push(child); child.once('error', error => { console.error(error.message); stop(1); }); child.once('exit', code => { if (!stopping) stop(code || 1); });
  }
  console.log('\nShopLab: http://localhost:5173\nLocal reset inbox: http://localhost:8025\nDemo accounts: admin@shoplab.local / user1@shoplab.local / user2@shoplab.local\nLocal-only password: Password123!\nCtrl+C stops all services.');
} catch (error) { console.error(error.message); await stop(1); }
