import { totals, nextStatus } from '../../src/shared/money.js';
test('money calculations preserve integer precision and round the discount down', () => {
  expect(totals([{ product: { price: '10001' }, quantity: 3 }], 15)).toEqual({ subtotal: '30003', discount: '4500', total: '25503' });
  expect(totals([{ product: { price: '999999999999' }, quantity: 99 }], 100).total).toBe('0');
});
test('completed and cancelled orders are terminal states', () => {
  expect(nextStatus.COMPLETED).toEqual([]); expect(nextStatus.CANCELLED).toEqual([]);
  expect(nextStatus.SHIPPED).not.toContain('CANCELLED');
});
