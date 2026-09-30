import { Router } from 'express';
import { z } from 'zod';
import { db, transaction } from '../../config/database.js';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import { ok, fail, id, pagination, audit, userSelect } from '../../shared/http.js';
import { changeStatus } from '../orders/orders.service.js';
import { fetchImage, storeFile, upload } from '../files/files.service.js';
const router = Router(); router.use(authenticate, requireAdmin);
const productSchema = z.object({ name: z.string().trim().min(2).max(120), description: z.string().trim().min(5).max(5000), price: z.string().regex(/^\d{1,12}$/).refine(v => BigInt(v) > 0n), stock: z.number().int().min(0).max(100000), category: z.string().trim().min(2).max(50), active: z.boolean().optional() }).strict();
const couponSchema = z.object({ code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,30}$/), percent: z.number().int().min(1).max(100), maxUses: z.number().int().min(1).max(100000), perUserLimit: z.number().int().min(1).max(100), expiresAt: z.coerce.date(), active: z.boolean().optional() }).strict();
router.get('/dashboard', async (req, res) => {
  const [users, products, orders, tickets, revenue] = await Promise.all([db.user.count(), db.product.count(), db.order.count(), db.supportTicket.count({ where: { status: 'OPEN' } }), db.order.aggregate({ where: { status: 'COMPLETED' }, _sum: { total: true } })]);
  ok(res, { users, products, orders, tickets, revenue: revenue._sum.total?.toString() || '0' });
});
for (const [route, model] of [['users', 'user'], ['products', 'product'], ['orders', 'order'], ['coupons', 'coupon']]) {
  router.get(`/${route}`, async (req, res) => {
    const { page, limit } = pagination(req.query);
    const [items, total] = await Promise.all([db[model].findMany({ orderBy: { id: 'desc' }, skip: (page - 1) * limit, take: limit, ...(model === 'user' ? { select: userSelect } : {}) }), db[model].count()]);
    ok(res, { items, total, page, limit });
  });
}
router.get('/users/:id', async (req, res) => {
  const user = await db.user.findUnique({ where: { id: id(req.params.id) }, select: userSelect });
  if (!user) fail(404, 'NOT_FOUND', 'User not found.'); ok(res, user);
});
router.patch('/users/:id', async (req, res) => {
  const userId = id(req.params.id);
  const data = z.object({ active: z.boolean().optional(), role: z.enum(['USER', 'ADMIN']).optional() }).strict().parse(req.body);
  if (userId === req.user.id) fail(400, 'SELF_CHANGE', 'You cannot change your own administrative access.');
  const user = await transaction(async tx => {
    const target = await tx.user.findUnique({ where: { id: userId } });
    if (!target) fail(404, 'NOT_FOUND', 'User not found.');
    if (target.role === 'ADMIN' && target.active && (data.active === false || data.role === 'USER') && await tx.user.count({ where: { role: 'ADMIN', active: true } }) <= 1) fail(409, 'LAST_ADMIN', 'At least one active administrator must remain.');
    const updated = await tx.user.update({ where: { id: userId }, data, select: userSelect });
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, req, 'USER_ACCESS_UPDATED', userId); return updated;
  }); ok(res, user);
});
router.post('/products', async (req, res) => {
  const data = productSchema.parse(req.body);
  const product = await transaction(async tx => { const result = await tx.product.create({ data }); await audit(tx, req, 'PRODUCT_CREATED', result.id); return result; });
  ok(res, product, 201);
});
router.patch('/products/:id', async (req, res) => {
  const data = productSchema.partial().parse(req.body);
  ok(res, await transaction(async tx => { const result = await tx.product.update({ where: { id: id(req.params.id) }, data }); await audit(tx, req, 'PRODUCT_UPDATED', result.id); return result; }));
});
router.delete('/products/:id', async (req, res) => {
  ok(res, await transaction(async tx => { const result = await tx.product.update({ where: { id: id(req.params.id) }, data: { active: false } }); await audit(tx, req, 'PRODUCT_ARCHIVED', result.id); return result; }));
});
router.post('/products/:id/image-import', async (req, res) => {
  const productId = id(req.params.id); const { url } = z.object({ url: z.string().max(2000) }).strict().parse(req.body);
  if (!await db.product.findUnique({ where: { id: productId } })) fail(404, 'NOT_FOUND', 'Product not found.');
  let file;
  try { file = await fetchImage(url); } catch (error) { if (error.status) throw error; fail(400, 'IMPORT_FAILED', 'Image could not be fetched within the allowed limits.'); }
  const asset = await storeFile(file, req.user.id, 'PRODUCT');
  await db.product.update({ where: { id: productId }, data: { imageId: asset.id } });
  await audit(db, req, 'PRODUCT_IMAGE_IMPORTED', productId); ok(res, { imageId: asset.id });
});
router.post('/products/:id/image', upload.single('file'), async (req, res) => {
  const productId = id(req.params.id);
  if (!await db.product.findUnique({ where: { id: productId } })) fail(404, 'NOT_FOUND', 'Product not found.');
  const asset = await storeFile(req.file, req.user.id, 'PRODUCT');
  await db.product.update({ where: { id: productId }, data: { imageId: asset.id } });
  await audit(db, req, 'PRODUCT_IMAGE_UPDATED', productId); ok(res, { imageId: asset.id });
});
router.get('/orders/:id', async (req, res) => {
  const order = await db.order.findUnique({ where: { id: id(req.params.id) }, include: { items: true } });
  if (!order) fail(404, 'NOT_FOUND', 'Order not found.'); ok(res, order);
});
router.patch('/orders/:id/status', async (req, res) => {
  const { status } = z.object({ status: z.enum(['CONFIRMED', 'SHIPPED', 'COMPLETED', 'CANCELLED']) }).strict().parse(req.body);
  ok(res, await changeStatus(req, id(req.params.id), status, true));
});
router.post('/coupons', async (req, res) => {
  const data = couponSchema.parse(req.body);
  ok(res, await transaction(async tx => { const result = await tx.coupon.create({ data }); await audit(tx, req, 'COUPON_CREATED', result.id); return result; }), 201);
});
router.patch('/coupons/:id', async (req, res) => {
  const data = couponSchema.partial().parse(req.body);
  ok(res, await transaction(async tx => { const result = await tx.coupon.update({ where: { id: id(req.params.id) }, data }); await audit(tx, req, 'COUPON_UPDATED', result.id); return result; }));
});
router.delete('/coupons/:id', async (req, res) => {
  ok(res, await transaction(async tx => { const result = await tx.coupon.update({ where: { id: id(req.params.id) }, data: { active: false } }); await audit(tx, req, 'COUPON_DISABLED', result.id); return result; }));
});
export default router;
