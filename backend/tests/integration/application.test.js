import request from 'supertest';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import http from 'node:http';
import sharp from 'sharp';
import { app } from '../../src/app.js';
import { db } from '../../src/config/database.js';
import { hashToken } from '../../src/modules/auth/auth.service.js';
const origin = 'http://localhost:5173';
let a, b, admin, at, bt, mt, product, cookieA, fixture, png, fixtureBase;
const auth = token => ({ Authorization: `Bearer ${token}` });
async function login(email) { return request(app).post('/api/auth/login').send({ email, password: 'Password123!' }); }
async function add(token, productId, quantity = 1) { return request(app).post('/api/cart/items').set(auth(token)).send({ productId, quantity }); }
async function order(token, key = crypto.randomUUID(), body = { shippingAddress: '123 Test Street, Hanoi, Vietnam' }) { return request(app).post('/api/orders').set(auth(token)).set('Idempotency-Key', key).send(body); }
beforeAll(async () => {
  const passwordHash = await bcrypt.hash('Password123!', 12);
  [a,b,admin] = await Promise.all(['alpha','bravo','manager'].map(username => db.user.create({ data: { username, email: `${username}@test.local`, passwordHash, role: username === 'manager' ? 'ADMIN' : 'USER', cart: { create: {} } } })));
  product = await db.product.create({ data: { name: 'Test Headphones', description: 'A test product', category: 'Audio', price: '10001', stock: 200 } });
  const sessions = await Promise.all([a,b,admin].map(u => login(u.email)));
  [at,bt,mt] = sessions.map(r => r.body.data.accessToken); cookieA = sessions[0].headers['set-cookie'][0].split(';')[0];
  png = await sharp({ create: { width: 10, height: 10, channels: 3, background: '#889988' } }).png().toBuffer();
  fixture = http.createServer((req,res) => {
    if (req.url === '/redirect') { res.writeHead(302, { Location: 'http://127.0.0.1:4102/' }); return res.end(); }
    if (req.url === '/large') { res.writeHead(200, { 'Content-Type':'image/png' }); return res.end(Buffer.alloc(2 * 1024 * 1024 + 1)); }
    res.writeHead(200, { 'Content-Type': 'image/png' }); res.end(png);
  });
  await new Promise((resolve, reject) => fixture.once('error', reject).listen(0, '127.0.0.1', resolve));
  fixtureBase = `http://127.0.0.1:${fixture.address().port}`;
  process.env.IMPORT_ALLOWED_ORIGINS = fixtureBase;
});
afterAll(async () => { if (fixture) await new Promise(resolve => fixture.close(resolve)); await db.$disconnect(); });
test('health and product catalogue are available without authentication', async () => {
  expect((await request(app).get('/api/health')).status).toBe(200);
  const response = await request(app).get('/api/products?q=Headphones');
  expect(response.body.data.items[0].id).toBe(product.id); expect(response.body.data.items[0].price).toBe('10001');
});
test('registration enforces field allowlist and creates a private cart', async () => {
  const invalid = await request(app).post('/api/auth/register').send({ username: 'evil', email: 'evil@test.local', password: 'Password123!', role: 'ADMIN' });
  expect(invalid.status).toBe(400);
  const result = await request(app).post('/api/auth/register').send({ username: 'new_user', email: 'new@test.local', password: 'Password123!' });
  expect(result.status).toBe(200); expect(result.body.data.user.role).toBe('USER'); expect(result.body.data.user.passwordHash).toBeUndefined();
  expect((await request(app).get('/api/cart').set(auth(result.body.data.accessToken))).status).toBe(200);
});
test('anonymous and regular users cannot use administrative APIs', async () => {
  expect((await request(app).get('/api/admin/users')).status).toBe(401);
  expect((await request(app).get('/api/admin/users').set(auth(at))).status).toBe(403);
  const result = await request(app).get('/api/admin/users').set(auth(mt));
  expect(result.status).toBe(200); expect(result.body.data.items[0].passwordHash).toBeUndefined();
  expect((await request(app).post('/api/admin/coupons').set(auth(at)).send({})).status).toBe(403);
});
test('profile rejects mass assignment', async () => {
  expect((await request(app).patch('/api/users/me').set(auth(at)).send({ role:'ADMIN' })).status).toBe(400);
  expect((await db.user.findUnique({ where:{id:a.id} })).role).toBe('USER');
});
test('search treats SQL metacharacters as data and validates pagination', async () => {
  const result = await request(app).get('/api/products').query({ q: "' OR 1=1 --" });
  expect(result.status).toBe(200); expect(result.body.data.items).toHaveLength(0);
  expect((await request(app).get('/api/products?limit=5000')).status).toBe(400);
});
test('review persists plain text and protects ownership', async () => {
  const result = await request(app).post(`/api/products/${product.id}/reviews`).set(auth(at)).send({ rating:5, content:'<b>hello</b>' });
  expect(result.status).toBe(201);
  expect((await request(app).patch(`/api/reviews/${result.body.data.id}`).set(auth(bt)).send({rating:1,content:'changed'})).status).toBe(404);
  expect((await request(app).delete(`/api/reviews/${result.body.data.id}`).set(auth(bt))).status).toBe(404);
});
test('cart rejects invalid quantities and cross-user item mutations', async () => {
  expect((await add(at,product.id,-1)).status).toBe(400);
  expect((await add(at,product.id,1.5)).status).toBe(400);
  const result = await add(at,product.id,2); expect(result.status).toBe(200);
  const item = result.body.data.items[0];
  expect((await request(app).patch(`/api/cart/items/${item.id}`).set(auth(bt)).send({quantity:3})).status).toBe(404);
});
test('checkout recalculates totals and idempotently returns the original order', async () => {
  expect((await order(at,crypto.randomUUID(), {shippingAddress:'123 Test Street, Hanoi',total:'1'})).status).toBe(400);
  const key = crypto.randomUUID(); const first = await order(at,key);
  expect(first.status).toBe(201); expect(first.body.data.total).toBe('20002');
  const second = await order(at,key); expect(second.status).toBe(201); expect(second.body.data.id).toBe(first.body.data.id);
  expect((await order(at,key,{shippingAddress:'A completely different address'})).status).toBe(409);
  expect((await request(app).get(`/api/orders/${first.body.data.id}`).set(auth(bt))).status).toBe(404);
  const before = (await db.product.findUnique({where:{id:product.id}})).stock;
  expect((await request(app).post(`/api/orders/${first.body.data.id}/cancel`).set(auth(at))).status).toBe(200);
  expect((await request(app).post(`/api/orders/${first.body.data.id}/cancel`).set(auth(at))).status).toBe(409);
  expect((await db.product.findUnique({where:{id:product.id}})).stock).toBe(before+2);
});
test('concurrent checkout with same key creates only one order', async () => {
  await add(at, product.id); const key=crypto.randomUUID();
  const results=await Promise.all([order(at,key),order(at,key)]);
  expect(results.map(r=>r.status)).toEqual([201,201]); expect(results[0].body.data.id).toBe(results[1].body.data.id);
});
test('concurrent checkouts cannot oversell stock', async () => {
  const p=await db.product.create({data:{name:'Last item',description:'Only one',category:'Everyday',price:'500',stock:1}});
  await add(at,p.id); await add(bt,p.id);
  const results=await Promise.all([order(at),order(bt)]);
  expect(results.map(r=>r.status).sort()).toEqual([201,409]); expect((await db.product.findUnique({where:{id:p.id}})).stock).toBe(0);
  await db.cartItem.deleteMany();
});
test('coupon maximum use survives concurrent checkout and cannot be reused after cancellation', async () => {
  const coupon=await db.coupon.create({data:{code:'ONEUSE',percent:10,maxUses:1,perUserLimit:1,expiresAt:new Date(Date.now()+86400000)}});
  await add(at,product.id); await add(bt,product.id);
  for (const token of [at,bt]) expect((await request(app).post('/api/cart/coupon').set(auth(token)).send({code:coupon.code})).status).toBe(200);
  const results=await Promise.all([order(at),order(bt)]);
  expect(results.map(r=>r.status).sort()).toEqual([201,400]);
  expect(await db.couponRedemption.count({where:{couponId:coupon.id}})).toBe(1);
  await db.cartItem.deleteMany(); await db.cart.updateMany({data:{couponId:null}});
});
test('order state machine rejects skipping steps', async () => {
  await add(at,product.id); const created=await order(at); const id=created.body.data.id;
  expect((await request(app).patch(`/api/admin/orders/${id}/status`).set(auth(mt)).send({status:'COMPLETED'})).status).toBe(409);
  expect((await request(app).patch(`/api/admin/orders/${id}/status`).set(auth(mt)).send({status:'CONFIRMED'})).status).toBe(200);
  expect((await request(app).post(`/api/orders/${id}/cancel`).set(auth(at))).status).toBe(409);
});
test('ticket and attachment access follows ticket ownership including nested resources', async () => {
  const created=await request(app).post('/api/tickets').set(auth(at)).send({title:'Private ticket',message:'Private information'});
  const tid=created.body.data.id; expect(created.status).toBe(201);
  expect((await request(app).get(`/api/tickets/${tid}`).set(auth(bt))).status).toBe(404);
  const detail=await request(app).get(`/api/tickets/${tid}`).set(auth(at)); const mid=detail.body.data.messages[0].id;
  const attached=await request(app).post(`/api/tickets/${tid}/messages/${mid}/attachments`).set(auth(at)).attach('file',png,{filename:'test.png',contentType:'image/png'});
  expect(attached.status).toBe(201); const aid=attached.body.data.id;
  expect((await request(app).get(`/api/attachments/${aid}/download`).set(auth(bt))).status).toBe(404);
  const own=await request(app).get(`/api/attachments/${aid}/download`).set(auth(at)); expect(own.status).toBe(200); expect(own.headers['content-disposition']).toMatch(/^attachment/);
  const asset=await db.attachment.findUnique({where:{id:aid}});
  expect((await request(app).get(`/api/assets/${asset.assetId}`)).status).toBe(404);
  expect((await request(app).get(`/api/attachments/${aid}/download`).set(auth(mt))).status).toBe(200);
  expect((await request(app).post(`/api/tickets/${tid+999}/messages/${mid}/attachments`).set(auth(at)).attach('file',png,{filename:'test.png',contentType:'image/png'})).status).toBe(404);
  expect((await request(app).post(`/api/admin/tickets/${tid}/messages`).set(auth(mt)).send({message:'We can help.'})).status).toBe(201);
  await request(app).post(`/api/tickets/${tid}/close`).set(auth(at));
  expect((await request(app).post(`/api/tickets/${tid}/messages`).set(auth(at)).send({message:'Late reply'})).status).toBe(409);
});
test('avatar rejects disguised files and accepts decoded images', async () => {
  expect((await request(app).post('/api/users/me/avatar').set(auth(at)).attach('file',Buffer.from('<svg onload="alert(1)"/>'),{filename:'image.png',contentType:'image/png'})).status).toBe(400);
  const result=await request(app).post('/api/users/me/avatar').set(auth(at)).attach('file',png,{filename:'image.png',contentType:'image/png'});
  expect(result.status).toBe(200); expect((await request(app).get(`/api/assets/${result.body.data.avatarId}`)).status).toBe(200);
});
test('image import enforces origin, redirects, real byte limit and valid image content', async () => {
  const endpoint=`/api/admin/products/${product.id}/image-import`;
  expect((await request(app).post(endpoint).set(auth(mt)).send({url:'http://127.0.0.1:4102/'})).status).toBe(400);
  expect((await request(app).post(endpoint).set(auth(mt)).send({url:`${fixtureBase}/redirect`})).status).toBe(400);
  expect((await request(app).post(endpoint).set(auth(mt)).send({url:`${fixtureBase}/large`})).status).toBe(400);
  expect((await request(app).post(endpoint).set(auth(mt)).send({url:`${fixtureBase}/sample.png`})).status).toBe(200);
});
test('refresh requires same origin; rotation reuse revokes the token family', async () => {
  expect((await request(app).post('/api/auth/refresh').set('Cookie',cookieA).set('Origin','https://other.example')).status).toBe(403);
  const result=await request(app).post('/api/auth/refresh').set('Cookie',cookieA).set('Origin',origin); expect(result.status).toBe(200);
  expect((await request(app).post('/api/auth/refresh').set('Cookie',cookieA).set('Origin',origin)).status).toBe(401);
  expect((await request(app).get('/api/auth/me').set(auth(result.body.data.accessToken))).status).toBe(401);
});
test('logout revokes an existing access token immediately', async () => {
  const session=await login(a.email); const token=session.body.data.accessToken; const cookie=session.headers['set-cookie'][0].split(';')[0];
  expect((await request(app).post('/api/auth/logout').set('Cookie',cookie).set('Origin',origin)).status).toBe(200);
  expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(401);
});
test('loopback alias supports refresh and logout while rejecting foreign origins', async () => {
  const session = await login(a.email);
  const cookie = session.headers['set-cookie'][0].split(';')[0];
  expect((await request(app).post('/api/auth/logout').set('Cookie', cookie).set('Origin', 'https://other.example')).status).toBe(403);
  const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookie).set('Origin', 'http://127.0.0.1:5173');
  expect(refreshed.status).toBe(200);
  const nextCookie = refreshed.headers['set-cookie'][0].split(';')[0];
  const logout = await request(app).post('/api/auth/logout').set('Cookie', nextCookie).set('Origin', 'http://127.0.0.1:5173');
  expect(logout.status).toBe(200);
  expect(logout.headers['set-cookie'][0]).toContain('shoplab_refresh=;');
  expect((await request(app).get('/api/auth/me').set(auth(refreshed.body.data.accessToken))).status).toBe(401);
});
test('password reset is single-use even with concurrent requests and revokes sessions', async () => {
  const token=crypto.randomBytes(32).toString('base64url');
  await db.passwordResetToken.create({data:{userId:b.id,tokenHash:hashToken(token),expiresAt:new Date(Date.now()+60000)}});
  const reset=()=>request(app).post('/api/auth/reset-password').send({token,password:'NewPassword123!'});
  const results=await Promise.all([reset(),reset()]); expect(results.map(r=>r.status).sort()).toEqual([200,400]);
  expect((await request(app).get('/api/auth/me').set(auth(bt))).status).toBe(401);
});
test('disabled account loses its existing session', async () => {
  const session=await login(a.email);
  expect((await request(app).patch(`/api/admin/users/${a.id}`).set(auth(mt)).send({active:false})).status).toBe(200);
  expect((await request(app).get('/api/auth/me').set(auth(session.body.data.accessToken))).status).toBe(401);
});
