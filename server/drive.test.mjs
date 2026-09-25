import test from 'node:test';
import assert from 'node:assert/strict';
import { Drive } from './drive.mjs';

test('Drive checks root privacy and creates folders with no public permissions',async()=>{
  const original=globalThis.fetch;const calls=[];let shared=false;
  globalThis.fetch=async(url,options={})=>{
    calls.push({url:String(url),options});
    if(String(url).includes('oauth2.googleapis.com'))return Response.json({access_token:'synthetic-test-only',expires_in:3600});
    if(options.method==='POST')return Response.json({id:'new_folder'});
    return Response.json({mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true},permissions:shared?[{type:'anyone',role:'reader'}]:[{type:'user',role:'owner'}]});
  };
  try{
    const drive=new Drive({GOOGLE_DRIVE_FOLDER_ID:'root_test'});await drive.ready();
    const guest=await drive.createGuest('Ana');assert.equal(guest.name,'Ana');
    const created=JSON.parse(calls.at(-1).options.body);assert.deepEqual(created.parents,['root_test']);assert.equal(created.permissions,undefined);
    assert.equal(calls.filter(x=>x.url.includes('oauth2.googleapis.com')).length,1);
    shared=true;await assert.rejects(drive.ready(),error=>error.status===503);
  }finally{globalThis.fetch=original;}
});
test('Drive paginates galleries and keeps resumable URLs on the server',async()=>{
  const original=globalThis.fetch;let listCalls=0;
  globalThis.fetch=async(url,options={})=>{
    if(String(url).includes('oauth2.googleapis.com'))return Response.json({access_token:'synthetic-test-only',expires_in:3600});
    if(String(url).includes('/upload/'))return new Response(null,{status:200,headers:{location:'https://www.googleapis.com/upload/drive/v3/files?upload_id=synthetic'}});
    listCalls++;return Response.json(listCalls===1?{files:[{id:'first'}],nextPageToken:'next'}:{files:[{id:'second'}]});
  };
  try{
    const drive=new Drive({GOOGLE_DRIVE_FOLDER_ID:'root_test'});
    assert.deepEqual((await drive.files({folderId:'guest_test'})).map(f=>f.id),['first','second']);
    assert.match(await drive.begin({folderId:'guest_test'},{name:'a.png',type:'image/png',size:16}),/^https:\/\/www.googleapis.com/);
  }finally{globalThis.fetch=original;}
});
