#!/usr/bin/env node
// Genera gli sprite sheet animati dei "mondi" (uno per anno di corso) in
// src/assets/mondi/. Ogni scena è disegnata su una griglia di pixel vera,
// solo con colori della palette del sito (Sweetie 16 + lilla), e salvata
// come PNG: fotogrammi affiancati in orizzontale, animati in CSS con steps().
//
//   node scripts/mondi/genera-scene.mjs
//
// Nessuna dipendenza: encoder PNG minimale con node:zlib.

import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(import.meta.dirname, '../..');
const OUT = path.join(ROOT, 'src/assets/mondi');

// Dimensioni native di un fotogramma (mostrato a 2× nel sito). La larghezza
// è un multiplo del fondale ripetibile (48: minimo comune multiplo dei motivi
// di pareti e pavimenti), così nei banner larghi parete e pavimento
// continuano a sinistra della scena senza giunture.
export const LARGHEZZA = 144;
export const ALTEZZA = 60;
const FONDALE = 48;
// Gli oggetti delle scene sono disegnati in coordinate 0–111 e spostati a
// destra di questo valore (il testo delle caselle sta a sinistra).
const SPOSTA = LARGHEZZA - 112;

// Palette del sito.
const C = {
  nero: '#1a1c2c', viola: '#5d275d', rosso: '#b13e53', arancio: '#ef7d57',
  giallo: '#ffcd75', lime: '#a7f070', verde: '#38b764', petrolio: '#257179',
  blunotte: '#29366f', blu: '#3b5dc9', azzurro: '#41a6f6', ciano: '#73eff7',
  bianco: '#f4f4f4', grigio: '#94b0c2', ardesia: '#566c86', antracite: '#333c57',
  lilla: '#d59ef0',
};

// --- Tela e primitive --------------------------------------------------------

class Tela {
  constructor(w = LARGHEZZA, h = ALTEZZA) {
    this.w = w;
    this.h = h;
    this.px = new Array(w * h).fill(null);
    this.ox = SPOSTA;
    this.fondale = null;
  }
  set(x, y, c) {
    x += this.ox;
    if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  /** Parete e pavimento: a tutta larghezza (senza spostamento), poi memorizzati come fondale. */
  sfondo(disegna) {
    const ox = this.ox;
    this.ox = 0;
    disegna();
    this.ox = ox;
    this.fondale = this.px.slice();
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  /** Sprite da righe ASCII: ogni carattere è una chiave di `mappa`, '.' = trasparente. */
  sprite(x, y, righe, mappa) {
    righe.forEach((riga, j) => [...riga].forEach((ch, i) => this.set(x + i, y + j, mappa[ch])));
  }
}

// --- PNG ---------------------------------------------------------------------

const hex = (c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

function png(w, h, pixel) {
  const riga = w * 4 + 1;
  const raw = Buffer.alloc(riga * h);
  for (let y = 0; y < h; y++) {
    raw[y * riga] = 0; // filtro "none"
    for (let x = 0; x < w; x++) {
      const c = pixel[y * w + x];
      const o = y * riga + 1 + x * 4;
      if (c) {
        const [r, g, b] = hex(c);
        raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
      }
    }
  }
  const chunk = (tipo, dati) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dati.length);
    const td = Buffer.concat([Buffer.from(tipo), dati]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Affianca i fotogrammi in un unico sprite sheet orizzontale. */
function foglio(fotogrammi) {
  const w = LARGHEZZA * fotogrammi.length;
  const pixel = new Array(w * ALTEZZA).fill(null);
  fotogrammi.forEach((t, f) => {
    for (let y = 0; y < ALTEZZA; y++) for (let x = 0; x < LARGHEZZA; x++) pixel[y * w + f * LARGHEZZA + x] = t.px[y * LARGHEZZA + x];
  });
  return png(w, ALTEZZA, pixel);
}

/** Pixel in scala di grigi della palette (mondi bloccati); il nero solo per i dettagli più scuri. */
function grigi(pixel) {
  const scala = [C.antracite, C.antracite, C.ardesia, C.grigio];
  return pixel.map((c) => {
    if (!c) return null;
    const [r, g, b] = hex(c);
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (l < 0.02) return C.nero;
    return scala[Math.min(scala.length - 1, Math.floor(l * scala.length * 0.85))];
  });
}

/** Fondale ripetibile: le prime FONDALE colonne di parete e pavimento. */
function fondale(t, spento = false) {
  const px = [];
  for (let y = 0; y < ALTEZZA; y++) for (let x = 0; x < FONDALE; x++) px.push(t.fondale[y * LARGHEZZA + x]);
  return png(FONDALE, ALTEZZA, spento ? grigi(px) : px);
}

/** Variante "bloccata" (mondo senza guide): primo fotogramma in scala di grigi della palette. */
function spenta(t) {
  return png(LARGHEZZA, ALTEZZA, grigi(t.px));
}

// --- Elementi comuni ------------------------------------------------------------

/** Parete a piastrelle sfalsate (righe 0–44). */
function parete(t, base, linea) {
  t.rect(0, 0, LARGHEZZA, 45, base);
  for (let y = 11; y < 45; y += 11) t.rect(0, y, LARGHEZZA, 1, linea);
  for (let y = 0; y < 45; y += 11) for (let x = (y / 11) % 2 ? 6 : 0; x < LARGHEZZA; x += 12) t.rect(x, y, 1, 11, linea);
}

/** Pavimento a scacchi 4×4 (righe 45–59), con bordo superiore. */
function scacchi(t, a, b, bordo) {
  for (let y = 46; y < ALTEZZA; y++) for (let x = 0; x < LARGHEZZA; x++) t.set(x, y, (Math.floor(x / 4) + Math.floor((y - 46) / 4)) % 2 ? a : b);
  t.rect(0, 45, LARGHEZZA, 1, bordo);
}

/** Disco pieno. */
function disco(t, cx, cy, r, c) {
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.8) t.set(cx + x, cy + y, c);
}

// --- Scene ---------------------------------------------------------------------
// Il testo della casella sta a sinistra: il soggetto della scena va a destra
// (x ≳ 56). Su telefono si vedono circa le ultime 75 colonne.

/** III anno — il laboratorio (Patologia, Microbiologia, Medicina di Laboratorio). */
function laboratorio(f) {
  const t = new Tela();
  t.sfondo(() => {
    parete(t, C.blu, C.blunotte);
    // Bancone con cassetti.
    t.rect(0, 45, LARGHEZZA, 1, C.bianco);
    t.rect(0, 46, LARGHEZZA, 3, C.grigio);
    t.rect(0, 49, LARGHEZZA, 11, C.ardesia);
    for (let x = 4; x < LARGHEZZA; x += 24) {
      t.rect(x, 51, 20, 7, C.antracite);
      t.rect(x + 8, 54, 4, 1, C.grigio);
    }
  });

  // Batterio che fluttua (il "nemico" del livello), con flagello che ondeggia.
  const bx = [60, 62, 64, 66, 64, 62][f];
  const by = [4, 3, 3, 4, 5, 5][f];
  t.sprite(bx, by, [
    '..GGGGGGGGG..',
    '.GLLLLLLLLLG.',
    'GLLKWLLLKWLLG',
    'GLLKKLLLKKLLG',
    'GLLLLLKLLLLLG',
    '.GLLLLLLLLLG.',
    '..GGGGGGGGG..',
  ], { G: C.petrolio, L: C.lime, K: C.nero, W: C.bianco });
  // Flagello che ondeggia (2 pose) e ciglia sopra/sotto.
  const coda = f % 2 ? ['...L', '..L.', '.L..', 'L...'] : ['L...', '.L..', '..L.', '...L'];
  t.sprite(bx + 13, by + 1, coda, { L: C.lime });
  for (let i = 3; i < 11; i += 3) {
    t.set(bx + i + (f % 2), by - 1, C.lime);
    t.set(bx + i + 1 - (f % 2), by + 7, C.lime);
  }

  // Beuta che ribolle.
  t.rect(61, 24, 6, 1, C.grigio); // bordo
  t.rect(62, 25, 4, 7, C.bianco); // collo
  for (let i = 0; i < 13; i++) {
    const meta = 2 + Math.floor(i / 2);
    const x0 = 64 - meta;
    const larg = meta * 2;
    t.rect(x0, 32 + i, larg, 1, i >= 4 ? C.lime : C.bianco);
    t.set(x0, 32 + i, C.grigio);
    t.set(x0 + larg - 1, 32 + i, C.grigio);
  }
  t.rect(58, 44, 12, 1, C.grigio);
  // Bolle: salgono di 2px per fotogramma.
  for (const [x, y0] of [[62, 42], [65, 39], [63, 36]]) {
    const y = y0 - ((f * 2) % 12);
    if (y > 24) t.set(x, y, C.bianco);
  }

  // Piastra di Petri con colonie che crescono e si muovono.
  t.rect(73, 40, 13, 1, C.grigio);
  t.rect(72, 41, 15, 3, C.giallo);
  t.set(72, 41, C.grigio); t.set(86, 41, C.grigio);
  t.rect(72, 44, 15, 1, C.ardesia);
  const colonie = [[75, 42], [79, 41], [83, 42], [81, 43], [77, 43]];
  colonie.forEach(([x, y], i) => t.set(x + ((f + i) % 3 === 0 ? 1 : 0), y, i % 2 ? C.rosso : C.arancio));

  // Microscopio.
  t.rect(90, 42, 18, 3, C.antracite);
  t.rect(90, 42, 18, 1, C.ardesia);
  t.rect(102, 22, 3, 20, C.grigio);
  t.rect(104, 22, 1, 20, C.ardesia);
  t.rect(92, 34, 12, 2, C.ardesia);
  t.rect(94, 18, 6, 13, C.bianco);
  t.rect(94, 18, 1, 13, C.grigio);
  t.rect(99, 20, 3, 3, C.grigio);
  t.rect(96, 14, 4, 4, C.grigio);
  t.rect(96, 13, 4, 1, C.antracite);
  t.rect(96, 31, 2, 3, C.antracite);
  t.rect(103, 27, 3, 3, C.arancio);
  // Luce del microscopio che lampeggia.
  t.rect(96, 39, 2, 2, f % 2 ? C.giallo : C.ardesia);
  return t;
}

/** I anno — l'aula di anatomia e istologia: scheletro che saluta, modello di cellula. */
function anatomia(f) {
  const t = new Tela();
  t.sfondo(() => {
    parete(t, C.verde, C.petrolio);
    // Parquet.
    t.rect(0, 45, LARGHEZZA, 1, C.giallo);
    t.rect(0, 46, LARGHEZZA, 14, C.arancio);
    for (let y = 49; y < ALTEZZA; y += 4) t.rect(0, y, LARGHEZZA, 1, C.rosso);
    for (let y = 46; y < ALTEZZA; y += 4) for (let x = (y % 8) * 2; x < LARGHEZZA; x += 16) t.rect(x, y, 1, 3, C.rosso);
  });

  // Modello di cellula su piedistallo: membrana che pulsa, mitocondri che girano.
  const r = f % 2 ? 10 : 9;
  disco(t, 70, 27, r, C.bianco);
  disco(t, 70, 27, r - 1, C.giallo);
  disco(t, 70, 27, 4, C.viola);
  t.rect(71, 25, 2, 2, C.lilla);
  const orbita = [[-6, -3], [-2, -6], [4, -5], [6, 1], [2, 6], [-4, 5]];
  for (let i = 0; i < 3; i++) {
    const [dx, dy] = orbita[(f + i * 2) % 6];
    t.rect(70 + dx - 1, 27 + dy, 3, 2, C.arancio);
  }
  t.rect(69, 38, 2, 6, C.ardesia);
  t.rect(65, 44, 11, 1, C.antracite);

  // Scheletro che saluta.
  const B = C.bianco, K = C.nero;
  t.rect(93, 9, 7, 6, B);
  t.rect(94, 11, 2, 1, K); t.rect(97, 11, 2, 1, K); t.set(96, 12, K);
  const mascella = f % 3 === 1 ? 1 : 0; // ogni tanto "parla"
  t.rect(94, 15 + mascella, 5, 1, B);
  t.set(95, 15 + mascella, K); t.set(97, 15 + mascella, K);
  t.rect(96, 16, 1, 2, C.grigio);
  t.rect(96, 18, 1, 15, B);
  for (let y = 19; y < 29; y += 2) t.rect(92, y, 9, 1, B);
  t.rect(93, 31, 7, 3, B); t.rect(95, 32, 3, 1, C.verde);
  t.rect(93, 34, 2, 10, B); t.rect(98, 34, 2, 10, B);
  t.rect(92, 44, 3, 1, B); t.rect(98, 44, 3, 1, B);
  t.rect(90, 19, 2, 13, B); // braccio fermo
  if (f % 2) { t.rect(101, 10, 2, 9, B); t.rect(101, 8, 3, 2, B); } // braccio alzato
  else { t.rect(101, 19, 2, 9, B); t.rect(102, 10, 2, 9, B); t.rect(103, 8, 3, 2, B); }
  return t;
}

/** II anno — fisiologia: monitor con ECG che scorre, cuore che batte. */
function fisiologia(f) {
  const t = new Tela();
  t.sfondo(() => {
    parete(t, C.giallo, C.arancio);
    scacchi(t, C.bianco, C.grigio, C.ardesia);
  });

  // Monitor su asta con traccia ECG che scorre (4px per fotogramma).
  t.rect(56, 10, 30, 24, C.antracite);
  t.rect(58, 12, 26, 20, C.nero);
  const onda = [0, 0, 0, 0, 1, 0, 0, -1, 7, -3, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0];
  for (let x = 59; x < 83; x++) {
    const v = onda[(x - 59 + f * 4) % onda.length];
    const base = 25;
    if (Math.abs(v) > 1) {
      const [a, b] = v > 0 ? [base - v, base] : [base, base - v];
      t.rect(x, a, 1, b - a + 1, C.lime);
    } else t.set(x, base - v, C.lime);
  }
  if (f % 3 === 0) t.sprite(78, 14, ['R.R', 'RRR', '.R.'], { R: C.rosso }); // battito
  t.rect(70, 34, 2, 10, C.ardesia);
  t.rect(64, 44, 14, 1, C.antracite);

  // Cuore che batte: più grande nei fotogrammi del battito.
  const cuore = [
    '..RRR...RRR..',
    '.RROR.RRRRRR.',
    'RROORRRRRRRRR',
    'RRORRRRRRRRRR',
    'RRRRRRRRRRRRR',
    '.RRRRRRRRRRR.',
    '..RRRRRRRRR..',
    '...RRRRRRR...',
    '....RRRRR....',
    '.....RRR.....',
    '......R......',
  ];
  const battito = f % 3 === 0;
  const cx = 92, cy = 22 + (battito ? 0 : 1);
  t.rect(96, cy - 5, 2, 6, C.blu); t.rect(100, cy - 6, 2, 7, C.blu); t.rect(98, cy - 4, 2, 5, C.rosso);
  if (battito) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) t.sprite(cx + dx, cy + dy, cuore, { R: C.rosso, O: C.rosso });
  }
  t.sprite(cx, cy, cuore, { R: C.rosso, O: C.arancio });
  t.rect(cx + 1, 44, 11, 1, C.ardesia); // ombra
  return t;
}

/** IV anno — radiologia e farmaci: lastra sul diafanoscopio con scansione, pillola che salta. */
function radiologia(f) {
  const t = new Tela();
  t.sfondo(() => {
    parete(t, C.ciano, C.azzurro);
    t.rect(0, 45, LARGHEZZA, 1, C.grigio);
    for (let y = 46; y < ALTEZZA; y++) for (let x = 0; x < LARGHEZZA; x++) t.set(x, y, (Math.floor(x / 8) + Math.floor((y - 46) / 7)) % 2 ? C.ardesia : C.antracite);
  });

  // Diafanoscopio con radiografia del torace.
  t.rect(56, 5, 32, 31, C.grigio);
  t.rect(58, 7, 28, 27, C.bianco);
  t.rect(60, 9, 24, 23, C.nero);
  t.rect(71, 10, 2, 21, C.grigio); // colonna
  for (let i = 0; i < 6; i++) {
    const y = 12 + i * 3;
    t.rect(62, y + 1, 8, 1, C.bianco); t.set(70, y, C.bianco);
    t.rect(74, y + 1, 8, 1, C.bianco); t.set(73, y, C.bianco);
  }
  t.rect(66, 29, 12, 2, C.grigio); // diaframma
  t.rect(60, 9 + ((f * 4) % 23), 24, 1, C.ciano); // linea di scansione
  t.rect(70, 36, 4, 8, C.ardesia);
  t.rect(66, 44, 12, 1, C.antracite);

  // Flacone di farmaci e pillola che salta fuori e rimbalza.
  t.rect(92, 30, 9, 3, C.rosso);
  t.rect(93, 33, 7, 12, C.bianco);
  t.rect(93, 37, 7, 4, C.arancio);
  t.rect(94, 38, 5, 1, C.bianco);
  const salto = [[96, 27], [98, 22], [101, 20], [104, 23], [106, 30], [106, 42]][f];
  t.rect(salto[0], salto[1], 2, 2, C.arancio);
  t.rect(salto[0] + 2, salto[1], 2, 2, C.giallo);
  t.rect(102, 43, 2, 2, C.arancio); t.rect(104, 43, 2, 2, C.giallo); // pillola già a terra
  return t;
}

/** V anno — il reparto (clinica, neurologia, psichiatria): paziente che sogna, flebo che gocciola. */
function reparto(f) {
  const t = new Tela();
  t.sfondo(() => {
    parete(t, C.rosso, C.viola);
    scacchi(t, C.grigio, C.ardesia, C.bianco);
  });

  // Asta della flebo con goccia che scende.
  t.rect(61, 6, 2, 39, C.grigio);
  t.rect(57, 8, 8, 1, C.grigio);
  t.rect(58, 9, 6, 8, C.ciano);
  t.rect(58, 9, 6, 1, C.bianco);
  t.rect(60, 17, 1, 4, C.bianco);
  t.set(60, 21 + ((f * 2) % 8), C.ciano);
  t.rect(58, 44, 7, 1, C.antracite);

  // Letto con paziente.
  t.rect(104, 26, 3, 19, C.grigio); // testiera
  t.rect(68, 38, 39, 2, C.grigio);
  t.rect(70, 40, 2, 5, C.ardesia); t.rect(102, 40, 2, 5, C.ardesia);
  t.rect(68, 34, 36, 4, C.bianco);
  t.rect(68, 33, 27, 5, C.azzurro);
  t.rect(68, 33, 27, 1, C.bianco);
  t.rect(96, 31, 8, 3, C.bianco); // cuscino
  t.rect(97, 27, 5, 5, C.giallo); // testa
  t.rect(97, 27, 5, 1, C.viola); // capelli
  t.rect(98, 29, 1, 1, C.nero); t.rect(100, 29, 1, 1, C.nero); // occhi chiusi

  // Nuvoletta con cervello e neuroni che si accendono.
  t.set(95, 24, C.bianco); t.rect(92, 21, 2, 2, C.bianco);
  t.rect(76, 4, 16, 15, C.bianco);
  t.rect(74, 6, 20, 11, C.bianco);
  t.sprite(78, 6, [
    '..LLLLLLL...',
    '.LLVLLLVLL..',
    'LLVLLVLLLLL.',
    'LLLLVLLLVLLL',
    'LVLLLLVLLLLL',
    '.LLLVLLLLVL.',
    '..LLLLLLLL..',
    '......VV....',
  ], { L: C.lilla, V: C.viola });
  const scintille = [[[80, 7], [86, 10]], [[83, 9], [79, 11]], [[87, 8], [82, 12]]][f % 3];
  for (const [x, y] of scintille) t.set(x, y, C.giallo);
  return t;
}

/** VI anno — sala operatoria e laurea: lampada scialitica, tocco che fluttua (il "castello finale"). */
function laurea(f) {
  const t = new Tela();
  t.sfondo(() => {
    parete(t, C.viola, C.blunotte);
    t.rect(0, 45, LARGHEZZA, 1, C.ciano);
    for (let y = 46; y < ALTEZZA; y++) for (let x = 0; x < LARGHEZZA; x++) t.set(x, y, x % 8 === 0 || (y - 46) % 7 === 0 ? C.verde : C.petrolio);
  });

  // Lampada scialitica con luci che tremolano.
  t.rect(86, 0, 2, 4, C.grigio);
  t.rect(76, 4, 22, 2, C.grigio);
  t.rect(74, 6, 26, 3, C.ardesia);
  for (let x = 77; x < 97; x += 4) t.rect(x, 9, 2, 1, (x / 4 + f) % 2 ? C.giallo : C.bianco);

  // Tavolo operatorio con pergamena della laurea.
  t.rect(64, 36, 40, 1, C.bianco);
  t.rect(64, 37, 40, 3, C.grigio);
  t.rect(82, 40, 4, 4, C.ardesia);
  t.rect(76, 44, 16, 1, C.antracite);
  t.rect(68, 33, 15, 3, C.bianco);
  t.rect(67, 33, 1, 3, C.grigio); t.rect(83, 33, 1, 3, C.grigio);
  t.rect(75, 33, 2, 3, C.rosso);

  // Tocco che fluttua, con nappina che oscilla e scintille.
  const dy = [0, -1, -2, -1, 0, 1][f];
  const y0 = 16 + dy;
  // Contorno lilla: il tocco è il "trofeo" e deve staccarsi dalla parete.
  t.rect(81, y0 - 1, 22, 5, C.lilla);
  t.rect(85, y0 + 3, 14, 7, C.lilla);
  t.rect(82, y0, 20, 3, C.nero);
  t.rect(83, y0, 18, 1, C.antracite);
  t.rect(86, y0 + 3, 12, 6, C.nero);
  t.rect(91, y0, 2, 1, C.giallo);
  const nappa = [[95, 1], [96, 2], [97, 3], [96, 2], [95, 1], [94, 0]][f];
  t.rect(nappa[0], y0 + 1, 1, 3 + nappa[1], C.giallo);
  t.rect(nappa[0] - 1, y0 + 4 + nappa[1], 3, 2, C.giallo);
  const brilla = [[[77, 14], [106, 22]], [[79, 26], [105, 12]], [[76, 20], [107, 17]]][f % 3];
  for (const [x, y] of brilla) {
    t.set(x, y, C.giallo); t.set(x - 1, y, C.bianco); t.set(x + 1, y, C.bianco); t.set(x, y - 1, C.bianco); t.set(x, y + 1, C.bianco);
  }
  return t;
}

export const SCENE = {
  'i-anno': { disegna: anatomia, fotogrammi: 6 },
  'ii-anno': { disegna: fisiologia, fotogrammi: 6 },
  'iii-anno': { disegna: laboratorio, fotogrammi: 6 },
  'iv-anno': { disegna: radiologia, fotogrammi: 6 },
  'v-anno': { disegna: reparto, fotogrammi: 6 },
  'vi-anno': { disegna: laurea, fotogrammi: 6 },
};

// --- Main ----------------------------------------------------------------------

await fs.mkdir(OUT, { recursive: true });
for (const [slug, { disegna, fotogrammi }] of Object.entries(SCENE)) {
  const frame = Array.from({ length: fotogrammi }, (_, f) => disegna(f));
  const sheet = foglio(frame);
  await fs.writeFile(path.join(OUT, `${slug}.png`), sheet);
  await fs.writeFile(path.join(OUT, `${slug}-spento.png`), spenta(frame[0]));
  await fs.writeFile(path.join(OUT, `${slug}-fondale.png`), fondale(frame[0]));
  await fs.writeFile(path.join(OUT, `${slug}-fondale-spento.png`), fondale(frame[0], true));
  console.log(`${slug}: ${fotogrammi} fotogrammi, ${sheet.length} byte`);
}
