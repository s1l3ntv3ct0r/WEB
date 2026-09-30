import { PrismaClient, Prisma } from '@prisma/client';
export const db = new PrismaClient();
// Serializable transactions plus bounded retry protect cart, inventory and coupon invariants.
export async function transaction(work) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try { return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 15000 }); }
    catch (error) {
      if (error.code !== 'P2034' || attempt === 4) throw error;
      await new Promise(resolve => setTimeout(resolve, 15 * (attempt + 1)));
    }
  }
}
