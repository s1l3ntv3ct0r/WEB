import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import EmbeddedPostgres from 'embedded-postgres';
import getBinaries from '../node_modules/embedded-postgres/dist/binary.js';
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function run(file, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], { cwd: root, stdio: 'inherit', windowsHide: true, ...options });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(file)} exited with ${code}`)));
  });
}
export async function localDatabase(test = false) {
  const base = path.join(root, '.local'); await fs.mkdir(base, { recursive: true });
  const settingsFile = path.join(base, test ? 'test-settings.json' : 'settings.json');
  let settings;
  try { settings = JSON.parse(await fs.readFile(settingsFile, 'utf8')); } catch (e) {
    if (e.code !== 'ENOENT') throw e;
    settings = { password: crypto.randomBytes(24).toString('hex'), secret: crypto.randomBytes(48).toString('hex') };
    await fs.writeFile(settingsFile, JSON.stringify(settings), { mode: 0o600 });
  }
  const port = test ? 55433 : 55432;
  const directory = path.join(base, test ? 'postgres-test' : 'postgres');
  let diagnostic = '';
  const pg = new EmbeddedPostgres({ databaseDir: directory, user: 'shoplab', password: settings.password, authMethod: 'scram-sha-256', port, persistent: true, postgresFlags: ['-c', 'listen_addresses=127.0.0.1'], onLog: message => { diagnostic = (diagnostic + String(message)).slice(-6000); }, onError: message => console.error(String(message)) });
  if (process.platform === 'win32') {
    // The pinned helper uses taskkill /f on Windows, which can leave PG18 I/O workers behind.
    // Use pg_ctl's graceful fast shutdown for this instance, including its exit hook.
    pg.stop = async () => {
      if (!pg.process || pg.process.exitCode !== null) { pg.process = undefined; return; }
      const { pg_ctl } = await getBinaries();
      await new Promise((resolve, reject) => {
        const child = spawn(pg_ctl, ['stop', '-D', directory, '-m', 'fast', '-w', '-t', '15'], { windowsHide: true, stdio: 'ignore' });
        child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('PostgreSQL did not shut down cleanly. Inspect the local cluster before restarting.')));
      });
      pg.process = undefined;
    };
  }
  try { await fs.access(path.join(directory, 'PG_VERSION')); } catch { await pg.initialise(); }
  try { await pg.start(); } catch (error) { throw new Error(`PostgreSQL could not start on port ${port}: ${error?.message || diagnostic}`); }
  const name = test ? `shoplab_test_${Date.now()}` : 'shoplab';
  const client = pg.getPgClient();
  try {
    await client.connect();
    const existing = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (!existing.rowCount) await pg.createDatabase(name);
  } catch (error) { await pg.stop(); throw error; }
  finally { await client.end(); }
  const env = { ...process.env, DATABASE_URL: `postgresql://shoplab:${settings.password}@127.0.0.1:${port}/${name}`, JWT_SECRET: settings.secret, FRONTEND_URL: 'http://localhost:5173', PORT: '4000', UPLOAD_DIR: path.join(base, test ? `uploads-${name}` : 'uploads'), SMTP_HOST: '127.0.0.1', SMTP_PORT: '1025', IMPORT_ALLOWED_ORIGINS: 'http://127.0.0.1:4101', NODE_ENV: test ? 'test' : 'development' };
  return { pg, env, name };
}
export async function prepare(env, seed = true) {
  const prisma = path.join(root, 'backend/node_modules/prisma/build/index.js');
  const require = createRequire(path.join(root, 'backend/package.json'));
  const generatedSchema = path.resolve(path.dirname(require.resolve('@prisma/client/package.json')), '../../.prisma/client/schema.prisma');
  const source = await fs.readFile(path.join(root, 'backend/prisma/schema.prisma'), 'utf8');
  const generated = await fs.readFile(generatedSchema, 'utf8').catch(() => '');
  // Windows locks the loaded query-engine DLL. Do not regenerate an unchanged client while dev is running.
  if (source.replace(/\s/g, '') !== generated.replace(/\s/g, '')) await run(prisma, ['generate'], { cwd: path.join(root, 'backend'), env });
  await run(prisma, ['migrate', 'deploy'], { cwd: path.join(root, 'backend'), env });
  if (seed) await run(path.join(root, 'backend/prisma/seed.js'), [], { env });
}
