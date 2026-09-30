import crypto from 'node:crypto';
import { transaction } from '../../config/database.js';
import { fail, audit } from '../../shared/http.js';
import { totals, nextStatus } from '../../shared/money.js';
import { checkCoupon } from '../cart/cart.service.js';
export async function checkout(req, key, shippingAddress) {
  const requestHash = crypto.createHash('sha256').update(JSON.stringify({ shippingAddress })).digest('hex');
  return transaction(async tx => {
    const previous = await tx.checkoutRequest.findUnique({ where: { userId_key: { userId: req.user.id, key } }, include: { order: { include: { items: true } } } });
    if (previous) {
      if (previous.requestHash !== requestHash) fail(409, 'KEY_REUSED', 'This checkout key was used with another address.');
      return previous.order;
    }
    const cart = await tx.cart.findUnique({ where: { userId: req.user.id }, include: { items: { include: { product: true } }, coupon: true } });
    if (!cart.items.length) fail(400, 'EMPTY_CART', 'Your cart is empty.');
    if (cart.coupon) await checkCoupon(tx, cart.coupon, req.user.id);
    for (const item of cart.items) {
      const stock = await tx.product.updateMany({ where: { id: item.productId, active: true, stock: { gte: item.quantity } }, data: { stock: { decrement: item.quantity } } });
      if (!stock.count) fail(409, 'STOCK_LIMIT', `${item.product.name} is no longer available in that quantity.`);
    }
    const prices = totals(cart.items, cart.coupon?.percent || 0);
    const order = await tx.order.create({ data: {
      userId: req.user.id, shippingAddress, ...prices, couponCode: cart.coupon?.code,
      items: { create: cart.items.map(item => ({ productId: item.productId, name: item.product.name, unitPrice: item.product.price, quantity: item.quantity })) },
      checkout: { create: { userId: req.user.id, key, requestHash } },
      ...(cart.coupon ? { redemption: { create: { couponId: cart.coupon.id, userId: req.user.id } } } : {}),
    }, include: { items: true } });
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    await tx.cart.update({ where: { id: cart.id }, data: { couponId: null } });
    await audit(tx, req, 'ORDER_CREATED', order.id); return order;
  });
}
export async function changeStatus(req, orderId, status, admin = false) {
  return transaction(async tx => {
    const order = await tx.order.findFirst({ where: { id: orderId, ...(admin ? {} : { userId: req.user.id }) }, include: { items: true } });
    if (!order) fail(404, 'NOT_FOUND', 'Order not found.');
    if ((!admin && status !== 'CANCELLED') || !nextStatus[order.status].includes(status)) fail(409, 'INVALID_TRANSITION', 'This order cannot move to that status.');
    const updated = await tx.order.update({ where: { id: order.id }, data: { status } });
    if (status === 'CANCELLED') for (const item of order.items) await tx.product.update({ where: { id: item.productId }, data: { stock: { increment: item.quantity } } });
    await audit(tx, req, `ORDER_${status}`, order.id); return updated;
  });
}
