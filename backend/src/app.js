import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import { ZodError } from 'zod';
import { db } from './config/database.js';
import auth from './modules/auth/auth.routes.js';
import products from './modules/products/products.routes.js';
import reviews from './modules/reviews/reviews.routes.js';
import cart from './modules/cart/cart.routes.js';
import orders from './modules/orders/orders.routes.js';
import users from './modules/users/users.routes.js';
import tickets, { ticketRouter } from './modules/tickets/tickets.routes.js';
import files from './modules/files/files.routes.js';
import admin from './modules/admin/admin.routes.js';
import { fail } from './shared/http.js';
export const app = express();
app.disable('x-powered-by');
app.use(helmet());
app.use((req, res, next) => {
  req.requestId = crypto.randomUUID(); res.set('X-Request-Id', req.requestId).set('Cache-Control', 'no-store');
  const started = Date.now();
  res.on('finish', () => { if (process.env.NODE_ENV !== 'test') console.log(JSON.stringify({ requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode, ms: Date.now() - started })); });
  next();
});
app.use(express.json({ limit: '32kb' }), cookieParser());
app.get('/api/health', async (req, res) => { await db.$queryRaw`SELECT 1`; res.json({ success: true, data: { status: 'ok', version: '0.1.0' } }); });
app.use('/api/auth', auth);
app.use('/api/products', products);
app.use('/api/reviews', reviews);
app.use('/api/cart', cart);
app.use('/api/orders', orders);
app.use('/api/users', users);
app.use('/api/tickets', tickets);
app.use('/api', files);
app.use('/api/admin/tickets', ticketRouter(true));
app.use('/api/admin', admin);
app.use(() => fail(404, 'NOT_FOUND', 'Endpoint not found.'));
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  let status = error.status || 500; let code = error.code || 'INTERNAL_ERROR'; let message = error.status ? error.message : 'An unexpected error occurred.';
  if (error instanceof ZodError) { status = 400; code = 'VALIDATION_ERROR'; message = error.issues.map(x => `${x.path.join('.') || 'input'}: ${x.message}`).join('; '); }
  if (error.code === 'P2002') { status = 409; code = 'ALREADY_EXISTS'; message = 'A record with these details already exists.'; }
  if (error.code === 'P2025') { status = 404; code = 'NOT_FOUND'; message = 'Record not found.'; }
  if (error.code === 'P2034') { status = 409; code = 'RETRY_REQUEST'; message = 'Concurrent update. Please retry.'; }
  if (error.code === 'LIMIT_FILE_SIZE') { status = 413; message = 'File exceeds the allowed size.'; }
  else if (error.name === 'MulterError') { status = 400; message = 'Invalid multipart upload.'; }
  if (status >= 500) console.error(JSON.stringify({ requestId: req.requestId, code: error.code || error.name }));
  res.status(status).json({ success: false, error: { code, message }, requestId: req.requestId });
});
