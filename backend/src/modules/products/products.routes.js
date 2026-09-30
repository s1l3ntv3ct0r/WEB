import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../config/database.js';
import { ok, fail, id, pagination } from '../../shared/http.js';
import { authenticate } from '../../middleware/auth.js';
export const reviewSchema = z.object({ rating: z.number().int().min(1).max(5), content: z.string().trim().min(3).max(2000) }).strict();
const router = Router();
router.get('/', async (req, res) => {
  const { page, limit } = pagination(req.query);
  const q = z.string().max(120).default('').parse(req.query.q);
  const category = z.string().max(50).optional().parse(req.query.category);
  const where = { active: true, ...(category ? { category } : {}), ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }] } : {}) };
  const [items, total, categories] = await Promise.all([db.product.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { id: 'asc' } }), db.product.count({ where }), db.product.findMany({ where: { active: true }, distinct: ['category'], select: { category: true } })]);
  ok(res, { items, total, page, limit, categories: categories.map(x => x.category) });
});
router.get('/:id', async (req, res) => {
  const product = await db.product.findFirst({ where: { id: id(req.params.id), active: true } });
  if (!product) fail(404, 'NOT_FOUND', 'Product not found.'); ok(res, product);
});
router.get('/:id/reviews', async (req, res) => {
  const { page, limit } = pagination(req.query);
  const where = { productId: id(req.params.id), product: { active: true } };
  const [items, total] = await Promise.all([db.review.findMany({ where, include: { user: { select: { id: true, username: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }), db.review.count({ where })]);
  ok(res, { items, total, page, limit });
});
router.post('/:id/reviews', authenticate, async (req, res) => {
  const productId = id(req.params.id); const data = reviewSchema.parse(req.body);
  if (!await db.product.findFirst({ where: { id: productId, active: true } })) fail(404, 'NOT_FOUND', 'Product not found.');
  ok(res, await db.review.create({ data: { ...data, productId, userId: req.user.id } }), 201);
});
export default router;
