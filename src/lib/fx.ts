// Micro-animazioni di feedback (gamification leggera). Sempre a scatti e
// sempre spente con prefers-reduced-motion. Gli elementi creati sono
// decorativi (aria-hidden) e si rimuovono da soli: il feedback per le
// tecnologie assistive passa dai messaggi di stato dei componenti.

const ridotto = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 8 direzioni, distanze multiple di 4px (la griglia del sito). Le scintille
// partono a metà strada, così escono subito dal bordo dell'elemento.
const DIREZIONI = [
  [0, -40], [32, -32], [56, 0], [32, 32], [0, 40], [-32, 32], [-56, 0], [-32, -32],
] as const;

function centro(el: Element) {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), r };
}

function strato(x: number, y: number) {
  const host = document.createElement('span');
  host.className = 'fx-host';
  host.setAttribute('aria-hidden', 'true');
  host.style.left = `${x}px`;
  host.style.top = `${y}px`;
  document.body.append(host);
  return host;
}

/** Scintille pixel che esplodono dal centro dell'elemento. */
export function scintille(el: Element, colori: string[] = ['var(--text)', 'var(--accent)']) {
  if (ridotto()) return;
  const { x, y } = centro(el);
  const host = strato(x, y);
  DIREZIONI.forEach(([dx, dy], i) => {
    const p = document.createElement('span');
    p.className = 'fx-pixel';
    p.style.setProperty('--dx', `${dx}px`);
    p.style.setProperty('--dy', `${dy}px`);
    p.style.background = colori[i % colori.length];
    host.append(p);
  });
  setTimeout(() => host.remove(), 500);
}

/** Testo (es. "+1") che sale a scatti sopra l'elemento e sparisce. */
export function fluttua(el: Element, testo: string) {
  if (ridotto()) return;
  const { x, r } = centro(el);
  const host = strato(x, Math.round(r.top));
  const t = document.createElement('span');
  t.className = 'fx-float';
  t.textContent = testo;
  host.append(t);
  setTimeout(() => host.remove(), 700);
}

/** Saltello a due fotogrammi (classe fx-hop) su un elemento esistente. */
export function saltello(el: Element) {
  if (ridotto()) return;
  el.classList.remove('fx-hop');
  void (el as HTMLElement).offsetWidth; // riavvia l'animazione
  el.classList.add('fx-hop');
  el.addEventListener('animationend', () => el.classList.remove('fx-hop'), { once: true });
}
