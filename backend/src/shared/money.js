export function totals(items, percent = 0) {
  const subtotal = items.reduce((sum, item) => sum + BigInt(String(item.product.price)) * BigInt(item.quantity), 0n);
  const discount = subtotal * BigInt(percent) / 100n;
  return { subtotal: subtotal.toString(), discount: discount.toString(), total: (subtotal - discount).toString() };
}
export const nextStatus = { PENDING: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['SHIPPED'], SHIPPED: ['COMPLETED'], COMPLETED: [], CANCELLED: [] };
