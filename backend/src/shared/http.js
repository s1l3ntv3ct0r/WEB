import { z } from 'zod';
export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
export const fail = (status, code, message) => { throw new AppError(status, code, message); };
export const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });
export const id = value => z.coerce.number().int().positive().parse(value);
export const pagination = query => ({
  page: z.coerce.number().int().min(1).default(1).parse(query.page),
  limit: z.coerce.number().int().min(1).max(50).default(12).parse(query.limit),
});
export const audit = (client, req, action, targetId) => client.auditLog.create({ data: {
  actorId: req.user?.id, action, targetId: targetId == null ? undefined : String(targetId), requestId: req.requestId,
} });
export const userSelect = { id: true, email: true, username: true, firstName: true, lastName: true, role: true, active: true, avatarId: true };
