import { fail } from '../../shared/http.js';
import { totals } from '../../shared/money.js';
export async function checkCoupon(tx, coupon, userId) {
  if (!coupon || !coupon.active || coupon.startsAt > new Date() || coupon.expiresAt <= new Date()) fail(400, 'COUPON_INVALID', 'Coupon is inactive or expired.');
  const [total, personal] = await Promise.all([tx.couponRedemption.count({ where: { couponId: coupon.id } }), tx.couponRedemption.count({ where: { couponId: coupon.id, userId } })]);
  if (total >= coupon.maxUses || personal >= coupon.perUserLimit) fail(400, 'COUPON_LIMIT', 'Coupon usage limit reached.');
}
export async function cartView(tx, userId) {
  const cart = await tx.cart.findUnique({ where: { userId }, include: { items: { include: { product: true }, orderBy: { id: 'asc' } }, coupon: true } });
  let couponError = null;
  if (cart.coupon) { try { await checkCoupon(tx, cart.coupon, userId); } catch (e) { couponError = e.message; } }
  return { ...cart, couponError, ...totals(cart.items, cart.coupon && !couponError ? cart.coupon.percent : 0) };
}
