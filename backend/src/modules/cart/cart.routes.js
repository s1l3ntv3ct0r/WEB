import { Router } from 'express';
import { z } from 'zod';
import { db, transaction } from '../../config/database.js';
import { authenticate } from '../../middleware/auth.js';
import { ok, fail, id } from '../../shared/http.js';
import { cartView, checkCoupon } from './cart.service.js';
const router = Router(); router.use(authenticate);
const quantity = z.number().int().min(1).max(99);
router.get('/', async (req, res) => ok(res, await cartView(db, req.user.id)));
router.post('/items', async (req, res) => {
  const data = z.object({ productId: z.number().int().positive(), quantity }).strict().parse(req.body);
  await transaction(async tx => {
    const cart = await tx.cart.findUniqueOrThrow({ where: { userId: req.user.id } });
    const product = await tx.product.findFirst({ where: { id: data.productId, active: true } });
    if (!product) fail(404, 'NOT_FOUND', 'Product not found.');
    const existing = await tx.cartItem.findUnique({ where: { cartId_productId: { cartId: cart.id, productId: product.id } } });
    const newQuantity = (existing?.quantity || 0) + data.quantity;
    if (newQuantity > 99 || newQuantity > product.stock) fail(409, 'STOCK_LIMIT', 'Requested quantity is not available.');
    await tx.cartItem.upsert({ where: { cartId_productId: { cartId: cart.id, productId: product.id } }, create: { cartId: cart.id, productId: product.id, quantity: newQuantity }, update: { quantity: newQuantity } });
  });
  ok(res, await cartView(db, req.user.id));
});
router.patch('/items/:id', async (req, res) => {
  const data = z.object({ quantity }).strict().parse(req.body);
  await transaction(async tx => {
    const item = await tx.cartItem.findFirst({ where: { id: id(req.params.id), cart: { userId: req.user.id } }, include: { product: true } });
    if (!item) fail(404, 'NOT_FOUND', 'Cart item not found.');
    if (!item.product.active || data.quantity > item.product.stock) fail(409, 'STOCK_LIMIT', 'Requested quantity is not available.');
    await tx.cartItem.update({ where: { id: item.id }, data });
  }); ok(res, await cartView(db, req.user.id));
});
router.delete('/items/:id', async (req, res) => {
  const result = await db.cartItem.deleteMany({ where: { id: id(req.params.id), cart: { userId: req.user.id } } });
  if (!result.count) fail(404, 'NOT_FOUND', 'Cart item not found.'); ok(res, await cartView(db, req.user.id));
});
router.post('/coupon', async (req, res) => {
  const { code } = z.object({ code: z.string().trim().toUpperCase().min(1).max(30) }).strict().parse(req.body);
  const coupon = await db.coupon.findUnique({ where: { code } }); await checkCoupon(db, coupon, req.user.id);
  await db.cart.update({ where: { userId: req.user.id }, data: { couponId: coupon.id } }); ok(res, await cartView(db, req.user.id));
});
router.delete('/coupon', async (req, res) => {
  await db.cart.update({ where: { userId: req.user.id }, data: { couponId: null } }); ok(res, await cartView(db, req.user.id));
});
export default router;
