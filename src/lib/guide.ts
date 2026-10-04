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
