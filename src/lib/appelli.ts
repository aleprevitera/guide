import dati from '../data/appelli.json';

// Appelli d'esame da ESSE3, scaricati una volta al mese da scripts/appelli.mjs
// (src/data/appelli.json). Le date passate e il conto alla rovescia si
// calcolano anche nel browser, perché i dati restano fermi fra un
// aggiornamento e l'altro.

export interface Turno {
  appello: string;
  giorno: string | null;
  ora: string | null;
  iscrizioniDa: string | null;
  iscrizioniA: string | null;
  tipo: string | null;
  tipoProva: string | null;
  url: string | null;
  aula?: string | null;
  edificio?: string | null;
}

interface AppelliGuida {
  titolo: string;
  esame: { id: string; codice: string | null; nome: string };
  moduli: Record<string, Turno[]>;
  generale: Turno[];
}

interface DatiAppelli {
  generato_il: string;
  fonte: { bacheca: string };
  guide: Record<string, AppelliGuida>;
}

const D = dati as unknown as DatiAppelli;

export const BACHECA = D.fonte.bacheca;
export const AGGIORNATI_IL = new Date(D.generato_il);

export const appelliGuida = (idGuida?: string): AppelliGuida | undefined => (idGuida ? D.guide[idGuida] : undefined);

const oggiIso = () => new Date().toISOString().slice(0, 10);

/** Turni con data da oggi in poi (al momento della build), in ordine. */
export const futuri = (turni: Turno[] = []): Turno[] => turni.filter((t) => t.giorno && t.giorno >= oggiIso());

/** Tutte le date future di una guida (per il chip "prossimo appello"). */
export function dateFuture(idGuida?: string): string[] {
  const g = appelliGuida(idGuida);
  if (!g) return [];
  const tutti = [...Object.values(g.moduli).flat(), ...g.generale];
  return [...new Set(futuri(tutti).map((t) => t.giorno!))].sort();
}

export const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

/** "2026-10-12" → { giorno: 12, mese: "ott", settimana: "lun" } */
export function parti(iso: string) {
  const [a, m, g] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, g));
  return { giorno: g, mese: MESI[m - 1], settimana: GIORNI[d.getUTCDay()] };
}

/** "2026-10-12" → "12/10" */
export const breve = (iso: string | null) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '');
