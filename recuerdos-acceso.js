(() => {
  const token=location.hash.slice(1);
  history.replaceState(null,'',location.pathname);
  const status=document.querySelector('#recovery-status');
  if(!token){status.textContent='Abre el enlace privado completo que guardaste al crear tu espacio.';return;}
  fetch('/api/memories/recover',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})})
    .then(async response=>{if(!response.headers.get('content-type')?.includes('application/json'))throw Error('El álbum todavía no está conectado.');const body=await response.json();if(!response.ok)throw Error(body.error);location.replace('/#recuerdos');})
    .catch(error=>{status.textContent=error.message||'No pudimos recuperar tu espacio. Comprueba tu enlace privado.';});
})();
