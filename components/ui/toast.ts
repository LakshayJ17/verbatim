export function toast(message: string) {
  if (typeof document === 'undefined') return;
  const container = document.getElementById('toast-container') || (() => {
    const el = document.createElement('div');
    el.id = 'toast-container';
    el.className = 'fixed bottom-4 right-4 z-50 flex flex-col gap-2';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
    return el;
  })();

  const toastEl = document.createElement('div');
  toastEl.className = 'bg-foreground text-background px-4 py-3 rounded-md shadow-lg text-base transition-opacity duration-300 opacity-0';
  toastEl.textContent = message;

  container.appendChild(toastEl);
  
  // Fade in
  requestAnimationFrame(() => {
    toastEl.classList.remove('opacity-0');
  });

  // Remove after 3 seconds
  setTimeout(() => {
    toastEl.classList.add('opacity-0');
    setTimeout(() => {
      if (toastEl.parentNode) {
        toastEl.parentNode.removeChild(toastEl);
      }
    }, 300);
  }, 3000);
}
