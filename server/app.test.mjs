import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';
import { sessions, HttpError, MAX_EVENT } from './security.mjs';

// Synthetic credentials and files only. No remote account is contacted.
const KEY='ab'.repeat(32);
class FakeDrive {
  constructor(){this.guests=new Map();this.items=new Map();this.uploads=new Map();this.count=0;this.total=0;this.open=true;}
  async ready(){if(!this.open)throw new HttpError(503,'Álbum cerrado.');}
  async createGuest(name){const guest={folderId:'folder_'+(++this.count),name};this.guests.set(guest.folderId,guest);return guest;}
  async assertGuest(g){if(!this.guests.has(g.folderId))throw new HttpError(401,'No disponible.');}
  async files(g){return [...this.items.values()].filter(f=>f.parents.includes(g.folderId));}
  async usage(){return{total:this.total,free:40*1024**3};}
  async begin(g,f){const id='upload_'+(++this.count);this.uploads.set(id,{g,f});return id;}
  async upload(id,f,stream){const chunks=[];for await(const chunk of stream)chunks.push(chunk);const {g}=this.uploads.get(id);const item={id:'file_'+(++this.count)+'_private',name:f.name,mimeType:f.type,size:f.size,parents:[g.folderId],createdTime:new Date().toISOString(),data:Buffer.concat(chunks)};this.items.set(item.id,item);return item;}
  async metadata(id){const f=this.items.get(id);if(!f)throw new HttpError(404,'No disponible.');return f;}
  async media(id){const f=await this.metadata(id);return new Response(f.data,{headers:{'content-length':String(f.data.length)}});}
}
async function fixture(t,{enabled=true}={}){
  const drive=new FakeDrive();
  // Bind first to obtain an origin without trusting request Host headers.
  const net=await import('node:net');const probe=net.createServer().listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
  const origin='http://127.0.0.1:'+port;
  const server=createApp({drive,key:KEY,origin,enabled,publicDir:fileURLToPath(new URL('../',import.meta.url))});server.listen(port,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
  async function call(path,{method='GET',body,cookie,origin:source=origin,type='application/json'}={}){
    return fetch(origin+path,{method,headers:{Origin:source,...(body!==undefined?{'Content-Type':type}:{}),...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:type==='application/json'?JSON.stringify(body):body});
  }
  async function guest(name='Ana') {const r=await call('/api/memories/session',{method:'POST',body:{name}});assert.equal(r.status,201);return r.headers.get('set-cookie').split(';')[0];}
  return {drive,server,call,guest,origin};
}
const png=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0,73,72,68,82]);
async function reserve(f,cookie,name='foto.png') {const r=await f.call('/api/memories/uploads',{method:'POST',cookie,body:{name,type:'image/png',size:png.length}});assert.equal(r.status,201);return (await r.json()).uploadId;}

test('duplicate names have isolated galleries, media, and pending uploads',async t=>{
  const f=await fixture(t),a=await f.guest(),b=await f.guest();assert.notEqual(a,b);
  const uploadId=await reserve(f,a);
  assert.equal((await f.call('/api/memories/uploads/'+uploadId,{method:'PUT',cookie:b,type:'image/png',body:png})).status,404);
  const result=await f.call('/api/memories/uploads/'+uploadId,{method:'PUT',cookie:a,type:'image/png',body:png});assert.equal(result.status,201);const {file}=await result.json();
  assert.equal((await (await f.call('/api/memories/files',{cookie:a})).json()).files.length,1);
  assert.equal((await (await f.call('/api/memories/files',{cookie:b})).json()).files.length,0);
  assert.equal((await f.call(file.url,{cookie:b})).status,404);
  assert.equal((await f.call(file.url)).status,401);
  const own=await f.call(file.url,{cookie:a});assert.equal(own.status,200);assert.deepEqual(Buffer.from(await own.arrayBuffer()),png);assert.match(own.headers.get('cache-control'),/no-store/);
});
test('recovery restores the correct guest and manipulated tokens are rejected',async t=>{
  const f=await fixture(t),cookie=await f.guest('Mía');
  const recovery=await (await f.call('/api/memories/recovery',{method:'POST',cookie,body:{}})).json();
  const token=new URL(recovery.url).hash.slice(1);
  const recovered=await f.call('/api/memories/recover',{method:'POST',body:{token}});assert.equal(recovered.status,200);assert.deepEqual(await recovered.json(),{name:'Mía'});
  const corrupt=token.slice(0,20)+(token[20]==='A'?'B':'A')+token.slice(21);
  assert.equal((await f.call('/api/memories/recover',{method:'POST',body:{token:corrupt}})).status,401);
  assert.equal((await f.call('/api/memories/recover',{method:'POST',body:{name:'Mía'}})).status,401);
  const secure=sessions(KEY,true).cookie(token);assert.match(secure,/__Host-wedding=/);assert.match(secure,/HttpOnly/);assert.match(secure,/SameSite=Lax/);assert.match(secure,/; Secure/);
});
test('server restart preserves sessions; expired tokens do not authenticate',async t=>{
  const a=sessions(KEY,false);const token=a.issue({folderId:'folder_123',name:'Ana'});assert.equal(sessions(KEY,false).decode(token).name,'Ana');
  const oldNow=Date.now;try{Date.now=()=>oldNow()+91*24*3600*1000;assert.throws(()=>a.decode(token),e=>e.status===401);}finally{Date.now=oldNow;}
});
test('cross-origin writes, disguised HTML, oversize and unsupported files fail',async t=>{
  const f=await fixture(t),cookie=await f.guest();
  assert.equal((await f.call('/api/memories/session',{method:'POST',origin:'https://evil.example',body:{name:'Ana'}})).status,403);
  for(const body of [{name:'x.html',type:'text/html',size:40},{name:'x.png',type:'image/png',size:101*1024**2}])assert.equal((await f.call('/api/memories/uploads',{method:'POST',cookie,body})).status,400);
  const id=await reserve(f,cookie);
  const disguised=await f.call('/api/memories/uploads/'+id,{method:'PUT',cookie,type:'image/png',body:Buffer.from('<script>bad</script>').subarray(0,png.length)});
  assert.equal(disguised.status,400);assert.match((await disguised.json()).error,/contenido/);
  assert.equal(f.drive.items.size,0);
});
test('event quota and accidental sharing fail closed',async t=>{
  const f=await fixture(t),cookie=await f.guest();f.drive.total=MAX_EVENT;
  assert.equal((await f.call('/api/memories/uploads',{method:'POST',cookie,body:{name:'a.png',size:png.length,type:'image/png'}})).status,413);
  f.drive.open=false;assert.equal((await f.call('/api/memories/files',{cookie})).status,503);
});
test('pending uploads reserve capacity and revoked guest folders invalidate recovery',async t=>{
  const f=await fixture(t),cookie=await f.guest();f.drive.total=MAX_EVENT-png.length;
  await reserve(f,cookie);
  assert.equal((await f.call('/api/memories/uploads',{method:'POST',cookie,body:{name:'b.png',size:png.length,type:'image/png'}})).status,413);
  const link=await (await f.call('/api/memories/recovery',{method:'POST',cookie,body:{}})).json();
  f.drive.guests.clear();
  assert.equal((await f.call('/api/memories/recover',{method:'POST',body:{token:new URL(link.url).hash.slice(1)}})).status,401);
});
test('unconfigured service accepts no guests and serves no private source files',async t=>{
  const f=await fixture(t,{enabled:false});
  assert.deepEqual(await (await f.call('/api/memories/status')).json(),{available:false});
  assert.equal((await f.call('/api/memories/session',{method:'POST',body:{name:'Ana'}})).status,503);
  for(const path of ['/.env','/server/start.mjs','/server/app.test.mjs','/package.json','/supabase-setup.sql'])assert.equal((await f.call(path)).status,404,path);
  assert.equal((await f.call('/')).status,200);
});
