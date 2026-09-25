// Explicit real-Drive smoke test: creates two named test spaces in the wedding folder.
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Drive } from './drive.mjs';
import { createApp } from './app.mjs';
process.loadEnvFile('.env');
const origin='http://127.0.0.1:8791';
const app=createApp({drive:new Drive(process.env),key:process.env.MEMORIES_SESSION_KEY,origin,enabled:true,publicDir:process.cwd()});
app.listen(8791,'127.0.0.1');await once(app,'listening');
const report=[];
async function call(path,{cookie,body,method=body===undefined?'GET':'POST',type='application/json',range}={}) {
  return fetch(origin+'/api/memories'+path,{method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(body!==undefined?{'Content-Type':type}:{}),...(range?{Range:range}:{})},body:body===undefined?undefined:type==='application/json'?JSON.stringify(body):body});
}
async function guest() {const res=await call('/session',{body:{name:'Prueba técnica del álbum'}});assert.equal(res.status,201);return res.headers.get('set-cookie').split(';')[0];}
try {
  const a=await guest(),b=await guest();assert.notEqual(a,b);
  report.push('Dos espacios con el mismo nombre tienen accesos distintos.');
  for(const [path,type,name] of [['assets/fotos/historia-pareja-beso.jpeg','image/jpeg','PRUEBA-foto.jpeg'],['regalos-video.mp4','video/mp4','PRUEBA-video.mp4']]) {
    const bytes=await readFile(path);const reserved=await call('/uploads',{cookie:a,body:{name,type,size:bytes.length}});
    if(reserved.status!==201)throw Error('Reserva falló: '+(await reserved.json()).error);
    const {uploadId}=await reserved.json();const uploaded=await call('/uploads/'+uploadId,{cookie:a,method:'PUT',type,body:bytes});
    if(uploaded.status!==201)throw Error('Subida falló: '+(await uploaded.json()).error);
    const {file}=await uploaded.json();const url=file.url.replace('/api/memories','');
    const own=await call(url,{cookie:a});assert.equal(own.status,200);
    const returned=Buffer.from(await own.arrayBuffer());
    assert.equal(createHash('sha256').update(returned).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
    const foreign=await call(url,{cookie:b});assert.equal(foreign.status,404);
    const anonymous=await call(url);assert.equal(anonymous.status,401);
    if(type.startsWith('video')) {const partial=await call(url,{cookie:a,range:'bytes=0-1023'});assert.equal(partial.status,206);assert.equal((await partial.arrayBuffer()).byteLength,1024);}
    report.push(name+': guardado en Drive, descarga idéntica y acceso ajeno bloqueado.');
  }
  const list=await (await call('/files',{cookie:a})).json();assert.equal(list.files.length,2);
  assert.equal((await (await call('/files',{cookie:b})).json()).files.length,0);
  const link=await (await call('/recovery',{cookie:a,body:{}})).json();
  const recovered=await call('/recover',{body:{token:new URL(link.url).hash.slice(1)}});assert.equal(recovered.status,200);
  const restored=recovered.headers.get('set-cookie').split(';')[0];assert.equal((await (await call('/files',{cookie:restored})).json()).files.length,2);
  report.push('Recuperación de espacio y listado persistente comprobados.');
  console.log(report.join('\n'));
} catch(error) {console.error('Prueba real incompleta:',error.message);process.exitCode=1;}
finally {app.closeAllConnections();await new Promise(r=>app.close(r));}
