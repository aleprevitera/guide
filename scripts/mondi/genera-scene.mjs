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

// Dimensioni native di un fotogramma (mostrato a 2× nel sito).
export const LARGHEZZA = 112;
export const ALTEZZA = 60;

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
  }
  set(x, y, c) {
    if (c && x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
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

/** Variante "bloccata" (mondo senza guide): primo fotogramma in scala di grigi della palette. */
function spenta(t) {
  const scala = [C.nero, C.antracite, C.ardesia, C.grigio];
  const s = new Tela();
  t.px.forEach((c, i) => {
    if (!c) return;
    const [r, g, b] = hex(c);
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    s.px[i] = scala[Math.min(scala.length - 1, Math.floor(l * scala.length * 0.85))];
  });
  return png(LARGHEZZA, ALTEZZA, s.px);
}

// --- Scene ---------------------------------------------------------------------
// Il testo della casella sta a sinistra: il soggetto della scena va a destra
// (x ≳ 56). Su telefono si vedono circa le ultime 75 colonne.

/** III anno — il laboratorio (Patologia, Microbiologia, Medicina di Laboratorio). */
function laboratorio(f) {
  const t = new Tela();
  // Parete a piastrelle.
  t.rect(0, 0, LARGHEZZA, 45, C.blu);
  for (let y = 11; y < 45; y += 11) t.rect(0, y, LARGHEZZA, 1, C.blunotte);
  for (let y = 0; y < 45; y += 11) for (let x = (y / 11) % 2 ? 6 : 0; x < LARGHEZZA; x += 12) t.rect(x, y, 1, 11, C.blunotte);

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

  // Bancone.
  t.rect(0, 45, LARGHEZZA, 1, C.bianco);
  t.rect(0, 46, LARGHEZZA, 3, C.grigio);
  t.rect(0, 49, LARGHEZZA, 11, C.ardesia);
  for (let x = 4; x < LARGHEZZA; x += 24) {
    t.rect(x, 51, 20, 7, C.antracite);
    t.rect(x + 8, 54, 4, 1, C.grigio);
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

export const SCENE = {
  'iii-anno': { disegna: laboratorio, fotogrammi: 6 },
};

// --- Main ----------------------------------------------------------------------

await fs.mkdir(OUT, { recursive: true });
for (const [slug, { disegna, fotogrammi }] of Object.entries(SCENE)) {
  const frame = Array.from({ length: fotogrammi }, (_, f) => disegna(f));
  const sheet = foglio(frame);
  await fs.writeFile(path.join(OUT, `${slug}.png`), sheet);
  await fs.writeFile(path.join(OUT, `${slug}-spento.png`), spenta(frame[0]));
  console.log(`${slug}: ${fotogrammi} fotogrammi, ${sheet.length} byte`);
}
