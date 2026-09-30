import path from 'node:path';
import fs from 'node:fs/promises';
import { root, localDatabase, prepare, run } from './runtime.mjs';
let runtime; let failed = false;
try {
  runtime = await localDatabase(true); await prepare(runtime.env, false);
  await run(path.join(root, 'backend/node_modules/jest/bin/jest.js'), ['--runInBand'], { cwd: path.join(root, 'backend'), env: { ...runtime.env, NODE_OPTIONS: '--experimental-vm-modules' } });
} catch (error) { console.error(error?.message || 'Test runner failed.'); failed = true; }
finally {
  if (runtime) {
    await runtime.pg.dropDatabase(runtime.name);
    await runtime.pg.stop();
    // Only remove this run's generated upload directory, after resolving inside .local.
    const uploadPath = path.resolve(runtime.env.UPLOAD_DIR);
    if (uploadPath.startsWith(path.join(root, '.local') + path.sep)) await fs.rm(uploadPath, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
