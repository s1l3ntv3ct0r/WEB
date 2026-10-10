import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'backend/package.json'));
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { app } = await import('../../backend/src/app.js');
const { db } = await import('../../backend/src/config/database.js');
const [suite, evidence] = process.argv.slice(2);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const password = 'CaptchaAssessment123!';
const email = `captcha_${suite}_a@assessment.local`;
const other = `captcha_${suite}_b@assessment.local`;
const records = [], cases = [];
let activeCase;
const result = { suite, startedAt: new Date().toISOString(), records, cases, notes: ['Known challenge values and expiry timestamps are set only in the disposable test database. No OCR or live waiting for expiry is used.'] };
const keyOf = emailValue => hash(emailValue.trim().toLowerCase());
async function call(route, body) {
  const response = await request(app).post(`/api/auth/${route}`).send(body);
  const entry = { id: `E-CAP-${suite}-${String(records.length + 1).padStart(3, '0')}`, case: activeCase, time: new Date().toISOString(), route: `/api/auth/${route}`, input: { email: body.email, password: body.password ? '[TEST PASSWORD REDACTED]' : undefined, captchaId: body.captchaId, captchaAnswer: body.captchaAnswer ? '[TEST ANSWER REDACTED]' : undefined, fields: Object.keys(body) }, status: response.status, error: response.body.error?.code, hasCaptcha: !!(response.body.captcha || response.body.data?.captcha), captchaId: (response.body.captcha || response.body.data?.captcha)?.id, hasAccessToken: !!response.body.data?.accessToken, setCookie: !!response.headers['set-cookie'], rateLimit: response.headers.ratelimit, retryAfter: response.headers['retry-after'] };
  records.push(entry);
  return response;
}
const login = (body = {}, who = email) => call('login', { email: who, password, ...body });
async function known(who = email, id = 'known-current', answer = 'ABC234') {
  const key = keyOf(who);
  await db.loginAttempt.upsert({ where: { key }, create: { key, failures: 3, expiresAt: new Date(Date.now() + 900000), challengeHash: hash(`${key}:${id}:${answer}`), challengeExpiresAt: new Date(Date.now() + 120000) }, update: { failures: 3, expiresAt: new Date(Date.now() + 900000), challengeHash: hash(`${key}:${id}:${answer}`), challengeExpiresAt: new Date(Date.now() + 120000) } });
  return { captchaId: id, captchaAnswer: answer };
}
async function test(id, title, fn) {
  activeCase = id;
  const start = records.length;
  try { await fn(); cases.push({ id, title, passed: true, evidence: records.slice(start).map(r => r.id) }); }
  catch (error) { cases.push({ id, title, passed: false, evidence: records.slice(start).map(r => r.id), error: error.message }); throw error; }
}
let failed = false;
try {
  const passwordHash = await bcrypt.hash(password, 12);
  for (const [index, address] of [email, other].entries()) {
    await db.user.create({ data: { email: address, username: `cap_${suite}_${index}`, passwordHash, cart: { create: {} } } });
  }
  if (suite === 'lifecycle') {
    await test('CAP-01', 'Third invalid password triggers PNG CAPTCHA', async () => {
      for (let i = 1; i <= 3; i++) {
        const r = await login({ password: 'incorrect' });
        assert.equal(r.status, 401); assert.equal(r.body.error.code, 'LOGIN_FAILED');
        assert.equal(!!r.body.captcha, i === 3); assert.equal(!!r.body.data?.accessToken, false);
        if (i === 3) { assert.match(r.body.captcha.image, /^data:image\/png;base64,/); await fs.writeFile(path.join(evidence, 'captcha-api.png'), Buffer.from(r.body.captcha.image.split(',')[1], 'base64')); }
      }
      assert.equal((await db.loginAttempt.findUnique({ where: { key: keyOf(email) } })).failures, 3);
    });
    await test('CAP-02', 'Correct password without required CAPTCHA is denied', async () => { const r = await login(); assert.equal(r.status, 401); assert.equal(r.body.error.code, 'CAPTCHA_REQUIRED'); assert.equal(r.headers['set-cookie'], undefined); assert.equal(r.body.data?.accessToken, undefined); });
    await test('CAP-03', 'Wrong answer rotates CAPTCHA and does not issue a session', async () => { const c = await known(); const r = await login({ ...c, captchaAnswer: 'WRONG' }); assert.equal(r.status, 401); assert.equal(r.body.error.code, 'CAPTCHA_REQUIRED'); assert.notEqual(r.body.captcha.id, c.captchaId); assert.equal(r.headers['set-cookie'], undefined); });
    await test('CAP-04', 'Expired challenge is denied', async () => { const c = await known(); await db.loginAttempt.update({ where: { key: keyOf(email) }, data: { challengeExpiresAt: new Date(0) } }); const r = await login(c); assert.equal(r.status, 401); assert.equal(r.body.error.code, 'CAPTCHA_REQUIRED'); });
    await test('CAP-05', 'A valid CAPTCHA with an incorrect password is denied and consumed', async () => { const c = await known(); const r = await login({ ...c, password: 'incorrect' }); assert.equal(r.status, 401); assert.equal(r.body.error.code, 'LOGIN_FAILED'); assert.notEqual(r.body.captcha.id, c.captchaId); assert.equal(r.headers['set-cookie'], undefined); const retry = await login(c); assert.equal(retry.status, 401); assert.equal(retry.body.error.code, 'CAPTCHA_REQUIRED'); });
    await test('CAP-06', 'Challenge refresh invalidates the previous answer', async () => { const c = await known(); const r = await call('login-captcha', { email }); assert.equal(r.status, 200); assert.ok(r.body.data.captcha.id); assert.notEqual(r.body.data.captcha.id, c.captchaId); const retry = await login(c); assert.equal(retry.status, 401); assert.equal(retry.body.error.code, 'CAPTCHA_REQUIRED'); });
    await test('CAP-07', 'Trimmed lowercase answer succeeds and resets only its email', async () => { const c = await known(); const r = await login({ ...c, captchaAnswer: '  abc234  ' }); assert.equal(r.status, 200); assert.ok(r.body.data.accessToken); assert.ok(r.headers['set-cookie']); assert.equal(await db.loginAttempt.findUnique({ where: { key: keyOf(email) } }), null); const retry = await login({ password: 'incorrect' }); assert.equal(retry.status, 401); assert.equal(retry.body.captcha, undefined); });
  } else if (suite === 'isolation') {
    await test('CAP-08', 'Successful login of B does not clear the CAPTCHA requirement of A', async () => { await known(); const r = await login({}, other); assert.equal(r.status, 200); assert.equal((await db.loginAttempt.findUnique({ where: { key: keyOf(email) } })).failures, 3); const retry = await login(); assert.equal(retry.status, 401); assert.equal(retry.body.error.code, 'CAPTCHA_REQUIRED'); });
    await test('CAP-09', 'A CAPTCHA cannot be transferred between emails', async () => { const a = await known(email, 'a-current', 'ABC234'); await known(other, 'b-current', 'XYZ789'); const r = await login(a, other); assert.equal(r.status, 401); assert.equal(r.body.error.code, 'CAPTCHA_REQUIRED'); });
    await test('CAP-10', 'Email case and outer spaces do not create another attempt counter', async () => { await known(); const r = await login({}, `  ${email.toUpperCase()}  `); assert.equal(r.status, 401); assert.equal(r.body.error.code, 'CAPTCHA_REQUIRED'); assert.equal((await db.loginAttempt.findUnique({ where: { key: keyOf(email) } })).failures, 3); });
    await test('CAP-11', 'Three concurrent failures are counted without losing updates', async () => { await db.loginAttempt.deleteMany({ where: { key: keyOf(email) } }); const responses = await Promise.all(Array.from({ length: 3 }, () => login({ password: 'incorrect' }))); assert.ok(responses.every(r => r.status === 401)); assert.equal(responses.filter(r => r.body.captcha).length, 1); assert.equal((await db.loginAttempt.findUnique({ where: { key: keyOf(email) } })).failures, 3); });
    await test('CAP-12', 'Expired attempt state permits valid login without CAPTCHA', async () => { await db.loginAttempt.update({ where: { key: keyOf(email) }, data: { expiresAt: new Date(0) } }); const r = await login(); assert.equal(r.status, 200); assert.ok(r.body.data.accessToken); assert.equal(await db.loginAttempt.findUnique({ where: { key: keyOf(email) } }), null); });
  } else if (suite === 'validation') {
    await test('CAP-13', 'CAPTCHA refresh before the threshold returns null', async () => { for (const address of [email, 'unregistered@assessment.local']) { const r = await call('login-captcha', { email: address }); assert.equal(r.status, 200); assert.equal(r.body.data.captcha, null); } });
    await test('CAP-14', 'Malformed fields and oversized CAPTCHA values are rejected', async () => { for (const body of [{ captchaId: 'a'.repeat(101) }, { captchaAnswer: 'a'.repeat(33) }, { role: 'ADMIN' }, { email: 'invalid' }]) { const r = await login(body); assert.equal(r.status, 400); assert.equal(r.body.error.code, 'VALIDATION_ERROR'); assert.equal(r.headers['set-cookie'], undefined); } assert.equal(await db.loginAttempt.findUnique({ where: { key: keyOf(email) } }), null); });
  } else if (suite === 'rate') {
    await test('CAP-15', 'CAPTCHA refresh consumes the same 30 request per 15 minute IP limit as login', async () => { for (let i = 1; i <= 30; i++) { const r = await call('login-captcha', { email }); assert.equal(r.status, 200); } const r = await call('login-captcha', { email }); assert.equal(r.status, 429); assert.equal(r.body.error.code, 'RATE_LIMIT'); assert.match(r.headers.ratelimit, /30-in-15min/); assert.ok(Number(r.headers['retry-after']) > 0); const r2 = await login(); assert.equal(r2.status, 429); assert.equal(r2.body.error.code, 'RATE_LIMIT'); assert.equal(r2.headers['set-cookie'], undefined); });
  } else throw new Error('Unknown suite');
} catch (error) { failed = true; result.error = error.message; }
finally { result.finishedAt = new Date().toISOString(); result.success = !failed; await fs.writeFile(path.join(evidence, `${suite}.json`), JSON.stringify(result, null, 2)); await db.$disconnect(); }
console.log(JSON.stringify({ suite, cases: cases.length, records: records.length, success: !failed }));
process.exitCode = failed ? 1 : 0;
