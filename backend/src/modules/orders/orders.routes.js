import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/database.js';
import { authenticate } from '../../middleware/auth.js';
import { ok, fail, id, pagination } from '../../shared/http.js';
import { checkout, changeStatus } from './orders.service.js';
const router = Router(); router.use(authenticate);
router.post('/', async (req, res) => {
  const { shippingAddress } = z.object({ shippingAddress: z.string().trim().min(10).max(500) }).strict().parse(req.body);
  const key = z.string().uuid().parse(req.headers['idempotency-key']);
  ok(res, await checkout(req, key, shippingAddress), 201);
});
router.get('/', async (req, res) => {
  const { page, limit } = pagination(req.query); const where = { userId: req.user.id };
  const [items, total] = await Promise.all([db.order.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }), db.order.count({ where })]);
  ok(res, { items, total, page, limit });
});
router.get('/:id', async (req, res) => {
  const order = await db.order.findFirst({ where: { id: id(req.params.id), userId: req.user.id }, include: { items: true } });
  if (!order) fail(404, 'NOT_FOUND', 'Order not found.'); ok(res, order);
});
router.post('/:id/cancel', async (req, res) => ok(res, await changeStatus(req, id(req.params.id), 'CANCELLED')));
export default router;
