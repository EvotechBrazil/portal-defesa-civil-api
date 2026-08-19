import { BadRequestException } from '@nestjs/common';

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface DecodedPhoto {
  bytes: Buffer;
  mime: string;
}

export function decodePhotoBase64(raw: string): DecodedPhoto {
  const trimmed = raw.trim();
  const dataUrl = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i.exec(
    trimmed,
  );
  const mime = dataUrl ? dataUrl[1].toLowerCase() : 'image/jpeg';
  const payload = dataUrl ? dataUrl[2] : trimmed;
  if (!ALLOWED_MIME.has(mime)) {
    throw new BadRequestException('A foto deve ser JPEG, PNG ou WebP.');
  }
  const bytes = Buffer.from(payload.replace(/\s/g, ''), 'base64');
  if (bytes.length === 0) {
    throw new BadRequestException('A foto enviada é inválida.');
  }
  if (bytes.length > MAX_PHOTO_BYTES) {
    throw new BadRequestException('A foto deve ter no máximo 2 MB.');
  }
  return { bytes, mime };
}
