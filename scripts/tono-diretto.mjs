#!/usr/bin/env node
// tono-diretto.mjs — Guide in forma diretta, senza racconto indiretto
//
// Le guide nascono da testimonianze ("viene descritto come", "a quanto
// riferito", "nell'anno di riferimento", "secondo la scheda"...). Nel sito le
// informazioni vanno date in forma diretta. Lo script:
//   1. trova, nei campi narrativi (non nel programma ufficiale), le frasi con
//      formule da racconto indiretto;
//   2. DeepSeek le riscrive in forma diretta (o le restituisce identiche se non
//      lo sono), una frase per volta, senza aggiungere né togliere fatti;
//   3. controllo: ogni numero e ogni parola con iniziale maiuscola (nomi,
//      sigle) della frase originale devono restare. Se no, la frase resta com'è.
//
//   node scripts/tono-diretto.mjs [--dry] [--solo=titolo]

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';

const RADICE = join(import.meta.dirname, '..');
const DIR_GUIDE = join(RADICE, 'src/content/guide');
const DIR_CACHE = join(RADICE, '.cache/tono-diretto');
const MODELLO = 'deepseek/deepseek-v4.1-flash';
const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const SOLO = args.find((a) => a.startsWith('--solo='))?.slice(7)?.toLowerCase();
const oggi = new Date().toISOString().slice(0, 10);

// Formule da racconto indiretto (il modello decide caso per caso).
const SOSPETTA = /testimonian|riferit|riferisc|secondo (quanto|la scheda|il rappresentante|la studentessa|lo studente)|a quanto|riportat[oaie] (che|dalla|dal|nella)|vengono riportat|la scheda|descritt[oaie]|considerat[oaie] (come|il|la|lo|le|i|molto|più|particolarmente)|ritenut[oaie]|non sembra|\bsembra\b|\bsembrano\b|\bpare\b|risulta(no)? |anno di riferimento|a detta|indicat[oaie] come/i;
// Campi narrativi: il programma ufficiale non si tocca.
const CAMPI = new Set(['descrizione_generale', 'exam_details', 'material_tips', 'body', 'stile', 'study_time']);

async function chiaveApi() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const env = await readFile(join(RADICE, '.env'), 'utf8').catch(() => '');
  const m = env.match(/^OPENROUTER_API_KEY\s*=\s*"?([^"\n]+)"?/m);
  if (m) return m[1].trim();
  throw new Error('Manca OPENROUTER_API_KEY (ambiente o .env).');
}

const ISTRUZIONI = `Riscrivi in forma diretta una frase di una guida d'esame per studenti di Medicina.
- Togli il racconto indiretto: "viene descritto come X" → "è X"; "i docenti sono descritti come gentili" → "i docenti sono gentili"; "a quanto riferito, esiste..." → "esiste..."; "secondo la testimonianza" → (via); "considerate le più complete" → "le più complete"; "ritenute sufficienti" → "sufficienti"; "non sembra essere controllata" → "non è controllata in modo rigoroso"; "nell'anno di riferimento" → "nell'ultimo anno accademico".
- Non aggiungere e non togliere informazioni; mantieni ogni nome, numero, sigla e formattazione Markdown (**grassetto**, "- " a inizio riga).
- Se la frase non contiene racconto indiretto (es. "la lode viene considerata una sola volta" è una regola), restituiscila IDENTICA.
Rispondi solo con la frase riscritta.`;

async function riscrivi(frase) {
  const hash = crypto.createHash('sha256').update(MODELLO + ISTRUZIONI + frase).digest('hex').slice(0, 16);
  const file = join(DIR_CACHE, `${hash}.txt`);
  const inCache = await readFile(file, 'utf8').catch(() => null);
  if (inCache !== null) return inCache;
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${await chiaveApi()}`, 'Content-Type': 'application/json', 'X-Title': 'HowToGolgi - tono diretto' },
    body: JSON.stringify({
      model: MODELLO,
      temperature: 0,
      max_tokens: 2000,
      reasoning: { effort: 'low', exclude: true },
      provider: { sort: 'throughput' },
      messages: [{ role: 'system', content: ISTRUZIONI }, { role: 'user', content: frase }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const corpo = await r.json();
  if (!r.ok) throw new Error(`OpenRouter ${r.status}: ${corpo.error?.message ?? ''}`);
  const out = (corpo.choices?.[0]?.message?.content ?? '').trim();
  await mkdir(DIR_CACHE, { recursive: true });
  await writeFile(file, out);
  return out;
}

/** Numeri e parole con iniziale maiuscola (non a inizio frase): devono restare. */
function ancore(frase) {
  const numeri = frase.match(/\d+(?:[.,/]\d+)*/g) ?? [];
  const nomi = (frase.match(/(?<![.!?]\s|^|\n|- |\*\*)\b[A-ZÀ-Ü][\wÀ-ü'’-]+/g) ?? []).filter((w) => !['Prof', 'Dott'].includes(w));
  return [...numeri, ...nomi];
}

/** Frasi di un testo: per riga, poi per punto fermo (mantiene il prefisso "- "). */
function frasi(testo) {
  return testo.split('\n').flatMap((riga) => riga.split(/(?<=[.!?])\s+(?=[A-ZÀ-Ü*])/));
}

let toccate = 0, cambiate = 0, scartate = 0;
for (const f of (await readdir(DIR_GUIDE)).filter((x) => x.endsWith('.yaml')).sort()) {
  const percorso = join(DIR_GUIDE, f);
  const dati = YAML.parse(await readFile(percorso, 'utf8'));
  if (SOLO && !dati.title.toLowerCase().includes(SOLO)) continue;
  const prima = JSON.stringify(dati);

  async function visita(obj) {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && CAMPI.has(k) && SOSPETTA.test(v)) {
        let testo = v;
        for (const fr of frasi(v)) {
          if (!SOSPETTA.test(fr)) continue;
          const nuova = await riscrivi(fr.trim());
          if (!nuova || nuova === fr.trim()) continue;
          const mancanti = ancore(fr).filter((a) => !nuova.includes(a));
          if (mancanti.length) {
            scartate++;
            console.log(`  ✗ ${dati.title}: tolto "${mancanti.join(', ')}", frase lasciata com'è`);
            continue;
          }
          testo = testo.replace(fr.trim(), nuova);
          cambiate++;
          console.log(`  ${dati.title} · ${k}\n    − ${fr.trim()}\n    + ${nuova}`);
        }
        obj[k] = testo;
      } else if (Array.isArray(v)) {
        for (const x of v) if (x && typeof x === 'object') await visita(x);
      } else if (v && typeof v === 'object') await visita(v);
    }
  }
  await visita(dati);
  if (JSON.stringify(dati) !== prima) {
    toccate++;
    if (!DRY) {
      const { ultimo_aggiornamento, ...resto } = dati;
      await writeFile(percorso, `${YAML.stringify(resto, { lineWidth: 0, blockQuote: 'literal' })}ultimo_aggiornamento: ${oggi}\n`);
    }
  }
}
console.log(`\n${cambiate} frasi riscritte, ${scartate} scartate, ${toccate} guide ${DRY ? 'da aggiornare (--dry)' : 'aggiornate'}.`);
