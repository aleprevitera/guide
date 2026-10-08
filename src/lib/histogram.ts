import { FASCE_STUDIO, type FasciaStudio } from './fasce';

// Logica dell'istogramma condivisa fra render statico (Astro) e browser.

export const MIN_RISPOSTE = 5;
export const BLOCCHI = 10;
export const MS_PER_BLOCCO = 70;
export const SFALSAMENTO_MS = 150;

export type Conteggi = Record<FasciaStudio, number>;

export const conteggiVuoti = (): Conteggi =>
  Object.fromEntries(FASCE_STUDIO.map((f) => [f, 0])) as Conteggi;

/**
 * Blocchi per fascia: lunghezza proporzionale alla fascia più votata,
 * arrotondata al blocco, almeno un blocco se c'è almeno un voto.
 */
export function blocchiPerFascia(counts: Conteggi): number[] {
  const max = Math.max(...FASCE_STUDIO.map((f) => counts[f] ?? 0), 1);
  return FASCE_STUDIO.map((f) => {
    const c = counts[f] ?? 0;
    return c > 0 ? Math.max(1, Math.round((c / max) * BLOCCHI)) : 0;
  });
}

/** Ritardo dopo cui l'ultima barra ha finito di riempirsi (per "TU"). */
export function ritardoTu(blocchi: number[]): number {
  return Math.max(...blocchi.map((n, i) => i * SFALSAMENTO_MS + n * MS_PER_BLOCCO), 0);
}
