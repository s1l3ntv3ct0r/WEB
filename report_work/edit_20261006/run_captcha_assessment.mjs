import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { root, localDatabase, prepare, run } from '../../scripts/runtime.mjs';

const work = path.dirname(fileURLToPath(import.meta.url));
const evidence = path.join(root, 'pentest/runs/captcha-assessment-20261006-r2');
const selectedSources = [
  'backend/src/modules/auth/auth.routes.js', 'backend/src/modules/auth/login-captcha.js',
  'frontend/src/pages/auth/AuthPage.jsx', 'backend/prisma/schema.prisma',
  'backend/prisma/migrations/202609300001_login_captcha/migration.sql',
  'backend/tests/integration/login-captcha.test.js',
];
async function manifest() {
  return Object.fromEntries(await Promise.all(selectedSources.map(async name => [name, crypto.createHash('sha256').update(await fs.readFile(path.join(root, name))).digest('hex')])));
}
let runtime;
let failed = false;
const result = { startedAt: new Date().toISOString(), mode: 'isolated test database and fresh process per suite', target: 'ShopLab Express app via Supertest', sourceBefore: await manifest(), suites: [], cleanup: {} };
await fs.mkdir(evidence, { recursive: true });
if (await fs.stat(path.join(evidence, 'results.json')).catch(() => null)) throw new Error('Evidence already exists; use a new run folder.');
try {
  runtime = await localDatabase(true);
  await prepare(runtime.env, false);
  result.testDatabase = runtime.name;
  await run(path.join(root, 'backend/node_modules/jest/bin/jest.js'), ['--runInBand', 'tests/integration/login-captcha.test.js', '--json', '--outputFile', path.join(evidence, 'jest-results.json')], { cwd: path.join(root, 'backend'), env: { ...runtime.env, NODE_OPTIONS: '--experimental-vm-modules' } });
  for (const suite of ['lifecycle', 'isolation', 'validation', 'rate']) {
    await run(path.join(work, 'captcha_probe.mjs'), [suite, evidence], { env: runtime.env });
    const suiteResult = JSON.parse(await fs.readFile(path.join(evidence, `${suite}.json`), 'utf8'));
    result.suites.push({ name: suite, cases: suiteResult.cases.length, records: suiteResult.records.length, passed: suiteResult.cases.every(c => c.passed) });
  }
} catch (error) {
  failed = true;
  result.error = error?.message || String(error);
} finally {
  if (runtime) {
    try { await runtime.pg.dropDatabase(runtime.name); result.cleanup.testDatabaseDropped = true; }
    catch (error) { failed = true; result.cleanup.error = error.message; }
    try { await runtime.pg.stop(); result.cleanup.testClusterStopped = true; }
    catch (error) { failed = true; result.cleanup.stopError = error.message; }
  }
  result.sourceAfter = await manifest();
  result.sourceUnchanged = JSON.stringify(result.sourceBefore) === JSON.stringify(result.sourceAfter);
  result.finishedAt = new Date().toISOString();
  result.success = !failed && result.sourceUnchanged;
  await fs.writeFile(path.join(evidence, 'results.json'), JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({ success: result.success, suites: result.suites, cleanup: result.cleanup, sourceUnchanged: result.sourceUnchanged }));
process.exitCode = result.success ? 0 : 1;
