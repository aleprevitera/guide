import type { Anno } from './anni';

// Ogni anno di corso è un "mondo" ispirato alle sue materie, con palette,
// icona, terreno e scena animata propri: I aula di anatomia e istologia,
// II fisiologia (ECG, cuore), III laboratorio (microbiologia, patologia),
// IV radiologia e farmaci, V reparto (clinica, neurologia), VI sala
// operatoria e laurea. I mondi non hanno nomi visibili: in pagina solo l'anno. Colori da Sweetie 16 (la palette del sito) più un lilla
// per il Castello. Contrasti verificati:
//   - `inchiostro` su `fondo` ≥ 5:1 (testo sulle caselle e sui banner)
//   - `chiaro` sul fondo pagina #1a1c2c ≥ 6:1 (titoli h2 delle guide)
// Il VI anno è il Castello: l'ultimo mondo, la laurea.

export type IconaMondo = 'cellula' | 'cuore' | 'batterio' | 'lastra' | 'cervello' | 'tocco';

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

const SCENA = { fotogrammi: 6, durataMs: 1000 };

export const MONDI: Record<Anno, Mondo> = {
  'I Anno': { icona: 'cellula', scena: SCENA, fondo: '#38b764', inchiostro: '#1a1c2c', chiaro: '#a7f070' },
  'II Anno': { icona: 'cuore', scena: SCENA, fondo: '#ffcd75', inchiostro: '#1a1c2c', chiaro: '#ffcd75' },
  'III Anno': { icona: 'batterio', scena: SCENA, fondo: '#3b5dc9', inchiostro: '#f4f4f4', chiaro: '#41a6f6' },
  'IV Anno': { icona: 'lastra', scena: SCENA, fondo: '#73eff7', inchiostro: '#1a1c2c', chiaro: '#73eff7' },
  'V Anno': { icona: 'cervello', scena: SCENA, fondo: '#b13e53', inchiostro: '#f4f4f4', chiaro: '#ef7d57' },
  'VI Anno': { icona: 'tocco', scena: SCENA, fondo: '#5d275d', inchiostro: '#f4f4f4', chiaro: '#d59ef0' },
};

/** Custom property CSS del mondo, da mettere in `style` su un contenitore. */
export const stileMondo = (anno: Anno): string => {
  const m = MONDI[anno];
  return `--mondo:${m.fondo};--mondo-ink:${m.inchiostro};--mondo-chiaro:${m.chiaro}`;
};
