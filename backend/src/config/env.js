import 'dotenv/config';
import path from 'node:path';
export function frontendOrigins(frontendUrl) {
  const url = new URL(frontendUrl);
  const origins = new Set([url.origin]);
  // Both names reach the local lab. Keep the configured protocol and port exact.
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    for (const hostname of ['localhost', '127.0.0.1', '[::1]']) {
      const alias = new URL(url.origin); alias.hostname = hostname; origins.add(alias.origin);
    }
  }
  return origins;
}
export const config = {
  port: Number(process.env.PORT || 4000),
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  secret: process.env.JWT_SECRET,
  secureCookie: process.env.COOKIE_SECURE === 'true',
  uploads: path.resolve(process.env.UPLOAD_DIR || './uploads'),
};
config.allowedOrigins = frontendOrigins(config.origin);
if (!config.secret || config.secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters. Run the local setup or configure .env.');
