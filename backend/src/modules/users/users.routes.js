import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, transaction } from '../../config/database.js';
import { authenticate } from '../../middleware/auth.js';
import { ok, fail, userSelect, audit } from '../../shared/http.js';
import { passwordSchema } from '../auth/auth.routes.js';
import { upload, storeFile } from '../files/files.service.js';
const router = Router(); router.use(authenticate);
router.get('/me', (req, res) => ok(res, req.user));
router.patch('/me', async (req, res) => {
  const data = z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/).optional(), firstName: z.string().trim().max(60).optional(), lastName: z.string().trim().max(60).optional() }).strict().parse(req.body);
  ok(res, await db.user.update({ where: { id: req.user.id }, data, select: userSelect }));
});
router.put('/me/password', async (req, res) => {
  const data = z.object({ currentPassword: z.string().max(200), password: passwordSchema }).strict().parse(req.body);
  const user = await db.user.findUniqueOrThrow({ where: { id: req.user.id } });
  if (!await bcrypt.compare(data.currentPassword, user.passwordHash)) fail(400, 'PASSWORD_MISMATCH', 'Current password is incorrect.');
  const passwordHash = await bcrypt.hash(data.password, 12);
  await transaction(async tx => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    await audit(tx, req, 'PASSWORD_CHANGED', user.id);
  }); ok(res, { message: 'Password changed. Sign in again on all devices.' });
});
router.post('/me/avatar', upload.single('file'), async (req, res) => {
  const asset = await storeFile(req.file, req.user.id, 'AVATAR');
  ok(res, await db.user.update({ where: { id: req.user.id }, data: { avatarId: asset.id }, select: userSelect }));
});
export default router;
