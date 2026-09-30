import { Router } from 'express';
import { db } from '../../config/database.js';
import { authenticate } from '../../middleware/auth.js';
import { ok, fail, id } from '../../shared/http.js';
import { reviewSchema } from '../products/products.routes.js';
const router = Router(); router.use(authenticate);
router.patch('/:id', async (req, res) => {
  const result = await db.review.updateMany({ where: { id: id(req.params.id), userId: req.user.id }, data: reviewSchema.parse(req.body) });
  if (!result.count) fail(404, 'NOT_FOUND', 'Review not found.'); ok(res, { updated: true });
});
router.delete('/:id', async (req, res) => {
  const result = await db.review.deleteMany({ where: { id: id(req.params.id), ...(req.user.role === 'ADMIN' ? {} : { userId: req.user.id }) } });
  if (!result.count) fail(404, 'NOT_FOUND', 'Review not found.'); ok(res, { deleted: true });
});
export default router;
