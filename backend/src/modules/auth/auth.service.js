import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import { db, transaction } from '../../config/database.js';
import { config } from '../../config/env.js';
import { fail, userSelect } from '../../shared/http.js';
export const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
const randomToken = () => crypto.randomBytes(32).toString('base64url');
export const publicUser = user => Object.fromEntries(Object.keys(userSelect).map(key => [key, user[key]]));
function access(user, sessionId) {
  return jwt.sign({ sid: sessionId }, config.secret, { subject: String(user.id), expiresIn: '30m', issuer: 'shoplab', audience: 'shoplab-web', algorithm: 'HS256' });
}
export async function createSession(user) {
  const token = randomToken(); const expiresAt = new Date(Date.now() + 7 * 86400000);
  const session = await db.session.create({ data: { userId: user.id, expiresAt, tokens: { create: { tokenHash: hashToken(token), expiresAt } } } });
  return { token, accessToken: access(user, session.id), user: publicUser(user) };
}
export async function refresh(token) {
  if (!token || typeof token !== 'string') fail(401, 'INVALID_REFRESH', 'Please sign in again.');
  const nextToken = randomToken();
  const result = await transaction(async tx => {
    const record = await tx.refreshToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { session: { include: { user: true } } } });
    if (!record) return null;
    const session = record.session;
    if (record.consumedAt) {
      await tx.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
      return null;
    }
    if (session.revokedAt || session.expiresAt <= new Date() || record.expiresAt <= new Date() || !session.user.active) return null;
    await tx.refreshToken.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    await tx.refreshToken.create({ data: { sessionId: session.id, tokenHash: hashToken(nextToken), expiresAt: session.expiresAt } });
    return { token: nextToken, accessToken: access(session.user, session.id), user: publicUser(session.user) };
  });
  if (!result) fail(401, 'INVALID_REFRESH', 'Please sign in again.');
  return result;
}
export async function forgotPassword(email) {
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.active) return;
  const token = randomToken();
  await transaction(async tx => {
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    await tx.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 30 * 60000) } });
  });
  const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || '127.0.0.1', port: Number(process.env.SMTP_PORT || 1025), secure: false, connectionTimeout: 3000, socketTimeout: 5000 });
  try { await transport.sendMail({ from: 'ShopLab <noreply@shoplab.local>', to: user.email, subject: 'Reset your ShopLab password', text: `This link expires in 30 minutes: ${config.origin}/reset-password?token=${token}` }); }
  catch { console.warn('Password reset email unavailable; start the local SMTP inbox.'); }
}
export async function resetPassword(token, password) {
  const passwordHash = await bcrypt.hash(password, 12);
  await transaction(async tx => {
    const record = await tx.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (!record || record.usedAt || record.expiresAt <= new Date() || !record.user.active) fail(400, 'INVALID_RESET', 'Reset link is invalid or expired.');
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await tx.session.updateMany({ where: { userId: record.userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: record.userId, action: 'PASSWORD_RESET' } });
  });
}
