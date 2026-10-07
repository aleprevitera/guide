import type { CollectionEntry } from 'astro:content';

type GuideData = CollectionEntry<'guide'>['data'];

/** CFU della guida: il totale dichiarato, oppure la somma dei moduli se tutti li indicano. */
export function cfuGuida(data: GuideData): number | undefined {
  if (data.cfu_totali) return data.cfu_totali;
  const cfu = data.moduli.map((m) => m.cfu);
  if (cfu.every((c): c is number => typeof c === 'number')) {
    return cfu.reduce((a, b) => a + b, 0);
  }
  return undefined;
}

/** Prove previste dall'esame (da tutti i moduli): scritto e/o orale. */
export function proveEsame(data: GuideData): { scritto: boolean; orale: boolean } {
  const tipi = data.moduli.map((m) => m.exam_type ?? '');
  return { scritto: tipi.some((t) => t.includes('Scritto')), orale: tipi.some((t) => t.includes('Orale')) };
}

export type Semestre = 'I' | 'II' | 'Annuale';

/**
 * Semestre dell'esame: quello della guida, altrimenti quello dei moduli se
 * tutti indicano lo stesso; null se non si sa.
 */
export function semestreGuida(data: GuideData): Semestre | null {
  if (data.semestre) return data.semestre;
  const s = new Set(data.moduli.map((m) => m.semestre));
  if (s.size === 1) return [...s][0] ?? null;
  return null;
}

export const ETICHETTA_SEMESTRE: Record<Semestre, string> = { I: 'I semestre', II: 'II semestre', Annuale: 'Annuale' };

/**
 * Guide divise per semestre, in ordine (I, II, annuali, senza semestre),
 * senza gruppi vuoti.
 */
export function perSemestre<T extends { data: GuideData }>(entries: T[]): { semestre: Semestre | null; titolo: string; entries: T[] }[] {
  const ordine: (Semestre | null)[] = ['I', 'II', 'Annuale', null];
  return ordine
    .map((semestre) => ({
      semestre,
      titolo: semestre ? ETICHETTA_SEMESTRE[semestre] : 'Semestre da definire',
      entries: entries.filter((e) => semestreGuida(e.data) === semestre),
    }))
    .filter((g) => g.entries.length > 0);
}
