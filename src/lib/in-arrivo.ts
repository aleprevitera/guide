// Esami senza guida ("in arrivo"): schede bloccate nelle pagine degli anni,
// ricavate dal catalogo dei corsi (src/data/syllabus.json, scripts/syllabus.mjs).
// Solo esami con voto finale (niente esami a scelta né tirocini), solo negli
// anni di ANNI_CON_SEGNAPOSTO. Una scheda sparisce da sola appena esiste una
// guida con lo stesso codice ESSE3 o lo stesso nome (in qualsiasi anno).
import type { CollectionEntry } from 'astro:content';
import syllabus from '../data/syllabus.json';
import { ANNI_DI_CORSO } from '../content/config';
import type { Anno } from './anni';
import type { Semestre } from './guide';

export const ANNI_CON_SEGNAPOSTO: Anno[] = ['IV Anno', 'V Anno', 'VI Anno'];

export interface EsameInArrivo {
  codice: string;
  nome: string;
  semestre: Semestre | null;
  cfu: number | null;
}

interface VoceCatalogo {
  codiceAttivita: string | number;
  nome: string;
  annoCorso: number;
  crediti?: number | null;
  periodo?: string | null;
  valutazione?: string | null;
  tipo?: string | null;
}

const PERIODI: Record<string, Semestre> = { 'Primo Semestre': 'I', 'Secondo Semestre': 'II', 'Annualità Singola': 'Annuale' };
const STOP = new Set(['E', 'ED', 'DI', 'DEL', 'DELLA', 'DELLE', 'DEGLI', 'DEI', 'DELL', 'PER', 'IL', 'LA', 'LE', 'I', 'APPARATO']);

/** Chiave di confronto dei nomi: parole significative, senza accenti né ordine. */
const chiave = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !STOP.has(t))
    .sort()
    .join(' ');

/** "MALATTIE DELL'APPARATO LOCOMOTORE" → "Malattie dell'apparato locomotore". */
const nomeLeggibile = (s: string) => {
  const minuscolo = s.toLowerCase().replace(/\s+/g, ' ').trim();
  return minuscolo.charAt(0).toUpperCase() + minuscolo.slice(1);
};

const catalogo = (syllabus as unknown as { esami: VoceCatalogo[] }).esami;

export function esamiInArrivo(anno: Anno, guide: CollectionEntry<'guide'>[]): EsameInArrivo[] {
  if (!ANNI_CON_SEGNAPOSTO.includes(anno)) return [];
  const numero = ANNI_DI_CORSO.indexOf(anno) + 1;
  const codici = new Set(guide.map((g) => g.data.esse3_codice).filter(Boolean));
  const nomi = new Set(guide.map((g) => chiave(g.data.title)));
  return catalogo
    .filter((e) => e.annoCorso === numero && e.valutazione === 'Voto Finale' && !/scelta/i.test(e.tipo ?? '') && !/prova finale/i.test(e.nome))
    .filter((e) => !codici.has(String(e.codiceAttivita)) && !nomi.has(chiave(e.nome)))
    .map((e) => ({
      codice: String(e.codiceAttivita),
      nome: nomeLeggibile(e.nome),
      semestre: (e.periodo && PERIODI[e.periodo]) || null,
      cfu: e.crediti ?? null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}
