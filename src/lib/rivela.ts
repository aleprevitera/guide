// Comparsa a scatti allo scorrimento, pensata per il telefono (dove non c'è
// il passaggio del mouse): i figli di un contenitore [data-rivela] compaiono
// quando entrano nello schermo, sfalsati fra quelli che entrano insieme.
// Senza JS, senza IntersectionObserver o con "riduci movimento" sono subito
// visibili. Stili in global.css (sezione "Comparsa allo scorrimento").

export function attivaRivela(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  for (const contenitore of document.querySelectorAll<HTMLElement>('[data-rivela]')) {
    contenitore.classList.add('is-armed');
    const io = new IntersectionObserver(
      (entries) => {
        let i = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.style.setProperty('--i', String(i++));
          el.classList.add('is-visto');
          io.unobserve(el);
        }
      },
      { threshold: 0.15 },
    );
    for (const figlio of contenitore.children) io.observe(figlio);
  }
}
