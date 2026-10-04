import { MIN_RISPOSTE } from './histogram';

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

/**
 * Verdetto = mediana dei voti (la scala è ordinata: la mediana regge meglio
 * della "vittoria singola" con pochi voti). Con un numero pari di voti si
 * prende la mediana superiore: in caso di equilibrio (es. 3 facile, 3
 * estremo) il verdetto pende verso il livello più difficile, per prudenza.
 * Sotto MIN_RISPOSTE voti nessun verdetto.
 */
export function mediana(conteggi: Partial<Record<string, number>>): { livello: Livello | null; totale: number } {
  const totale = LIVELLI.reduce((s, l) => s + (conteggi[l] ?? 0), 0);
  if (totale < MIN_RISPOSTE) return { livello: null, totale };
  const posizione = Math.floor(totale / 2) + 1;
  let cumulato = 0;
  for (const l of LIVELLI) {
    cumulato += conteggi[l] ?? 0;
    if (cumulato >= posizione) return { livello: l, totale };
  }
  return { livello: null, totale };
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
