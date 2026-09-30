import { app } from './app.js';
import { config } from './config/env.js';
import { db } from './config/database.js';
await db.$connect();
const server = app.listen(config.port, process.env.BIND_HOST || '127.0.0.1', () => console.log(`ShopLab API listening on port ${config.port}`));
async function stop() { server.close(async () => { await db.$disconnect(); process.exit(0); }); }
process.on('SIGTERM', stop); process.on('SIGINT', stop);
