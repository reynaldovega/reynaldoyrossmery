// Run locally only. The owner completes Google consent in their own browser.
import { createServer } from 'node:http';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
const env=process.env;
if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET) throw new Error('Configura GOOGLE_CLIENT_ID y GOOGLE_CLIENT_SECRET en .env. No los pegues en el chat.');
const redirect='http://127.0.0.1:8788/callback';
const state=randomBytes(32).toString('base64url');
const verifier=randomBytes(32).toString('base64url');
const params=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope:'https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'});
let used=false;
const server=createServer(async(req,res)=>{
  res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  const url=new URL(req.url,redirect);
  if(url.pathname==='/start') {res.writeHead(302,{Location:'https://accounts.google.com/o/oauth2/v2/auth?'+params});res.end();return;}
  if(url.pathname!=='/callback') {res.writeHead(404);res.end();return;}
  const received=Buffer.from(url.searchParams.get('state')||'');const expected=Buffer.from(state);
  if(used||received.length!==expected.length||!timingSafeEqual(received,expected)){res.writeHead(400);res.end('Solicitud no válida. Reinicia la conexión.');return;}
  used=true;
  try {
    if(!url.searchParams.get('code')) throw Error('Google no autorizó la conexión.');
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',signal:AbortSignal.timeout(30000),body:new URLSearchParams({code:url.searchParams.get('code'),client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirect,grant_type:'authorization_code',code_verifier:verifier})});
    if(!response.ok)throw Error('No se pudo completar la autorización.');
    const tokens=await response.json();if(!tokens.refresh_token)throw Error('Google no entregó un acceso duradero. Repite la autorización.');
    const folderResponse=await fetch('https://www.googleapis.com/drive/v3/files?fields=id',{method:'POST',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${tokens.access_token}`,'Content-Type':'application/json'},body:JSON.stringify({name:'Recuerdos privados · Rey & Rous · 26-09-2026',mimeType:'application/vnd.google-apps.folder'})});
    if(!folderResponse.ok)throw Error('No se pudo crear la carpeta privada.');
    const folder=await folderResponse.json();
    let contents='';try{contents=await readFile('.env','utf8');}catch{}
    const updates={GOOGLE_REFRESH_TOKEN:tokens.refresh_token,GOOGLE_DRIVE_FOLDER_ID:folder.id,MEMORIES_SESSION_KEY:env.MEMORIES_SESSION_KEY||randomBytes(32).toString('hex'),MEMORIES_ENABLED:'false'};
    for(const [name,value] of Object.entries(updates)) {
      const line=`${name}=${value}`;const pattern=new RegExp(`^${name}=.*$`,'m');contents=pattern.test(contents)?contents.replace(pattern,()=>line):contents.trimEnd()+'\n'+line+'\n';
    }
    // Atomic write; neither tokens nor the encryption key are printed.
    await writeFile('.env.pending',contents,{mode:0o600});await rename('.env.pending','.env');
    res.end('Drive conectado. Se creó una carpeta privada para la boda. Puedes cerrar esta pestaña. La recepción sigue desactivada hasta verificarla.');
    console.log('Conexión guardada en .env; carpeta privada creada. No compartas este archivo.');
  }catch(error){res.writeHead(500);res.end('No se completó la conexión. Vuelve a iniciar el asistente.');console.error('No se completó la conexión con Drive.');}
  finally{server.close();clearTimeout(timeout);}
});
server.listen(8788,'127.0.0.1',()=>console.log('Abre http://127.0.0.1:8788/start y autoriza únicamente la cuenta donde guardarás los recuerdos.'));
const timeout=setTimeout(()=>{server.close();console.log('La conexión expiró. Ejecuta de nuevo npm run connect-drive.');},30*60000);
