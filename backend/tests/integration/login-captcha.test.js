import request from 'supertest';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { app } from '../../src/app.js';
import { db } from '../../src/config/database.js';
const email = 'captcha@test.local';
const password = 'Password123!';
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const key = hash(email);
const login = body => request(app).post('/api/auth/login').send({ email, password, ...body });
async function knownChallenge() {
  await db.loginAttempt.update({ where: { key }, data: { challengeHash: hash(`${key}:test-id:ABC234`), challengeExpiresAt: new Date(Date.now() + 120000) } });
  return { captchaId: 'test-id', captchaAnswer: 'abc234' };
}
beforeAll(async () => {
  await db.user.create({ data: { email, username: 'captcha_test', passwordHash: await bcrypt.hash(password, 12) } });
});
afterAll(async () => { await db.$disconnect(); });
test('third failure shows CAPTCHA; direct API calls cannot bypass it; success resets failures', async () => {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await login({ password: 'wrong' });
    expect(response.status).toBe(401);
    if (attempt < 3) expect(response.body.captcha).toBeUndefined();
    else expect(response.body.captcha.image).toMatch(/^data:image\/png;base64,/);
  }
  const missing = await login({});
  expect(missing.status).toBe(401); expect(missing.body.error.code).toBe('CAPTCHA_REQUIRED');
  expect(missing.headers['set-cookie']).toBeUndefined();
  const invalid = await login({ captchaId: missing.body.captcha.id, captchaAnswer: 'wrong' });
  expect(invalid.status).toBe(401);
  expect(invalid.body.captcha.id).not.toBe(missing.body.captcha.id);
  const expired = await knownChallenge();
  await db.loginAttempt.update({ where: { key }, data: { challengeExpiresAt: new Date(0) } });
  expect((await login(expired)).status).toBe(401);
  const used = await knownChallenge();
  expect((await login({ ...used, password: 'wrong' })).status).toBe(401);
  expect((await login(used)).status).toBe(401);
  const good = await knownChallenge();
  const success = await login(good);
  expect(success.status).toBe(200); expect(success.body.data.accessToken).toBeTruthy();
  expect(await db.loginAttempt.findUnique({ where: { key } })).toBeNull();
  expect((await login({ password: 'wrong' })).body.captcha).toBeUndefined();
});
test('parallel failures are counted and expired lockout is cleared', async () => {
  await db.loginAttempt.deleteMany({ where: { key } });
  const results = await Promise.all(Array.from({ length: 3 }, () => login({ password: 'wrong' })));
  expect(results.filter(r => r.body.captcha)).toHaveLength(1);
  expect((await db.loginAttempt.findUnique({ where: { key } })).failures).toBe(3);
  const refreshed = await request(app).post('/api/auth/login-captcha').send({ email });
  expect(refreshed.body.data.captcha.id).toBeTruthy();
  await db.loginAttempt.update({ where: { key }, data: { expiresAt: new Date(0) } });
  expect((await login({})).status).toBe(200);
});
