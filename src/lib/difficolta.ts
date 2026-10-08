import { medianaSuperiore } from './verdetto';

// Difficoltà percepita di un modulo: feedback degli studenti (contenuto
// "extra"), come il tempo di studio. Usabile sia nel sito sia nel browser.
// Deve restare identico al check su module_feedback in supabase/migrations/.
export const LIVELLI = ['facile', 'medio', 'difficile', 'estremo'] as const;
export type Livello = (typeof LIVELLI)[number];

export const isLivello = (v: unknown): v is Livello => LIVELLI.includes(v as Livello);

export const ETICHETTA: Record<Livello, string> = {
  facile: 'Facile',
  medio: 'Medio',
  difficile: 'Difficile',
  estremo: 'Estremo',
};

/** Colore dei teschietti; il livello è comunque leggibile dal numero di teschi e dall'etichetta. */
export const COLORE: Record<Livello, string> = {
  facile: '#a7f070',
  medio: '#ffcd75',
  difficile: '#ef7d57',
  estremo: '#b13e53',
};

export const numeroTeschi = (l: Livello): number => LIVELLI.indexOf(l) + 1;

/** Verdetto sulla difficoltà: mediana superiore dei voti (vedi src/lib/verdetto.ts). */
export function mediana(conteggi: Partial<Record<string, number>>): { livello: Livello | null; totale: number } {
  const { valore, totale } = medianaSuperiore(LIVELLI, conteggi);
  return { livello: valore, totale };
}

/** Teschietto pixel 8×8 (SVG statico, senza dati utente: sicuro per innerHTML). */
const TESCHIO =
  '<svg width="16" height="16" viewBox="0 0 8 8" shape-rendering="crispEdges" aria-hidden="true" focusable="false">' +
  '<g fill="currentColor"><rect x="1" y="0" width="6" height="1"/><rect x="0" y="1" width="8" height="4"/>' +
  '<rect x="1" y="5" width="6" height="1"/><rect x="1" y="6" width="1" height="1"/><rect x="3" y="6" width="1" height="1"/>' +
  '<rect x="5" y="6" width="1" height="1"/><rect x="2" y="7" width="4" height="1"/></g>' +
  '<g fill="#1a1c2c"><rect x="1" y="2" width="2" height="2"/><rect x="5" y="2" width="2" height="2"/><rect x="3" y="4" width="2" height="1"/></g></svg>';

/** Da 1 a 4 teschietti colorati per il livello. */
export function teschiHtml(l: Livello): string {
  return `<span class="teschi" style="color:${COLORE[l]}">${TESCHIO.repeat(numeroTeschi(l))}</span>`;
}
