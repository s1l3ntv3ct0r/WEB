import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import { db } from '../../config/database.js';

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const lifetime = 15 * 60 * 1000;
async function challenge(key) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const answer = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  const id = crypto.randomBytes(24).toString('hex');
  const letters = [...answer].map((letter, i) => `<text x="${22 + i * 35}" y="${43 + crypto.randomInt(10)}" transform="rotate(${crypto.randomInt(-18, 19)} ${22 + i * 35} 42)">${letter}</text>`).join('');
  const noise = Array.from({ length: 12 }, () => `<path d="M${crypto.randomInt(240)} ${crypto.randomInt(76)} L${crypto.randomInt(240)} ${crypto.randomInt(76)}" stroke="#829aab" opacity=".55"/>`).join('');
  const image = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="76"><rect width="240" height="76" fill="#f1f5f9"/><g font-family="sans-serif" font-size="32" font-weight="bold" fill="#233b50">${letters}</g>${noise}</svg>`)).png().toBuffer();
  return { hash: digest(`${key}:${id}:${answer}`), id, image: `data:image/png;base64,${image.toString('base64')}` };
}

// A database lock serializes attempts for an email across browser tabs and API workers.
export async function loginAttempt({ email, password, captchaId, captchaAnswer }, refreshOnly = false) {
  const key = digest(email);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${parseInt(key.slice(0, 8), 16) | 0})`;
    const now = new Date();
    let state = await tx.loginAttempt.findUnique({ where: { key } });
    if (state && state.expiresAt <= now) {
      await tx.loginAttempt.delete({ where: { key } }); state = null;
    }
    const required = (state?.failures || 0) >= 3;
    const validCaptcha = required && state.challengeHash && state.challengeExpiresAt > now &&
      state.challengeHash === digest(`${key}:${captchaId}:${(captchaAnswer || '').trim().toUpperCase()}`);
    let user;
    if (!refreshOnly && (!required || validCaptcha)) {
      user = await tx.user.findUnique({ where: { email } });
      const valid = await bcrypt.compare(password, user?.passwordHash || '$2b$12$GB/F/q3cb0rcwyUxFPiCBuWubVCF5EtkgCznNvopLsRTJDXdUnR4i');
      if (user?.active && valid) {
        if (state) await tx.loginAttempt.delete({ where: { key } });
        return { user };
      }
      state = await tx.loginAttempt.upsert({ where: { key }, create: { key, failures: 1, expiresAt: new Date(Date.now() + lifetime) }, update: { failures: { increment: 1 }, expiresAt: new Date(Date.now() + lifetime) } });
    }
    if ((state?.failures || 0) < 3) return { code: 'LOGIN_FAILED', message: 'Email or password is incorrect.' };
    const next = await challenge(key);
    await tx.loginAttempt.update({ where: { key }, data: { challengeHash: next.hash, challengeExpiresAt: new Date(Date.now() + 2 * 60 * 1000) } });
    return { code: required && !validCaptcha ? 'CAPTCHA_REQUIRED' : 'LOGIN_FAILED', message: required && !validCaptcha ? 'Enter the characters from the CAPTCHA image. The code may have expired.' : 'Email or password is incorrect. Please complete the CAPTCHA before trying again.', captcha: { id: next.id, image: next.image } };
  }, { timeout: 15000 });
}
