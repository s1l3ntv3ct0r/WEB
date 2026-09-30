import jwt from 'jsonwebtoken';
import { db } from '../config/database.js';
import { config } from '../config/env.js';
import { fail, userSelect } from '../shared/http.js';
export async function authenticate(req, res, next) {
  let claims;
  try { claims = jwt.verify(req.headers.authorization?.replace(/^Bearer /, '') || '', config.secret, { algorithms: ['HS256'], issuer: 'shoplab', audience: 'shoplab-web' }); }
  catch { return fail(401, 'UNAUTHENTICATED', 'Please sign in again.'); }
  const session = await db.session.findUnique({ where: { id: String(claims.sid) }, include: { user: { select: userSelect } } });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.active || String(session.userId) !== claims.sub) fail(401, 'UNAUTHENTICATED', 'Session is no longer active.');
  req.user = session.user; req.sessionId = session.id; next();
}
export function requireAdmin(req, res, next) {
  if (req.user.role !== 'ADMIN') fail(403, 'FORBIDDEN', 'Administrator access required.');
  next();
}
export function sameOrigin(req, res, next) {
  if (!config.allowedOrigins.has(req.headers.origin)) fail(403, 'ORIGIN_REJECTED', 'Request origin is not allowed.');
  next();
}
