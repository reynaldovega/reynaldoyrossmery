import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const MAX_FILE = 100 * 1024 * 1024;
export const MAX_GUEST = 1024 * 1024 * 1024;
export const MAX_EVENT = 100 * 1024 * 1024 * 1024;
export const MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm']);
const AGE = 90 * 24 * 60 * 60;

export function sessions(keyHex, secure = true) {
  if (!/^[a-f0-9]{64}$/i.test(keyHex || '')) throw new Error('MEMORIES_SESSION_KEY debe contener 32 bytes aleatorios hexadecimales.');
  const key = Buffer.from(keyHex, 'hex');
  const cookieName = secure ? '__Host-wedding' : 'wedding-local';
  function issue(guest) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('wedding-memories-v1'));
    const payload = Buffer.from(JSON.stringify({ ...guest, exp: Math.floor(Date.now() / 1000) + AGE, v: 1 }));
    return Buffer.concat([iv, cipher.update(payload), cipher.final(), cipher.getAuthTag()]).toString('base64url');
  }
  function decode(token) {
    try {
      if (!/^[A-Za-z0-9_-]{60,1400}$/.test(token || '')) throw Error();
      const raw = Buffer.from(token, 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
      decipher.setAAD(Buffer.from('wedding-memories-v1'));
      decipher.setAuthTag(raw.subarray(-16));
      const value = JSON.parse(Buffer.concat([decipher.update(raw.subarray(12, -16)), decipher.final()]));
      if (value.v !== 1 || value.exp <= Date.now() / 1000 || !/^[\w-]+$/.test(value.folderId) || typeof value.name !== 'string') throw Error();
      return value;
    } catch { throw new HttpError(401, 'Tu acceso no está disponible. Abre tu enlace privado para recuperarlo.'); }
  }
  function read(req) {
    return (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  }
  function cookie(token) {
    return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? AGE : 0}${secure ? '; Secure' : ''}`;
  }
  return { issue, decode, read, cookie };
}

export function validSignature(type, bytes) {
  const ascii = (a, b) => bytes.subarray(a, b).toString('ascii');
  if (type === 'image/jpeg') return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (type === 'image/gif') return ['GIF87a','GIF89a'].includes(ascii(0,6));
  if (type === 'image/webp') return ascii(0,4) === 'RIFF' && ascii(8,12) === 'WEBP';
  if (type === 'video/webm') return bytes.subarray(0,4).equals(Buffer.from([26,69,223,163]));
  if (['video/mp4','video/quicktime','image/heic','image/heif'].includes(type)) return ascii(4,8) === 'ftyp';
  return false;
}

export async function jsonBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Formato no admitido.');
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 8192) throw new HttpError(413, 'Solicitud demasiado grande.'); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks)); } catch { throw new HttpError(400, 'Solicitud no válida.'); }
}

export function validateFile(data) {
  if (!Number.isSafeInteger(data.size) || data.size < 12 || data.size > MAX_FILE) throw new HttpError(400, 'Cada archivo debe pesar como máximo 100 MB.');
  if (!MIME_TYPES.has(data.type)) throw new HttpError(400, 'Formato no admitido. Usa JPG, PNG, GIF, WebP, HEIC, MP4, MOV o WebM.');
  const name = String(data.name || '').replace(/[\x00-\x1f\x7f/\\]/g, '').trim().slice(0,180);
  if (!name) throw new HttpError(400, 'El archivo necesita un nombre.');
  return { name, size: data.size, type: data.type };
}
