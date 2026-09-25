import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { sessions, HttpError, jsonBody, validateFile, validSignature, MAX_FILE, MAX_GUEST, MAX_EVENT, MIME_TYPES } from './security.mjs';

const ASSET_TYPES = { '.html':'text/html; charset=utf-8', '.css':'text/css', '.js':'text/javascript', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.mp3':'audio/mpeg', '.mp4':'video/mp4', '.ico':'image/x-icon' };
const ID = /^[A-Za-z0-9_-]{8,180}$/;
const publicFile = f => ({ id:f.id, name:f.name, type:f.mimeType, size:Number(f.size), createdAt:f.createdTime, url:`/api/memories/files/${f.id}/content` });
function send(res, status, data) { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); }

export function createApp({ drive, key, origin, enabled = false, publicDir, trustProxy = false }) {
  const secure = new URL(origin).protocol === 'https:';
  const auth = key ? sessions(key, secure) : null;
  const pending = new Map(), rates = new Map();
  let queue = Promise.resolve();
  function locked(fn) { const job = queue.then(fn); queue = job.catch(() => {}); return job; }
  function limit(req, action, max) {
    // Render sets X-Forwarded-For; use its last hop, never the attacker-supplied first entry.
    const ip = trustProxy ? (req.headers['x-forwarded-for']?.split(',').at(-1)?.trim() || req.socket.remoteAddress) : req.socket.remoteAddress;
    const key = `${action}:${ip}`; const now = Date.now();
    for (const [id,v] of rates) if (v.until <= now) rates.delete(id);
    const value = rates.get(key) || { count:0, until:now + 3600000 };
    value.count++; rates.set(key, value);
    if (value.count > max) throw new HttpError(429, 'Demasiados intentos. Espera un momento antes de continuar.');
  }
  function sweep() { for (const [id,item] of pending) if (!item.active && item.until < Date.now()) pending.delete(id); }
  async function guestFor(req) { const guest = auth.decode(auth.read(req)); await drive.assertGuest(guest); return guest; }
  function own(file, guest) {
    if (!file || file.trashed || !file.parents?.includes(guest.folderId) || !MIME_TYPES.has(file.mimeType)) throw new HttpError(404, 'Archivo no disponible.');
  }
  const server = createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');
    res.setHeader('X-Frame-Options','DENY');
    try {
      const url = new URL(req.url, origin);
      if (url.pathname === '/healthz') return send(res,200,{ server:'ok' });
      if (!url.pathname.startsWith('/api/')) return await staticFile(req,res,url.pathname,publicDir);
      res.setHeader('Cache-Control','no-store, private');
      res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
      if (!url.pathname.startsWith('/api/memories/')) throw new HttpError(404,'No disponible.');
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new HttpError(403,'Abre el álbum desde su enlace original.');
      if (!['GET','HEAD'].includes(req.method) && req.headers.origin !== origin) throw new HttpError(403,'Solicitud de otro sitio rechazada.');
      if (!enabled || !drive || !auth) {
        if (url.pathname === '/api/memories/status' && req.method === 'GET') return send(res,200,{ available:false });
        throw new HttpError(503,'Estamos preparando el álbum privado. Vuelve pronto.');
      }
      // Fail closed if the owner accidentally shares the root folder.
      await drive.ready();
      const path = url.pathname.slice('/api/memories'.length);
      if (path === '/status' && req.method === 'GET') return send(res,200,{ available:true,maxFile:MAX_FILE,maxGuest:MAX_GUEST });
      if (path === '/session' && req.method === 'POST') {
        limit(req,'create',300);
        const body = await jsonBody(req); const name = String(body.name || '').trim().replace(/[\x00-\x1f\x7f]/g,'');
        if (!name || name.length > 80) throw new HttpError(400,'Escribe tu nombre (máximo 80 caracteres).');
        // Creating an account never looks up another account by name.
        const guest = await drive.createGuest(name), token = auth.issue(guest);
        res.setHeader('Set-Cookie',auth.cookie(token)); return send(res,201,{ name:guest.name });
      }
      if (path === '/recover' && req.method === 'POST') {
        limit(req,'recover',100); const { token } = await jsonBody(req);
        const guest = auth.decode(token); await drive.assertGuest(guest);
        res.setHeader('Set-Cookie',auth.cookie(token)); return send(res,200,{name:guest.name});
      }
      if (path === '/logout' && req.method === 'POST') { res.setHeader('Set-Cookie',auth.cookie('')); return send(res,200,{ok:true}); }
      const guest = await guestFor(req);
      if (path === '/session' && req.method === 'GET') return send(res,200,{name:guest.name});
      if (path === '/recovery' && req.method === 'POST') return send(res,200,{url:`${origin}/recuerdos-acceso.html#${auth.read(req)}`});
      if (path === '/files' && req.method === 'GET') return send(res,200,{files:(await drive.files(guest)).filter(f=>MIME_TYPES.has(f.mimeType)).map(publicFile)});
      if (path === '/uploads' && req.method === 'POST') {
        limit(req,'reserve',1500); const file = validateFile(await jsonBody(req));
        const uploadId = await locked(async () => {
          sweep(); const reserved = [...pending.values()];
          if (reserved.length >= 60 || reserved.filter(x=>x.guest.folderId===guest.folderId).length >= 3) throw new HttpError(429,'Hay cargas en curso. Espera un momento.');
          const files = await drive.files(guest), usage = await drive.usage();
          const mine = files.reduce((n,f)=>n+Number(f.size||0),0) + reserved.filter(x=>x.guest.folderId===guest.folderId).reduce((n,x)=>n+x.file.size,0);
          const totalReserved = reserved.reduce((n,x)=>n+x.file.size,0);
          if (mine+file.size > MAX_GUEST) throw new HttpError(413,'Tu espacio alcanzó el límite de 1 GB.');
          if (usage.total+totalReserved+file.size > MAX_EVENT || usage.free-totalReserved-file.size < 2*1024**3) throw new HttpError(413,'El álbum está lleno. Avisa a los novios.');
          const location = await drive.begin(guest,file), id = randomBytes(24).toString('base64url');
          pending.set(id,{guest,file,location,active:false,until:Date.now()+30*60000}); return id;
        });
        return send(res,201,{uploadId});
      }
      const upload = path.match(/^\/uploads\/([\w-]+)$/);
      if (upload && req.method === 'PUT') {
        sweep(); const item = pending.get(upload[1]);
        if (!item || item.guest.folderId !== guest.folderId) throw new HttpError(404,'Esta carga ya no está disponible. Selecciona el archivo de nuevo.');
        if (item.active) throw new HttpError(409,'Este archivo ya se está enviando.');
        if (req.headers['content-type'] !== item.file.type || Number(req.headers['content-length']) !== item.file.size) throw new HttpError(400,'El tamaño o formato del archivo no coincide.');
        item.active = true;
        try {
          // Read a small prefix before opening the Drive upload; never buffer entire videos.
          const iterator = req[Symbol.asyncIterator](); let prefix = Buffer.alloc(0);
          while (prefix.length < 16) { const next = await iterator.next(); if (next.done) break; prefix=Buffer.concat([prefix,next.value]); }
          if (!validSignature(item.file.type,prefix)) throw new HttpError(400,'El contenido no corresponde a una foto o video admitido.');
          async function* chunks() {
            let size = prefix.length;
            if (size > item.file.size) throw new HttpError(413,'Archivo demasiado grande.');
            yield prefix;
            for (;;) { const next=await iterator.next(); if(next.done) break; size+=next.value.length; if(size>item.file.size) throw new HttpError(413,'Archivo demasiado grande.'); yield next.value; }
            if(size!==item.file.size) throw new HttpError(400,'La carga quedó incompleta.');
          }
          const file = await drive.upload(item.location,item.file,Readable.from(chunks()),AbortSignal.timeout(10*60000));
          return send(res,201,{file:publicFile(file)});
        } finally { pending.delete(upload[1]); }
      }
      const media = path.match(/^\/files\/([\w-]+)\/content$/);
      if (media && ['GET','HEAD'].includes(req.method)) {
        if (!ID.test(media[1])) throw new HttpError(404,'Archivo no disponible.');
        const file=await drive.metadata(media[1]); own(file,guest);
        const range=req.headers.range;
        if (range && !/^bytes=\d*-\d*$/.test(range)) throw new HttpError(416,'Rango no admitido.');
        const response=await drive.media(file.id,range);
        res.statusCode=response.status;
        res.setHeader('Content-Type',file.mimeType);
        res.setHeader('Content-Disposition',`${url.searchParams.has('download')?'attachment':'inline'}; filename*=UTF-8''${encodeURIComponent(file.name).replace(/'/g,'%27')}`);
        for (const h of ['content-length','content-range','accept-ranges']) if(response.headers.get(h)) res.setHeader(h,response.headers.get(h));
        if(req.method==='HEAD') { await response.body?.cancel(); return res.end(); }
        return await pipeline(Readable.fromWeb(response.body),res);
      }
      throw new HttpError(404,'No disponible.');
    } catch(error) {
      if(res.headersSent || res.destroyed) { res.destroy(); return; }
      // Never log URLs, cookies, OAuth secrets, or upstream response bodies.
      if(!error.status) console.error('Fallo interno en recuerdos:',error.name);
      send(res,error.status||503,{error:error.status?error.message:'No pudimos completar la operación. Inténtalo más tarde.'});
    }
  });
  server.requestTimeout = 11*60000;
  return server;
}

async function staticFile(req,res,path,dir) {
  if (!['GET','HEAD'].includes(req.method)) throw new HttpError(405,'Método no permitido.');
  let decoded; try { decoded=decodeURIComponent(path); } catch { throw new HttpError(400,'Ruta no válida.'); }
  const relative=decoded==='/'?'index.html':decoded.slice(1);
  // An allowlist keeps .env, server code, configuration, SQL and tests off the web.
  if(relative.split(/[\\/]/).some(x=>x.startsWith('.')||x==='server') || !ASSET_TYPES[extname(relative)] || relative.includes('\\')) throw new HttpError(404,'No disponible.');
  const file=resolve(dir,relative);
  if(!file.startsWith(resolve(dir)+sep)) throw new HttpError(404,'No disponible.');
  let info; try {info=await stat(file);} catch {throw new HttpError(404,'No disponible.');}
  if(!info.isFile()) throw new HttpError(404,'No disponible.');
  res.setHeader('Content-Type',ASSET_TYPES[extname(file)]);
  res.setHeader('Cache-Control',extname(file)==='.html'?'no-cache':'public, max-age=300');
  res.setHeader('Content-Length',info.size);
  if(req.method==='HEAD') return res.end();
  await pipeline(createReadStream(file),res);
}
