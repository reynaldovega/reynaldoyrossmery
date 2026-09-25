(() => {
  const root=document.querySelector('#recuerdos'); if(!root) return;
  const form=root.querySelector('form'), picker=root.querySelector('[data-memory-files]');
  const space=root.querySelector('[data-memory-space]'), note=root.querySelector('[data-memory-notice]');
  const gallery=root.querySelector('[data-memory-gallery]'), chosen=root.querySelector('[data-memory-chosen]');
  const status=root.querySelector('[data-memory-status]'), send=root.querySelector('[data-memory-send]');
  const empty=root.querySelector('[data-memory-empty]'), progress=root.querySelector('progress');
  const selected=new Map(); let busy=false, recoveryURL='';
  const base='/api/memories';
  async function api(path,body) {
    const response=await fetch(base+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    if(!response.headers.get('content-type')?.includes('application/json')) throw Error('El álbum privado todavía no está conectado. Vuelve pronto.');
    const data=await response.json(); if(!response.ok) {const error=Error(data.error||'No pudimos completar la operación.');error.status=response.status;throw error;}return data;
  }
  function message(text) {status.textContent=text;}
  function clearSelected() {for(const item of selected.values()) URL.revokeObjectURL(item.url);selected.clear();chosen.replaceChildren();send.disabled=true;}
  function showGuest(name) {
    form.hidden=true;space.hidden=false;note.hidden=true;
    root.querySelector('[data-memory-greeting]').textContent='Los recuerdos de '+name;
  }
  function showForm() {form.hidden=false;space.hidden=true;gallery.replaceChildren();clearSelected();recoveryURL='';root.querySelector('[data-memory-recovery-box]').hidden=true;}
  function makeMedia(src,type,name) {
    const container=document.createElement('div');
    const media=document.createElement(type.startsWith('video/')?'video':'img');
    if(media.tagName==='VIDEO') {media.controls=true;media.preload='none';media.playsInline=true;} else {media.alt=name;media.loading='lazy';}
    const fallback=document.createElement('p');fallback.textContent='Vista previa no disponible en este navegador. Puedes descargar el original.';fallback.hidden=true;
    media.addEventListener('error',()=>{media.hidden=true;fallback.hidden=false;});media.src=src;container.append(media,fallback);return container;
  }
  async function refresh() {
    const {files}=await api('/files');gallery.replaceChildren();empty.hidden=files.length>0;
    for(const file of files) {
      const card=document.createElement('figure');card.className='memory-item';
      const caption=document.createElement('figcaption');caption.textContent=file.name+' · Guardado';
      const download=document.createElement('a');download.href=file.url+'?download';download.textContent='Descargar original';download.download=file.name;
      card.append(makeMedia(file.url,file.type,file.name),caption,download);gallery.append(card);
    }
  }
  async function start() {
    form.querySelector('button').disabled=true;
    try {
      const health=await api('/status');
      if(!health.available) throw Error('Estamos preparando tu espacio privado. La carga de recuerdos todavía no está disponible.');
      note.hidden=true;form.querySelector('button').disabled=false;
      try {const me=await api('/session');showGuest(me.name);await refresh();}
      catch(error) {if(error.status!==401) throw error;}
    } catch(error) {note.hidden=false;note.textContent=error.message;}
  }
  form.addEventListener('submit',async event=>{
    event.preventDefault();const name=form.elements.guestName.value.trim();if(!name) return;
    const button=form.querySelector('button');button.disabled=true;note.hidden=true;
    try {const me=await api('/session',{name});showGuest(me.name);message('Tu espacio está listo. Guarda tu enlace privado para poder volver.');await refresh();root.querySelector('[data-memory-greeting]').focus();}
    catch(error) {note.textContent=error.message;note.hidden=false;}finally{button.disabled=false;}
  });
  root.querySelector('[data-memory-select]').addEventListener('click',()=>{if(!busy)picker.click();});
  picker.addEventListener('change',()=>{
    if(busy)return;
    let rejected=0;
    const types=new Set(['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif','video/mp4','video/quicktime','video/webm']);
    for(const file of picker.files) {
      if(!types.has(file.type)||file.size>100*1024**2||file.size<12||selected.size>=20){rejected++;continue;}
      const id=file.name+':'+file.size+':'+file.lastModified;if(selected.has(id))continue;
      const url=URL.createObjectURL(file);selected.set(id,{file,url});
      const card=document.createElement('figure');card.className='memory-item';
      const caption=document.createElement('figcaption');caption.textContent=file.name+' · Pendiente de enviar';
      const remove=document.createElement('button');remove.type='button';remove.textContent='Quitar de la selección';
      remove.addEventListener('click',()=>{if(busy)return;URL.revokeObjectURL(url);selected.delete(id);card.remove();send.disabled=selected.size===0;});
      card.append(makeMedia(url,file.type,file.name),caption,remove);chosen.append(card);
    }
    picker.value='';send.disabled=selected.size===0;
    message(selected.size+' archivo(s) listos para enviar.'+(rejected?' Algunos no se añadieron: máximo 100 MB por archivo y 20 por envío; revisa los formatos admitidos.':''));
  });
  function upload(id,file) {
    return new Promise((resolve,reject)=>{
      const xhr=new XMLHttpRequest();xhr.open('PUT',base+'/uploads/'+id);xhr.setRequestHeader('Content-Type',file.type);xhr.timeout=10*60000;
      xhr.upload.onprogress=event=>{if(event.lengthComputable)progress.value=Math.round(event.loaded/event.total*100);};
      xhr.onload=()=>{let data;try{data=JSON.parse(xhr.responseText);}catch{reject(Error('Respuesta inesperada. Actualiza la galería antes de volver a enviar.'));return;}if(xhr.status>=200&&xhr.status<300)resolve(data);else reject(Error(data.error||'No se pudo completar la carga.'));};
      xhr.onerror=xhr.ontimeout=()=>reject(Error('Se interrumpió la conexión. Actualiza la galería antes de volver a enviar para comprobar si el archivo llegó.'));
      xhr.send(file);
    });
  }
  send.addEventListener('click',async()=>{
    if(busy||!selected.size)return;busy=true;send.disabled=true;progress.hidden=false;
    root.querySelectorAll('[data-memory-select],[data-memory-logout]').forEach(b=>b.disabled=true);
    let sent=0;const total=selected.size;
    try {
      for(const [id,{file,url}] of selected) {
        progress.value=0;message('Enviando '+(sent+1)+' de '+total+': '+file.name+'. Mantén esta página abierta.');
        const {uploadId}=await api('/uploads',{name:file.name,type:file.type,size:file.size});
        await upload(uploadId,file);URL.revokeObjectURL(url);selected.delete(id);chosen.firstElementChild?.remove();sent++;
      }
      message('Tus recuerdos quedaron guardados. Gracias por compartir este día con nosotros.');
    } catch(error) {message(sent+' archivo(s) guardado(s). '+error.message);}
    finally {busy=false;send.disabled=!selected.size;progress.hidden=true;root.querySelectorAll('[data-memory-select],[data-memory-logout]').forEach(b=>b.disabled=false);try{await refresh();}catch{message('No pudimos actualizar tu galería. Usa “Actualizar mis recuerdos” antes de volver a enviar.');}}
  });
  root.querySelector('[data-memory-refresh]').addEventListener('click',async()=>{try{await refresh();message('Tu galería está actualizada.');}catch(error){message(error.message);}});
  root.querySelector('[data-memory-recovery]').addEventListener('click',async()=>{
    try {
      if(!recoveryURL)recoveryURL=(await api('/recovery',{})).url;
      const box=root.querySelector('[data-memory-recovery-box]');box.hidden=false;box.querySelector('textarea').value=recoveryURL;
      try{await navigator.clipboard.writeText(recoveryURL);message('Enlace privado copiado. Guárdalo en un lugar seguro; quien lo tenga podrá entrar a tu espacio.');}
      catch{message('Copia y guarda el enlace privado que aparece debajo. No lo compartas.');}
    }catch(error){message(error.message);}
  });
  root.querySelector('[data-memory-logout]').addEventListener('click',async()=>{
    if(busy)return;if(!window.confirm('¿Guardaste tu enlace privado? Lo necesitarás para volver a ver tus recuerdos después de salir.'))return;
    try{await api('/logout',{});showForm();}catch(error){message(error.message);}
  });
  window.addEventListener('beforeunload',event=>{if(busy){event.preventDefault();event.returnValue='';}});
  start();
})();
