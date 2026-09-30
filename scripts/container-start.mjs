import { spawnSync } from 'node:child_process';
for (const args of [
  ['backend/node_modules/prisma/build/index.js','migrate','deploy','--schema','backend/prisma/schema.prisma'],
  ...(process.env.SEED_DEMO === 'true' ? [['backend/prisma/seed.js']] : []),
]) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (result.status !== 0) process.exit(result.status || 1);
}
await import('../backend/src/server.js');
