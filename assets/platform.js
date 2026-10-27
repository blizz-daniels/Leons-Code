document.querySelectorAll('.flash').forEach((flash) => {
  window.setTimeout(() => {
    flash.style.opacity = '0';
    flash.style.transform = 'translateY(-6px)';
    flash.style.transition = 'opacity .2s ease, transform .2s ease';
    window.setTimeout(() => flash.remove(), 220);
  }, 5500);
});
