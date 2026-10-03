import type { Anno } from './anni';

// Ogni anno di corso è un "mondo" con la sua palette, come le mappe dei
// platform a 8 bit. Colori da Sweetie 16 (la palette del sito) più un lilla
// per il Castello. Contrasti verificati:
//   - `inchiostro` su `fondo` ≥ 5:1 (testo sulle caselle e sui banner)
//   - `chiaro` sul fondo pagina #1a1c2c ≥ 6:1 (titoli h2 delle guide)
// Il VI anno è il Castello: l'ultimo mondo, la laurea.

export type IconaMondo = 'prato' | 'deserto' | 'mare' | 'ghiaccio' | 'vulcano' | 'castello';

export interface Mondo {
  nome: string;
  icona: IconaMondo;
  /** Colore pieno del mondo (caselle, banner, chip). */
  fondo: string;
  /** Testo sopra `fondo`. */
  inchiostro: string;
  /** Variante leggibile sul fondo scuro della pagina. */
  chiaro: string;
}

export const MONDI: Record<Anno, Mondo> = {
  'I Anno': { nome: 'Prato', icona: 'prato', fondo: '#38b764', inchiostro: '#1a1c2c', chiaro: '#a7f070' },
  'II Anno': { nome: 'Deserto', icona: 'deserto', fondo: '#ffcd75', inchiostro: '#1a1c2c', chiaro: '#ffcd75' },
  'III Anno': { nome: 'Mare', icona: 'mare', fondo: '#3b5dc9', inchiostro: '#f4f4f4', chiaro: '#41a6f6' },
  'IV Anno': { nome: 'Ghiaccio', icona: 'ghiaccio', fondo: '#73eff7', inchiostro: '#1a1c2c', chiaro: '#73eff7' },
  'V Anno': { nome: 'Vulcano', icona: 'vulcano', fondo: '#b13e53', inchiostro: '#f4f4f4', chiaro: '#ef7d57' },
  'VI Anno': { nome: 'Castello', icona: 'castello', fondo: '#5d275d', inchiostro: '#f4f4f4', chiaro: '#d59ef0' },
};

/** Custom property CSS del mondo, da mettere in `style` su un contenitore. */
export const stileMondo = (anno: Anno): string => {
  const m = MONDI[anno];
  return `--mondo:${m.fondo};--mondo-ink:${m.inchiostro};--mondo-chiaro:${m.chiaro}`;
};
