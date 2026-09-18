(() => {
  const section = document.querySelector('#programa');
  if (!section) return;
  const envelope = section.querySelector('[data-program-open]');
  const letter = section.querySelector('[data-program-letter]');
  const title = section.querySelector('#program-letter-title');
  const card = section.querySelector('.program-envelope__card');
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  let timer, flight, animation, run = 0;
  function cleanFlight() { animation?.cancel(); animation = null; flight?.remove(); flight = null; }
  function reset() {
    run++; clearTimeout(timer); cleanFlight(); letter.hidden = true;
    section.classList.remove('program-open','program-opening','program-travelling');
    envelope.setAttribute('aria-expanded','false');
  }
  function reveal() {
    section.classList.remove('program-travelling');
    section.classList.add('program-open');
    title.focus({preventScroll:true});
  }
  envelope.addEventListener('click', () => {
    if (envelope.getAttribute('aria-expanded') === 'true') return;
    const current = ++run;
    envelope.setAttribute('aria-expanded','true');
    section.classList.add('program-opening');
    if (reduced()) {
      letter.hidden = false; reveal();
      letter.scrollIntoView({behavior:'instant',block:'start'}); return;
    }
    timer = setTimeout(async () => {
      const origin = card.getBoundingClientRect();
      section.classList.add('program-travelling');
      letter.hidden = false;
      const base = section.getBoundingClientRect();
      const target = section.querySelector('.program-spread').getBoundingClientRect();
      const mobile = matchMedia('(max-width:680px)').matches;
      const width = mobile ? target.width : target.width / 2;
      const height = Math.min(width * 1.15, 440);
      flight = document.createElement('div');
      flight.className = 'program-flying-paper';
      flight.setAttribute('aria-hidden','true');
      flight.innerHTML = '<span>Rey &amp; Rous</span><small>26 · 09 · 2026</small><em>Programa de nuestra boda</em>';
      Object.assign(flight.style, {left:`${origin.left-base.left}px`,top:`${origin.top-base.top}px`,width:`${origin.width}px`,height:`${origin.height}px`});
      section.append(flight);
      const dx = target.left + (target.width-width)/2 - origin.left;
      const dy = target.top - origin.top;
      animation = flight.animate([
        {transform:'translate(0,0) rotate(0deg)',width:`${origin.width}px`,height:`${origin.height}px`},
        {transform:`translate(${dx*.45}px,${dy*.32}px) rotate(-3deg)`,offset:.4},
        {transform:`translate(${dx}px,${dy}px) rotate(0deg)`,width:`${width}px`,height:`${height}px`}
      ], {duration:2800,easing:'cubic-bezier(.35,0,.2,1)',fill:'forwards'});
      letter.scrollIntoView({behavior:'smooth',block:'start'});
      try { await animation.finished; } catch { return; }
      if(current!==run) return;
      reveal();
      const landing = flight;
      const fade = landing.animate([{opacity:1},{opacity:0}],{duration:650,fill:'forwards'});
      await fade.finished.catch(()=>{});
      if(current===run) cleanFlight();
    }, 4700);
  });
  section.querySelector('[data-program-close]').addEventListener('click',()=>{
    reset(); envelope.focus({preventScroll:true});
    envelope.scrollIntoView({behavior:reduced()?'instant':'smooth',block:'center'});
  });
  // A turn of the phone or desktop zoom invalidates the measured flight path.
  // Settle the paper into its responsive layout instead of using stale coordinates.
  window.addEventListener('resize', () => {
    if (!flight) return;
    run++;
    cleanFlight();
    reveal();
  });
  new MutationObserver(()=>{ if(section.hidden) reset(); }).observe(section,{attributes:true,attributeFilter:['hidden']});
})();
