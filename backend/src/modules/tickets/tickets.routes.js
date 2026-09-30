import { Router } from 'express';
import { z } from 'zod';
import { db, transaction } from '../../config/database.js';
import { authenticate, requireAdmin } from '../../middleware/auth.js';
import { ok, fail, id, pagination } from '../../shared/http.js';
import { upload, storeFile, removeFile } from '../files/files.service.js';
export function ticketRouter(admin = false) {
  const router = Router(); router.use(authenticate); if (admin) router.use(requireAdmin);
  const where = req => ({ id: id(req.params.id), ...(admin ? {} : { userId: req.user.id }) });
  const messageSchema = z.object({ message: z.string().trim().min(1).max(4000) }).strict();
  router.get('/', async (req, res) => {
    const { page, limit } = pagination(req.query); const filter = admin ? {} : { userId: req.user.id };
    const [items, total] = await Promise.all([db.supportTicket.findMany({ where: filter, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * limit, take: limit }), db.supportTicket.count({ where: filter })]);
    ok(res, { items, total, page, limit });
  });
  router.post('/', async (req, res) => {
    const data = z.object({ title: z.string().trim().min(3).max(120), message: z.string().trim().min(1).max(4000) }).strict().parse(req.body);
    ok(res, await db.supportTicket.create({ data: { userId: req.user.id, title: data.title, messages: { create: { authorId: req.user.id, message: data.message } } } }), 201);
  });
  router.get('/:id', async (req, res) => {
    const ticket = await db.supportTicket.findFirst({ where: where(req), include: { messages: { orderBy: { createdAt: 'asc' }, include: { author: { select: { username: true, role: true } }, attachments: { include: { asset: { select: { originalName: true, size: true } } } } } } } });
    if (!ticket) fail(404, 'NOT_FOUND', 'Ticket not found.'); ok(res, ticket);
  });
  router.post('/:id/messages', async (req, res) => {
    const data = messageSchema.parse(req.body);
    const message = await transaction(async tx => {
      const ticket = await tx.supportTicket.findFirst({ where: where(req) });
      if (!ticket) fail(404, 'NOT_FOUND', 'Ticket not found.');
      if (ticket.status !== 'OPEN') fail(409, 'TICKET_CLOSED', 'Ticket is closed.');
      await tx.supportTicket.update({ where: { id: ticket.id }, data: { updatedAt: new Date() } });
      return tx.ticketMessage.create({ data: { ticketId: ticket.id, authorId: req.user.id, message: data.message } });
    }); ok(res, message, 201);
  });
  router.post('/:id/close', async (req, res) => {
    const result = await db.supportTicket.updateMany({ where: where(req), data: { status: 'CLOSED' } });
    if (!result.count) fail(404, 'NOT_FOUND', 'Ticket not found.'); ok(res, { closed: true });
  });
  router.post('/:id/messages/:messageId/attachments', upload.single('file'), async (req, res) => {
    const messageId = id(req.params.messageId);
    const message = await db.ticketMessage.findFirst({ where: { id: messageId, authorId: req.user.id, ticket: where(req) } });
    if (!message) fail(404, 'NOT_FOUND', 'Message not found.');
    const asset = await storeFile(req.file, req.user.id, 'TICKET');
    try {
      const result = await transaction(async tx => {
        const ticket = await tx.supportTicket.findFirst({ where: where(req) });
        if (!ticket || ticket.status !== 'OPEN') fail(409, 'TICKET_CLOSED', 'Ticket is closed.');
        const count = await tx.attachment.count({ where: { messageId } });
        if (count >= 3) fail(400, 'ATTACHMENT_LIMIT', 'Only three files are allowed per message.');
        return tx.attachment.create({ data: { messageId, assetId: asset.id } });
      }); ok(res, result, 201);
    } catch (error) { await removeFile(asset); throw error; }
  });
  return router;
}
export default ticketRouter();
