import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../../config/database.js';
import { config } from '../../config/env.js';
import { ok, audit } from '../../shared/http.js';
import { authenticate, sameOrigin } from '../../middleware/auth.js';
import { createSession, refresh, forgotPassword, resetPassword, hashToken } from './auth.service.js';
import { loginAttempt } from './login-captcha.js';
const router = Router();
export const passwordSchema = z.string().min(12).max(72).refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password must fit within 72 UTF-8 bytes.');
const email = z.string().trim().toLowerCase().email().max(254);
const cookie = { httpOnly: true, secure: config.secureCookie, sameSite: 'strict', path: '/api/auth', maxAge: 7 * 86400000 };
const limiter = rateLimit({ windowMs: 15 * 60000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false, handler: (req, res) => res.status(429).json({ success: false, error: { code: 'RATE_LIMIT', message: 'Too many attempts. Try again later.' }, requestId: req.requestId }) });
const sendSession = (res, result) => { res.cookie('shoplab_refresh', result.token, cookie); return ok(res, { accessToken: result.accessToken, user: result.user }); };
router.post('/register', limiter, async (req, res) => {
  const data = z.object({ email, username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/), password: passwordSchema }).strict().parse(req.body);
  const user = await db.user.create({ data: { email: data.email, username: data.username, passwordHash: await bcrypt.hash(data.password, 12), cart: { create: {} } } });
  return sendSession(res, await createSession(user));
});
router.post('/login', limiter, async (req, res) => {
  const data = z.object({ email, password: z.string().min(1).max(200), captchaId: z.string().max(100).optional(), captchaAnswer: z.string().max(32).optional() }).strict().parse(req.body);
  const result = await loginAttempt(data);
  if (!result.user) return res.status(401).json({ success: false, error: { code: result.code, message: result.message }, captcha: result.captcha, requestId: req.requestId });
  const user = result.user;
  req.user = user; await audit(db, req, 'LOGIN', user.id);
  return sendSession(res, await createSession(user));
});
router.post('/login-captcha', limiter, async (req, res) => {
  const data = z.object({ email }).strict().parse(req.body);
  const result = await loginAttempt(data, true);
  return ok(res, { captcha: result.captcha || null });
});
router.post('/refresh', sameOrigin, async (req, res) => sendSession(res, await refresh(req.cookies.shoplab_refresh)));
router.post('/logout', sameOrigin, async (req, res) => {
  if (typeof req.cookies.shoplab_refresh === 'string') {
    const token = await db.refreshToken.findUnique({ where: { tokenHash: hashToken(req.cookies.shoplab_refresh) } });
    if (token) await db.session.update({ where: { id: token.sessionId }, data: { revokedAt: new Date() } });
  }
  res.clearCookie('shoplab_refresh', { ...cookie, maxAge: undefined }); ok(res, { message: 'Signed out.' });
});
router.get('/me', authenticate, (req, res) => ok(res, req.user));
router.post('/forgot-password', limiter, async (req, res) => {
  const data = z.object({ email }).strict().parse(req.body);
  await forgotPassword(data.email); ok(res, { message: 'If this account exists, a reset link will be sent to its inbox.' });
});
router.post('/reset-password', limiter, async (req, res) => {
  const data = z.object({ token: z.string().min(20).max(200), password: passwordSchema }).strict().parse(req.body);
  await resetPassword(data.token, data.password); ok(res, { message: 'Password updated. Please sign in.' });
});
export default router;
