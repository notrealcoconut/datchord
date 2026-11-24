import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ApiError } from './errors.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(projectRoot, 'data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const TYPES = {
  'image/png': { ext: 'png', check: (buffer) => buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  'image/jpeg': { ext: 'jpg', check: (buffer) => buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff },
  'image/webp': {
    ext: 'webp',
    check: (buffer) => buffer.length > 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP',
  },
};

export function saveImage(dataUrl, prefix = 'image') {
  if (typeof dataUrl !== 'string') throw new ApiError('INVALID_IMAGE', 400, 'image');
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
  if (!match) throw new ApiError('INVALID_IMAGE_TYPE', 400, 'image');
  const type = TYPES[match[1]];
  if (!type) throw new ApiError('INVALID_IMAGE_TYPE', 400, 'image');
  let buffer;
  try {
    buffer = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  } catch {
    throw new ApiError('INVALID_IMAGE', 400, 'image');
  }
  if (buffer.length === 0) throw new ApiError('INVALID_IMAGE', 400, 'image');
  if (buffer.length > MAX_IMAGE_BYTES) throw new ApiError('IMAGE_TOO_LARGE', 413, 'image');
  if (!type.check(buffer)) throw new ApiError('INVALID_IMAGE_TYPE', 400, 'image');
  const filename = `${prefix}-${randomUUID()}.${type.ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  writeFileSync(filePath, buffer, { mode: 0o644 });
  return { url: `/uploads/${filename}`, filePath };
}

export function deleteUpload(url) {
  if (typeof url !== 'string') return;
  const match = /^\/uploads\/([a-z0-9-]+\.(?:png|jpg|webp))$/i.exec(url);
  if (!match) return;
  const filePath = path.join(UPLOAD_DIR, match[1]);
  try {
    if (existsSync(filePath)) unlinkSync(filePath);
  } catch {
    /* A stale upload should never block a profile or server update. */
  }
}
