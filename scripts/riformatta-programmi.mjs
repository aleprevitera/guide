#!/usr/bin/env node
// riformatta-programmi.mjs — Impaginazione leggibile dei programmi ufficiali
//
// I programmi del catalogo arrivano spesso come blocchi illeggibili: elenchi
// scritti in fila ("-Disfagia -Dispepsia", "1. … 2) …", "Lez. 1 … Lez 2 …",
// voci separate da "•", "·", "o", ";"), titoli in MAIUSCOLO, e lo stesso
// syllabus ripetuto due volte (versioni A-L e M-Z quasi identiche).
//
// Per ogni modulo con programma ufficiale (link al catalogo):
//   1. toglie i paragrafi quasi duplicati (≥ 85% di parole in comune);
//   2. DeepSeek (OpenRouter) riformatta in Markdown ristretto: elenchi, titoli
//      di sezione in grassetto, maiuscolo → minuscolo con iniziale maiuscola;
//   3. CONTROLLO: la sequenza di parole deve restare IDENTICA all'originale
//      (ignorando solo maiuscole, punteggiatura, numerazione e simboli degli
//      elenchi). Se il modello cambia anche una parola il risultato si scarta.
// Lavora sul testo attuale della guida: modifiche a mano e divisione per
// modulo restano. Risposte in cache (.cache/riformatta-programmi).
//
//   node scripts/riformatta-programmi.mjs [--dry] [--solo=titolo]

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';

const RADICE = join(import.meta.dirname, '..');
const DIR_GUIDE = join(RADICE, 'src/content/guide');
const DIR_CACHE = join(RADICE, '.cache/riformatta-programmi');
const MODELLO = 'deepseek/deepseek-v4.1-flash';
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
// Solo il controllo delle ripetizioni sul testo già impaginato, senza modello.
const SOLO_DOPPIONI = args.includes('--solo-doppioni');
const SOLO = args.find((a) => a.startsWith('--solo='))?.slice(7)?.toLowerCase();
const oggi = new Date().toISOString().slice(0, 10);

async function chiaveApi() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const env = await readFile(join(RADICE, '.env'), 'utf8').catch(() => '');
  const m = env.match(/^OPENROUTER_API_KEY\s*=\s*"?([^"\n]+)"?/m);
  if (m) return m[1].trim();
  throw new Error('Manca OPENROUTER_API_KEY (ambiente o .env).');
}

// --- Confronto delle parole -------------------------------------------------

/** Parole in sequenza: minuscole, senza accenti né punteggiatura, senza numeri isolati e marcatori d'elenco. */
const parole = (testo) =>
  testo
    .replace(/^\s*(o|[-•·▪–*])\s+/gm, ' ') // marcatori a inizio riga ("o", "-", "•")
    .replace(/(^|[\s(])[a-zA-Z]\)\s/g, ' ') // marcatori a lettera: "a) … b) …"
    .replace(/\*\*|__|\*/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    // Numeri isolati (numerazione) e "o" (marcatore d'elenco o congiunzione): ignorati da entrambe le parti.
    .filter((w) => w && !/^\d+$/.test(w) && w !== 'o');

/** Prima differenza fra due sequenze di parole (per i log), o null se uguali. */
function differenza(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return `parola ${i}: "${a.slice(i, i + 4).join(' ')}" ≠ "${b.slice(i, i + 4).join(' ')}"`;
  return null;
}

// --- 1. Paragrafi quasi duplicati ------------------------------------------

function senzaQuasiDuplicati(testo) {
  const paragrafi = testo.split(/\n\s*\n/);
  const tenuti = [];
  let tolti = 0;
  for (const p of paragrafi) {
    const P = new Set(parole(p));
    const doppio = P.size > 12 && tenuti.some((q) => {
      const Q = new Set(parole(q));
      let inter = 0;
      for (const w of P) if (Q.has(w)) inter++;
      return inter / Math.min(P.size, Q.size) >= 0.85 && Math.abs(P.size - Q.size) / Math.max(P.size, Q.size) < 0.2;
    });
    if (doppio) tolti++;
    else tenuti.push(p);
  }
  return { testo: tenuti.join('\n\n'), tolti };
}

// --- 1 bis. Sezioni e voci ripetute (dopo l'impaginazione) ----------------
// Il catalogo può contenere più copie del syllabus con confini diversi (es.
// Neurologia: tre versioni). Una sezione (titolo in grassetto + contenuto) si
// toglie se ≥ 90% delle sue parole sta già in UNA sezione precedente; poi si
// tolgono le voci d'elenco identiche già comparse.
/** Ripete la pulizia finché non toglie più nulla (togliere un doppione può farne emergere un altro). */
function senzaSezioniDoppie(md) {
  let testo = md, tolte = 0;
  for (;;) {
    const r = unaPassata(testo);
    if (!r.tolte) return { testo, tolte };
    testo = r.testo;
    tolte += r.tolte;
  }
}

function unaPassata(md) {
  // Riga confrontabile: senza marcatori d'elenco, numerazione, grassetto, punteggiatura, maiuscole.
  const chiave = (r) => parole(r.replace(/^\s*(\d+[.)]|[-*])\s+/, '')).join(' ');
  const righe = md.split('\n');
  const sezioni = [];
  for (const r of righe) {
    const titolo = /^\*\*[^*]+\*\*:?\s*$/.test(r.trim()) || /^\*\*[^*]+:\*\*/.test(r.trim());
    if (titolo || !sezioni.length) sezioni.push([r]);
    else sezioni[sezioni.length - 1].push(r);
  }
  // Copie del syllabus (es. Neurologia: tre versioni): si riconoscono dal
  // PRIMO titolo del programma che ricompare più avanti. Solo in quel caso le
  // sezioni delle copie successive si fondono, per titolo, nella prima copia
  // (righe nuove aggiunte, doppioni via). Titoli ripetuti per struttura
  // ("Argomenti irrinunciabili" sotto ogni specialità) restano come sono.
  const chiaveTitolo = (r) => r.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const eTitolo = (r) => /^\*\*/.test(r.trim());
  const primo = sezioni.find((sz) => eTitolo(sz[0]));
  const inizioCopie = primo ? sezioni.findIndex((sz) => sz !== primo && eTitolo(sz[0]) && chiaveTitolo(sz[0]) === chiaveTitolo(primo[0])) : -1;
  const tenute = inizioCopie < 0 ? [...sezioni] : sezioni.slice(0, inizioCopie);
  let tolte = 0;
  for (const sez of inizioCopie < 0 ? [] : sezioni.slice(inizioCopie)) {
    const prima = eTitolo(sez[0]) ? tenute.find((t) => chiaveTitolo(t[0]) === chiaveTitolo(sez[0])) : null;
    if (!prima) { tenute.push(sez); continue; }
    const presenti = new Set(prima.map(chiave));
    const nuove = sez.slice(1).filter((r) => chiave(r) && !presenti.has(chiave(r)));
    let fine = prima.length;
    while (fine > 1 && !prima[fine - 1].trim()) fine--;
    prima.splice(fine, 0, ...nuove);
    tolte++;
  }
  // Sezioni IDENTICHE (titolo e contenuto) a una precedente, ovunque: via.
  const firme = new Set();
  const uniche = [];
  for (const sez of tenute) {
    const contenuto = sez.slice(1).map(chiave).filter(Boolean);
    const firma = `${chiaveTitolo(sez[0])}|${contenuto.join('|')}`;
    if (contenuto.length && firme.has(firma)) { tolte++; continue; }
    firme.add(firma);
    uniche.push(sez);
  }
  tenute.splice(0, tenute.length, ...uniche);
  // Paragrafi lunghi (non voci d'elenco, non titoli) identici a uno già comparso.
  const paragrafiVisti = new Set();
  for (const sez of tenute) {
    for (let k = 0; k < sez.length; k++) {
      const r = sez[k];
      if (/^\s*(-|\d+[.)]|\*\*)/.test(r) || r.trim().length < 60) continue;
      const kk = chiave(r);
      if (paragrafiVisti.has(kk)) { sez[k] = ''; tolte++; } else paragrafiVisti.add(kk);
    }
  }
  // Voci d'elenco identiche ripetute DENTRO la stessa sezione.
  const out = [];
  for (const sez of tenute) {
    const gia = new Set();
    for (const r of sez) {
      const k = chiave(r);
      // Solo voci puntate: togliere voci numerate spezzerebbe la numerazione.
      if (/^\s*-\s/.test(r) && k.length > 20) {
        if (gia.has(k)) { tolte++; continue; }
        gia.add(k);
      }
      out.push(r);
    }
  }
  return { testo: out.join('\n'), tolte };
}

// --- 2. Riformattazione con controllo -------------------------------------

const ISTRUZIONI = `Ricevi il programma ufficiale di un insegnamento di Medicina, impaginato male. Restituisci LO STESSO TESTO impaginato in Markdown ristretto, leggibile su telefono.

Regole ASSOLUTE:
- Non aggiungere, togliere, cambiare o riordinare NESSUNA parola. Ogni parola dell'originale deve comparire, nello stesso ordine. Puoi cambiare solo: a capo, punteggiatura, maiuscole/minuscole e marcatori d'elenco.
- Non tradurre, non correggere refusi, non riassumere.

Impaginazione:
- Enumerazioni di argomenti (separate da "-", "•", "·", "o", ";", numeri "1." / "2)", "Lez. 1"...) → elenco puntato con "- " (o numerato "1." se l'originale era numerato), una voce per riga.
- Titoli di sezione (es. "PATOLOGIA CARDIOVASCOLARE:", "Neurologia funzionale") → riga a sé in **grassetto**, seguita dal contenuto.
- Testo in MAIUSCOLO → minuscolo con iniziale maiuscola, mantenendo in maiuscolo sigle e acronimi (TNM, HIV, SNC, EEG...).
- La prosa resta in paragrafi.
- Solo: **grassetto**, elenchi "- " o "1.", paragrafi separati da una riga vuota. Niente titoli #, tabelle, HTML.
Rispondi solo con il testo impaginato.`;

async function riformatta(testo, avviso = '') {
  const hash = crypto.createHash('sha256').update(MODELLO + ISTRUZIONI + testo + avviso).digest('hex').slice(0, 16);
  const file = join(DIR_CACHE, `${hash}.md`);
  const inCache = await readFile(file, 'utf8').catch(() => null);
  if (inCache) return inCache;
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await chiaveApi()}`, 'Content-Type': 'application/json', 'X-Title': 'HowToGolgi - impaginazione programmi' },
    body: JSON.stringify({
      model: MODELLO,
      temperature: 0,
      max_tokens: 16000,
      reasoning: { effort: 'low', exclude: true },
      provider: { sort: 'throughput' },
      messages: [{ role: 'system', content: ISTRUZIONI + avviso }, { role: 'user', content: testo }],
    }),
    signal: AbortSignal.timeout(240_000),
  });
  const corpo = await r.json();
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${corpo.error?.message ?? ''}`);
  const out = (corpo.choices?.[0]?.message?.content ?? '').trim().replace(/^```\w*\n?|\n?```$/g, '');
  await mkdir(DIR_CACHE, { recursive: true });
  await writeFile(file, out);
  return out;
}

/** Righe vuote attorno agli elenchi e fra i paragrafi. */
function normalizza(md) {
  const elenco = (r) => /^\s*([-*]|\d+[.)])\s+/.test(r);
  const out = [];
  for (const r of md.replace(/\r\n/g, '\n').split('\n')) {
    const prec = out[out.length - 1];
    if (prec !== undefined && prec.trim() && r.trim() && (elenco(prec) !== elenco(r) || (!elenco(prec) && !elenco(r))) && !/^\s{2,}/.test(r)) out.push('');
    out.push(r.replace(/\s+$/, ''));
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// --- Main -------------------------------------------------------------------

let toccate = 0;
for (const f of (await readdir(DIR_GUIDE)).filter((x) => x.endsWith('.yaml')).sort()) {
  const percorso = join(DIR_GUIDE, f);
  const dati = YAML.parse(await readFile(percorso, 'utf8'));
  if (SOLO && !dati.title.toLowerCase().includes(SOLO)) continue;
  let cambiata = false;
  for (const m of dati.moduli) {
    if (!(m.program ?? '').includes('coursecatalogue.cineca.it')) continue;
    // Corpo = tutto tranne le righe finali in corsivo (nota e link al catalogo).
    const righe = m.program.trim().split('\n');
    let fine = righe.length;
    while (fine > 0 && (/^\*[^*].*\*$/.test(righe[fine - 1].trim()) || !righe[fine - 1].trim())) fine--;
    const corpo = righe.slice(0, fine).join('\n').trim();
    const coda = righe.slice(fine).join('\n').trim();
    if (!corpo) continue;

    if (SOLO_DOPPIONI) {
      const { testo, tolte } = senzaSezioniDoppie(corpo);
      if (!tolte) continue;
      m.program = `${normalizza(testo)}\n\n${coda}`;
      cambiata = true;
      console.log(`✓ ${dati.title} / ${m.nome_modulo} · ${tolte} sezioni/voci ripetute tolte`);
      continue;
    }
    const { testo: pulito, tolti } = senzaQuasiDuplicati(corpo);
    // Testi lunghi: blocchi di paragrafi (≤ 3000 caratteri), impaginati e
    // controllati uno per uno (sui testi lunghi il modello tende a fermarsi prima).
    const blocchi = [];
    for (const par of pulito.split(/\n\s*\n/)) {
      if (blocchi.length && blocchi[blocchi.length - 1].length + par.length < 3000) blocchi[blocchi.length - 1] += `\n\n${par}`;
      else blocchi.push(par);
    }
    const pezzi = [];
    let diff = null;
    for (const b of blocchi) {
      let out, d;
      try {
        out = await riformatta(b);
        d = differenza(parole(b), parole(out));
        // Altri tentativi: si dice al modello quale parola ha cambiato.
        for (let t = 0; d && t < 2; t++) {
          out = await riformatta(b, `\n\nATTENZIONE: in un tentativo precedente hai cambiato delle parole (${d}). Copia ogni parola esattamente com'è, anche se ti sembra un refuso.`);
          d = differenza(parole(b), parole(out));
        }
      } catch (e) {
        d = e.message;
      }
      if (d) { diff = d; break; }
      pezzi.push(out);
    }
    let nuovo = pezzi.join('\n\n');
    if (diff) {
      console.log(`✗ ${dati.title} / ${m.nome_modulo}: parole cambiate, scartato (${diff})`);
      if (!tolti) continue;
      nuovo = pulito; // almeno i doppioni via
    }
    const sezDoppie = senzaSezioniDoppie(nuovo);
    nuovo = normalizza(sezDoppie.testo);
    if (nuovo === corpo) continue;
    m.program = `${nuovo}\n\n${coda}`;
    cambiata = true;
    console.log(`✓ ${dati.title} / ${m.nome_modulo}${tolti ? ` · ${tolti} paragrafi doppi tolti` : ''}${sezDoppie.tolte ? ` · ${sezDoppie.tolte} sezioni/voci ripetute tolte` : ''}${diff ? ' · solo doppioni (impaginazione scartata)' : ''}`);
  }
  if (cambiata) {
    toccate++;
    if (!DRY) {
      const { ultimo_aggiornamento, ...resto } = dati;
      await writeFile(percorso, `${YAML.stringify(resto, { lineWidth: 0, blockQuote: 'literal' })}ultimo_aggiornamento: ${oggi}\n`);
    }
  }
}
console.log(`\n${toccate} guide ${DRY ? 'da aggiornare (--dry)' : 'aggiornate'}.`);
