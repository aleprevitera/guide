import { MIN_RISPOSTE } from './histogram';

/**
 * Verdetto dei feedback su una scala ordinata (tempo di studio, difficoltà):
 * mediana superiore dei voti. Con un numero pari di voti in equilibrio il
 * verdetto pende verso il valore più alto (più tempo, più difficile), per
 * prudenza. Sotto MIN_RISPOSTE voti nessun verdetto.
 */
export function medianaSuperiore<T extends string>(
  ordine: readonly T[],
  conteggi: Partial<Record<string, number>>,
): { valore: T | null; totale: number } {
  const totale = ordine.reduce((s, v) => s + (conteggi[v] ?? 0), 0);
  if (totale < MIN_RISPOSTE) return { valore: null, totale };
  const posizione = Math.floor(totale / 2) + 1;
  let cumulato = 0;
  for (const v of ordine) {
    cumulato += conteggi[v] ?? 0;
    if (cumulato >= posizione) return { valore: v, totale };
  }
  return { valore: null, totale };
}

/** Il valore più alto (più avanti nell'ordine) fra quelli dati. */
export function piuAlto<T extends string>(ordine: readonly T[], valori: T[]): T | null {
  return valori.length ? valori.reduce((a, b) => (ordine.indexOf(b) > ordine.indexOf(a) ? b : a)) : null;
}
