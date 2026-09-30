import { Router } from 'express';
import path from 'node:path';
import { db } from '../../config/database.js';
import { config } from '../../config/env.js';
import { fail, id } from '../../shared/http.js';
import { authenticate } from '../../middleware/auth.js';
const router = Router();
router.get('/assets/:id', async (req, res) => {
  const asset = await db.fileAsset.findFirst({ where: { id: req.params.id, kind: { in: ['AVATAR', 'PRODUCT'] } } });
  if (!asset) fail(404, 'NOT_FOUND', 'Image not found.');
  res.type(asset.mimeType).set('X-Content-Type-Options', 'nosniff').sendFile(asset.storedName, { root: config.uploads });
});
router.get('/attachments/:id/download', authenticate, async (req, res) => {
  const attachment = await db.attachment.findFirst({ where: { id: id(req.params.id), ...(req.user.role === 'ADMIN' ? {} : { message: { ticket: { userId: req.user.id } } }) }, include: { asset: true } });
  if (!attachment) fail(404, 'NOT_FOUND', 'Attachment not found.');
  res.set('X-Content-Type-Options', 'nosniff').set('Content-Security-Policy', "sandbox; default-src 'none'");
  res.download(attachment.asset.storedName, attachment.asset.originalName, { root: config.uploads });
});
export default router;
