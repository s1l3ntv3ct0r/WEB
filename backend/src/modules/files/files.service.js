import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import multer from 'multer';
import sharp from 'sharp';
import { db } from '../../config/database.js';
import { config } from '../../config/env.js';
import { fail } from '../../shared/http.js';
export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5 } });
export async function storeFile(file, userId, kind) {
  if (!file?.buffer) fail(400, 'FILE_REQUIRED', 'Select a file.');
  const max = kind === 'TICKET' ? 5 * 1024 * 1024 : 2 * 1024 * 1024;
  if (file.buffer.length > max) fail(413, 'FILE_TOO_LARGE', 'File exceeds the allowed size.');
  let buffer; let mimeType; let ext;
  const declared = file.mimetype?.toLowerCase();
  const extension = path.extname(file.originalname || '').toLowerCase();
  const signature = file.buffer.subarray(0, 8);
  const png = signature.equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpg = signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  if ((png && declared === 'image/png' && extension === '.png') || (jpg && declared === 'image/jpeg' && ['.jpg', '.jpeg'].includes(extension))) {
    try { buffer = await sharp(file.buffer, { limitInputPixels: 16000000 }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).png().toBuffer(); }
    catch { fail(400, 'INVALID_IMAGE', 'Image could not be decoded.'); }
    mimeType = 'image/png'; ext = '.png';
  } else if (kind === 'TICKET' && extension === '.pdf' && declared === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-') {
    // PDF is never rendered inline; magic bytes are only one validation layer, not a malware scan.
    buffer = file.buffer; mimeType = 'application/pdf'; ext = '.pdf';
  } else fail(400, 'FILE_TYPE', kind === 'TICKET' ? 'Only PNG, JPEG and PDF are allowed.' : 'Only PNG and JPEG images are allowed.');
  const storedName = `${crypto.randomUUID()}${ext}`;
  await fs.mkdir(config.uploads, { recursive: true });
  await fs.writeFile(path.join(config.uploads, storedName), buffer, { flag: 'wx' });
  try { return await db.fileAsset.create({ data: { uploadedBy: userId, kind, originalName: path.basename(file.originalname).slice(0, 180), storedName, mimeType, size: buffer.length } }); }
  catch (error) { await fs.unlink(path.join(config.uploads, storedName)); throw error; }
}
export async function removeFile(asset) {
  await db.fileAsset.delete({ where: { id: asset.id } });
  await fs.unlink(path.join(config.uploads, asset.storedName)).catch(() => {});
}
export async function fetchImage(rawUrl) {
  let url;
  try { url = new URL(rawUrl); } catch { fail(400, 'INVALID_URL', 'Enter a valid image URL.'); }
  const allowed = (process.env.IMPORT_ALLOWED_ORIGINS || 'http://image-source:4101').split(',');
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !allowed.includes(url.origin)) fail(400, 'URL_NOT_ALLOWED', 'Only the configured image source is allowed.');
  // Exact origin allowlist, a pinned DNS result and no redirects. Local private image-source is explicitly trusted.
  const address = await dns.lookup(url.hostname);
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const request = client.get(url, { lookup: (hostname, options, callback) => options?.all ? callback(null, [address]) : callback(null, address.address, address.family) }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error('Image source must respond with HTTP 200; redirects are not followed.')); return; }
      const type = response.headers['content-type']?.split(';')[0];
      if (!['image/png', 'image/jpeg'].includes(type)) { response.resume(); reject(new Error('Image source did not return PNG or JPEG.')); return; }
      let size = 0; const chunks = [];
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 2 * 1024 * 1024) request.destroy(new Error('Imported image exceeds 2 MB.'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => resolve({ buffer: Buffer.concat(chunks), mimetype: type, originalname: type === 'image/png' ? 'import.png' : 'import.jpg' }));
    });
    const deadline = setTimeout(() => request.destroy(new Error('Image request timed out.')), 5000);
    request.on('close', () => clearTimeout(deadline));
    request.on('error', reject);
  });
}
