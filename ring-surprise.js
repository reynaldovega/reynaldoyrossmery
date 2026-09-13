(() => {
  const dialog = document.querySelector('.ring-surprise');
  const trigger = document.querySelector('[data-open-rings]');
  if (!dialog || !trigger) return;
  const close = dialog.querySelector('.ring-surprise__close');
  let previousOverflow = '';
  let animationTimer;
  let animationRun = 0;
  async function animate() {
    const run = ++animationRun;
    clearTimeout(animationTimer);
    dialog.classList.remove('is-revealed');
    await Promise.all([...dialog.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
    if (run !== animationRun || !dialog.open) return;
    animationTimer = setTimeout(() => dialog.classList.add('is-revealed'), 450);
  }
  trigger.addEventListener('click', () => {
    if (dialog.open) return;
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    close.focus({ preventScroll: true });
    animate();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) {
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
    }
  });
  dialog.addEventListener('close', () => {
    animationRun++;
    clearTimeout(animationTimer);
    dialog.classList.remove('is-revealed');
    document.body.style.overflow = previousOverflow;
    trigger.focus({ preventScroll: true });
  });
  dialog.querySelector('.ring-surprise__replay').addEventListener('click', animate);
})();
