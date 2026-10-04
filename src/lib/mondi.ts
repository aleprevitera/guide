import type { Anno } from './anni';

// Ogni anno di corso è un "mondo" con la sua palette e il suo terreno, come
// le mappe dei platform a 8 bit (prato, deserto, mare, ghiaccio, vulcano,
// castello). I mondi non hanno nomi visibili: in pagina compare solo l'anno. Colori da Sweetie 16 (la palette del sito) più un lilla
// per il Castello. Contrasti verificati:
//   - `inchiostro` su `fondo` ≥ 5:1 (testo sulle caselle e sui banner)
//   - `chiaro` sul fondo pagina #1a1c2c ≥ 6:1 (titoli h2 delle guide)
// Il VI anno è il Castello: l'ultimo mondo, la laurea.

export type IconaMondo = 'prato' | 'deserto' | 'mare' | 'ghiaccio' | 'vulcano' | 'castello';

export interface Mondo {
  icona: IconaMondo;
  /**
   * Scena animata (sprite sheet in src/assets/mondi/<slug>.png, generata da
   * scripts/mondi/genera-scene.mjs): numero di fotogrammi e durata del giro.
   */
  scena?: { fotogrammi: number; durataMs: number };
  /** Colore pieno del mondo (caselle, banner, chip). */
  fondo: string;
  /** Testo sopra `fondo`. */
  inchiostro: string;
  /** Variante leggibile sul fondo scuro della pagina. */
  chiaro: string;
}

export const MONDI: Record<Anno, Mondo> = {
  'I Anno': { icona: 'prato', fondo: '#38b764', inchiostro: '#1a1c2c', chiaro: '#a7f070' },
  'II Anno': { icona: 'deserto', fondo: '#ffcd75', inchiostro: '#1a1c2c', chiaro: '#ffcd75' },
  'III Anno': { scena: { fotogrammi: 6, durataMs: 1000 }, icona: 'mare', fondo: '#3b5dc9', inchiostro: '#f4f4f4', chiaro: '#41a6f6' },
  'IV Anno': { icona: 'ghiaccio', fondo: '#73eff7', inchiostro: '#1a1c2c', chiaro: '#73eff7' },
  'V Anno': { icona: 'vulcano', fondo: '#b13e53', inchiostro: '#f4f4f4', chiaro: '#ef7d57' },
  'VI Anno': { icona: 'castello', fondo: '#5d275d', inchiostro: '#f4f4f4', chiaro: '#d59ef0' },
};

/** Custom property CSS del mondo, da mettere in `style` su un contenitore. */
export const stileMondo = (anno: Anno): string => {
  const m = MONDI[anno];
  return `--mondo:${m.fondo};--mondo-ink:${m.inchiostro};--mondo-chiaro:${m.chiaro}`;
};
