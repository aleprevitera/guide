#!/usr/bin/env node
// Importa le schede esportate da Notion (cartella NOTION/) come guide YAML in
// src/content/guide/, usando DeepSeek V4 via OpenRouter come estrattore.
//
// I rappresentanti lavorano solo in Decap: una volta nel sito, una guida si
// modifica lì. Per questo l'import AGGIUNGE solo le guide nuove e salta quelle
// già presenti; per riscriverne una da Notion serve --aggiorna (che comunque
// conserva link, CFU e dati della scheda inseriti in Decap).
//
//   node scripts/importa-notion.mjs            # importa le schede pronte non ancora nel sito
//   node scripts/importa-notion.mjs --dry      # niente scritture nel sito: YAML in .cache/
//   node scripts/importa-notion.mjs --solo "Pediatria"
//   node scripts/importa-notion.mjs --rifai    # ignora la cache delle risposte
//   node scripts/importa-notion.mjs --elenco   # mostra solo cosa verrebbe importato
//   node scripts/importa-notion.mjs --aggiorna --solo "Titolo"  # riscrive da Notion una guida esistente
//
// Chiave: OPENROUTER_API_KEY nell'ambiente o in .env (mai nel repo).
//
// Cosa decide il CODICE (deterministico): quali schede importare (Stato =
// Fatto e contenuto reale), anno di corso (sezioni del CSV), autore, id,
// data, nome del file. Cosa decide il MODELLO: solo la strutturazione del
// testo nei campi dello schema, con output vincolato a uno schema JSON.
// Dopo il modello: validazione zod (stessi vincoli di src/content/config.ts)
// e controllo anti-invenzione su numeri e link.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';
import { z } from 'zod';
// Stessa regola del sito per la fascia dell'istogramma (Node importa .ts).
import { fasciaDaGiorni } from '../src/lib/fasce.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR_NOTION = path.join(ROOT, 'NOTION');
const DIR_GUIDE = path.join(ROOT, 'src/content/guide');
const DIR_CACHE = path.join(ROOT, '.cache/importa-notion');

const MODELLO = 'deepseek/deepseek-v4.1-flash';
const CONCORRENZA = 6;
const TENTATIVI = 3;
const MIN_CARATTERI = 200; // sotto questa soglia la scheda è considerata vuota

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const RIFAI = args.includes('--rifai');
const SOLO = args.includes('--solo') ? args[args.indexOf('--solo') + 1] : null;
const ELENCO = args.includes('--elenco');
const AGGIORNA = args.includes('--aggiorna');

// --- Vincoli condivisi con src/content/config.ts e src/lib/fasce.ts --------

const ANNI = { PRIMO: 'I Anno', SECONDO: 'II Anno', TERZO: 'III Anno', QUARTO: 'IV Anno', QUINTO: 'V Anno', SESTO: 'VI Anno' };
const TIPI_ESAME = ['Orale', 'Scritto', 'Scritto + Orale'];
const SEMESTRI = ['I', 'II'];
const FREQUENZE = ['Obbligatoria', 'Consigliata', 'Facoltativa'];
const PREAPPELLO = ['Sì', 'No'];

// --- Utilità ----------------------------------------------------------------

const log = (...a) => console.error(...a);
const oggi = () => new Date().toISOString().slice(0, 10);
const idCasuale = (prefisso) => {
  const alfabeto = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return `${prefisso}-${Array.from(crypto.randomBytes(8), (b) => alfabeto[b % 36]).join('')}`;
};
const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const STOP = new Set(['e', 'ed', 'di', 'del', 'della', 'dell', 'degli', 'dei', 'per', 'il', 'la', 'le', 'lo', 'gli', 'i']);
const chiaveTitolo = (s) => slugify(s).split('-').filter((w) => w && !STOP.has(w)).sort().join(' ');

async function chiaveApi() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  try {
    const env = await fs.readFile(path.join(ROOT, '.env'), 'utf8');
    const m = env.match(/^OPENROUTER_API_KEY\s*=\s*"?([^"\n]+)"?/m);
    if (m) return m[1].trim();
  } catch {}
  throw new Error('Manca OPENROUTER_API_KEY (ambiente o .env).');
}

function parseCsv(testo) {
  const righe = [];
  let campo = '', riga = [], virgolette = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (virgolette) {
      if (c === '"' && testo[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') virgolette = false;
      else campo += c;
    } else if (c === '"') virgolette = true;
    else if (c === ',') { riga.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && testo[i + 1] === '\n') i++;
      riga.push(campo); righe.push(riga); riga = []; campo = '';
    } else campo += c;
  }
  if (campo || riga.length) { riga.push(campo); righe.push(riga); }
  return righe.filter((r) => r.some((x) => x.trim()));
}

async function limitaConcorrenza(items, n, fn) {
  const risultati = new Array(items.length);
  let prossimo = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (prossimo < items.length) {
      const i = prossimo++;
      risultati[i] = await fn(items[i], i);
    }
  }));
  return risultati;
}

// --- 1. Indice delle schede (CSV di Notion) --------------------------------

async function leggiIndice() {
  const files = await fs.readdir(DIR_NOTION);
  const csv = files.find((f) => f.endsWith('.csv') && !f.endsWith('_all.csv'));
  const [intestazione, ...righe] = parseCsv((await fs.readFile(path.join(DIR_NOTION, csv), 'utf8')).replace(/^﻿/, ''));
  const col = (nome) => intestazione.findIndex((h) => h.trim() === nome);
  const [iNome, iStato, iAutore] = [col('Nome'), col('Stato'), col('Autore')];

  const indice = new Map();
  let anno = null;
  for (const r of righe) {
    const nome = r[iNome].trim();
    const sezione = nome.match(/^(PRIMO|SECONDO|TERZO|QUARTO|QUINTO|SESTO) ANNO$/);
    if (sezione) { anno = ANNI[sezione[1]]; continue; }
    indice.set(nome, { nome, anno, stato: r[iStato]?.trim(), autore: r[iAutore]?.trim() || undefined });
  }

  const dirMd = path.join(DIR_NOTION, files.find((f) => !f.includes('.') && f.startsWith('NUOVE')) ?? 'NUOVE GUIDE PRATICHE');
  const schede = [];
  for (const f of await fs.readdir(dirMd)) {
    if (!f.endsWith('.md')) continue;
    const testo = await fs.readFile(path.join(dirMd, f), 'utf8');
    const titolo = testo.match(/^# (.+)$/m)?.[1].trim();
    const voce = titolo && indice.get(titolo);
    if (!voce) continue; // indici degli anni o pagine non in tabella
    // Corpo senza titolo e metadati Notion (Autore:, Stato:).
    const corpo = testo.replace(/^# .+\n/, '').replace(/^(Autore|Stato):.*\n/gm, '').trim();
    schede.push({ ...voce, file: f, corpo });
  }
  return schede;
}

// --- 2. Guide esistenti (per sostituire i segnaposto mantenendo gli id) -----

async function leggiEsistenti() {
  const mappa = new Map();
  // Id riservati di guide tolte dal sito ma con voti su Supabase.
  const riservati = JSON.parse(await fs.readFile(path.join(ROOT, 'scripts/id-riservati.json'), 'utf8'));
  for (const [titolo, r] of Object.entries(riservati)) {
    if (titolo.startsWith('_')) continue;
    const moduli = Object.entries(r.moduli).map(([nome_modulo, id]) => ({ nome_modulo, id }));
    mappa.set(chiaveTitolo(titolo), { file: r.file, dati: { id: r.id, moduli }, riservato: true });
  }
  for (const f of await fs.readdir(DIR_GUIDE)) {
    if (!f.endsWith('.yaml')) continue;
    const dati = YAML.parse(await fs.readFile(path.join(DIR_GUIDE, f), 'utf8'));
    mappa.set(chiaveTitolo(dati.title), { file: f, dati });
  }
  return mappa;
}

// --- 3. Schema per il modello (structured outputs) -------------------------

const S = (tipo, extra = {}) => ({ type: [tipo, 'null'], ...extra });
const enumNull = (valori) => ({ type: ['string', 'null'], enum: [...valori, null] });
const MD = 'Markdown ristretto: solo **grassetto**, *corsivo*, elenchi con "- " o "1.", link [testo](url). Niente titoli #, tabelle, HTML, separatori ---.';

const SCHEMA_JSON = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'cfu_totali', 'descrizione_generale', 'moduli', 'info_da_verificare'],
  properties: {
    title: { type: 'string', description: 'Nome dell’esame come nella scheda.' },
    cfu_totali: S('integer', { description: 'CFU totali solo se scritti esplicitamente.' }),
    descrizione_generale: S('string', { description: `Solo per esami con più moduli: composizione dell’esame e calcolo del voto finale. ${MD}` }),
    moduli: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['nome_modulo', 'cfu', 'semestre', 'difficolta', 'exam_type', 'study_time', 'giorni_min', 'giorni_max', 'preappello', 'frequenza', 'durata_orale_min', 'exam_details', 'program', 'material_tips', 'body', 'professors'],
        properties: {
          nome_modulo: { type: 'string' },
          cfu: S('integer'),
          semestre: enumNull(SEMESTRI),
          difficolta: S('integer', { description: '1-5, solo se la scheda la indica esplicitamente.' }),
          exam_type: enumNull(TIPI_ESAME),
          study_time: S('string', { description: 'Tempo di studio come scritto, breve (es. "circa 15 giorni", "2-3 settimane").' }),
          giorni_min: S('integer', { description: 'Tempo di studio minimo in giorni (settimana = 7, mese = 30), solo se study_time c’è.' }),
          giorni_max: S('integer', { description: 'Tempo di studio massimo in giorni; uguale a giorni_min se è un valore unico.' }),
          preappello: enumNull(PREAPPELLO),
          frequenza: enumNull(FREQUENZE),
          durata_orale_min: S('integer', { description: 'Durata dell’orale in minuti, solo se scritta.' }),
          exam_details: S('string', { description: `Come si svolge l’esame. ${MD}` }),
          program: { type: 'string', description: `Programma d’esame e argomenti da curare. ${MD}` },
          material_tips: S('string', { description: `Dove studiare, fonti, consigli di studio. ${MD}` }),
          body: S('string', { description: `Altro utile che non rientra negli altri campi. ${MD}` }),
          professors: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['nome', 'email', 'stile'],
              properties: {
                nome: { type: 'string', description: 'Cognome (o nome e cognome) come nella scheda, con iniziale maiuscola.' },
                email: S('string'),
                stile: S('string', { description: 'Come interroga / cosa chiede, se descritto.' }),
              },
            },
          },
        },
      },
    },
    info_da_verificare: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['campo', 'nota'],
        properties: { campo: { type: 'string' }, nota: S('string') },
      },
    },
  },
};

const ISTRUZIONI = `Sei un estrattore di dati. Trasformi una scheda d'esame scritta da studenti di Medicina (Università di Pavia) in un oggetto JSON conforme allo schema fornito. Rispondi solo con il JSON.

Regole, in ordine di importanza:
1. FEDELTÀ. Usa solo informazioni presenti nella scheda. Non inventare e non dedurre docenti, CFU, semestre, difficoltà, durate, date o link. Se un dato manca, metti null.
2. Puoi riformulare in modo chiaro e impersonale (es. "io ho impiegato 15 giorni" → "circa 15 giorni"), correggere refusi evidenti e riordinare, ma senza togliere informazioni utili né aggiungerne.
3. MODULI. Se la scheda descrive parti distinte con modalità d'esame proprie (es. chemioterapia / tossicologia / farmacologia), crea un modulo per parte e raccogli in ciascuno le informazioni sparse nelle varie sezioni (programma, dove studiare, tempo, modalità). Altrimenti un solo modulo con nome_modulo uguale al titolo. In descrizione_generale (solo con più moduli) metti la composizione dell'esame e come si calcola il voto finale.
4. CAMPI:
   - exam_type: "Orale", "Scritto" o "Scritto + Orale" (scritto seguito da orale). null se non chiaro.
   - frequenza: solo se la scheda dice chiaramente obbligatoria / consigliata / facoltativa; altrimenti null.
   - preappello: "Sì" o "No" solo se la scheda lo dice.
   - TEMPO DI STUDIO (alimenta l'istogramma "quanto hai studiato", che è per modulo). Cerca sempre la sezione "Per quanto studiare" (o simili) e leggila tutta.
     * Esame a un solo modulo: il tempo indicato va in study_time di quel modulo.
     * Esame con più moduli e tempi indicati per singolo modulo: ogni modulo ha il suo study_time.
     * Esame con più moduli e un tempo unico per l'esame intero (es. "un mese per tutti e tre i moduli", "15/20 giorni complessivi"): NON assegnarlo ai moduli (study_time e giorni null in tutti) e scrivilo in descrizione_generale come "Tempo di studio complessivo: …".
     * Più indicazioni per lo stesso modulo (es. "10 giorni per passare, 20 per una preparazione completa, 1 mese per stare tranquilli"): study_time riassume l'intervallo ("10 giorni – 1 mese") e giorni_min/giorni_max ne sono gli estremi.
     * study_time breve e leggibile (es. "1 mese e mezzo – 2 mesi"); niente tempo in material_tips o altrove.
     * giorni_min/giorni_max: lo stesso tempo in giorni (settimana = 7, mese = 30; "1 mese e mezzo/2" → 45 e 60; "15 giorni" → 15 e 15). Null se study_time è null.
   - program: obbligatorio. Se la scheda non lo descrive (o il campo è vuoto), scrivi "Programma da confermare." e aggiungi un elemento in info_da_verificare.
   - professors: solo docenti nominati nella scheda; in stile metti come interrogano o cosa chiedono, se scritto.
5. NIENTE DOPPIONI. Ogni informazione va in un solo campo:
   - program: cosa si studia (argomenti, macro-argomenti, cosa curare di più);
   - material_tips: da dove studiare (sbobine, libri, slide, domande passate) e consigli di studio;
   - exam_details: come si svolge l'esame (prove, punteggi, durata, chi interroga, ordine);
   - professors[].stile: come interroga ciascun docente (non ripeterlo in exam_details);
   - body: solo ciò che non rientra in nessuno dei campi precedenti, altrimenti null.
6. DA VERIFICARE. Aggiungi un elemento in info_da_verificare SOLO quando la scheda: lascia una voce vuota (es. "programma d'esame:" senza testo), la segna "da sistemare", esprime un dubbio ("non ne sono certa", "credo", "se non mi sbaglio") o si contraddice. NON aggiungere elementi per dati semplicemente non citati (CFU, semestre, date, link, preappello…). campo = cosa verificare, nota = dettaglio, con il modulo se serve.
7. FORMATO dei testi: markdown ristretto (solo **grassetto**, *corsivo*, elenchi "- " o "1.", link). Usa un elenco puntato quando ci sono più voci (argomenti, fonti, parti della prova) e paragrafi brevi altrimenti. Converti titoli e sottotitoli della scheda in testo normale o grassetto: niente "#", tabelle, HTML o "---".
8. Lingua: italiano.`;

// --- 4. Validazione (stessi vincoli di src/content/config.ts) --------------

const md = z.string().min(1).refine((s) => !/^\s{0,3}#{1,6}\s/m.test(s) && !/<\/?[a-z][^>]*>/i.test(s) && !/^\s*---\s*$/m.test(s), 'contiene titoli, HTML o separatori non ammessi');
const url = z.string().url().refine((u) => /^https?:\/\//.test(u), 'URL non http(s)');
const nullOpt = (t) => t.nullable().optional();

const ZodModulo = z.object({
  nome_modulo: z.string().min(1).max(150),
  cfu: nullOpt(z.number().int().min(1).max(60)),
  semestre: nullOpt(z.enum(SEMESTRI)),
  difficolta: nullOpt(z.number().int().min(1).max(5)),
  exam_type: nullOpt(z.enum(TIPI_ESAME)),
  study_time: nullOpt(z.string().max(100)),
  giorni_min: nullOpt(z.number().int().min(1).max(365)),
  giorni_max: nullOpt(z.number().int().min(1).max(365)),
  preappello: nullOpt(z.enum(PREAPPELLO)),
  frequenza: nullOpt(z.enum(FREQUENZE)),
  durata_orale_min: nullOpt(z.number().int().min(1).max(240)),
  link_sbobine: nullOpt(url), link_whatsapp: nullOpt(url), google_sheet_url: nullOpt(url),
  exam_details: nullOpt(md),
  program: md,
  material_tips: nullOpt(md),
  body: nullOpt(md),
  professors: z.array(z.object({
    nome: z.string().min(1).max(150),
    email: nullOpt(z.string().email()),
    stile: nullOpt(z.string().max(500)),
  })),
})
  .refine((m) => (m.giorni_min == null) === (m.study_time == null), 'giorni_min va indicato se e solo se c’è study_time')
  .refine((m) => m.giorni_min == null || m.giorni_max == null || m.giorni_max >= m.giorni_min, 'giorni_max minore di giorni_min');

const ZodGuida = z.object({
  title: z.string().min(3).max(150),
  cfu_totali: nullOpt(z.number().int().min(1).max(120)),
  descrizione_generale: nullOpt(md),
  moduli: z.array(ZodModulo).min(1),
  info_da_verificare: z.array(z.object({ campo: z.string().min(1).max(200), nota: nullOpt(z.string()) })),
});

/** Numeri e link nell'output che non compaiono nella scheda originale. */
function sospetti(guida, sorgente) {
  const avvisi = [];
  const numeriSorgente = new Set(sorgente.match(/\d+(?:[.,]\d+)?/g) ?? []);
  const visita = (v, dove) => {
    if (v == null) return;
    if (typeof v === 'number' && !/giorni_(min|max)$/.test(dove) && !numeriSorgente.has(String(v))) avvisi.push(`${dove}: numero ${v} non presente nella scheda`);
    if (typeof v === 'string') {
      if (/giorni_(min|max)$/.test(dove)) return;
      const senzaNumeriElenco = v.replace(/^\s*\d+[.)]\s/gm, '');
      for (const n of senzaNumeriElenco.match(/\d+(?:[.,]\d+)?/g) ?? []) if (!numeriSorgente.has(n)) avvisi.push(`${dove}: "${n}" non presente nella scheda`);
      for (const u of v.match(/https?:\/\/[^\s)]+/g) ?? []) if (!sorgente.includes(u)) avvisi.push(`${dove}: link ${u} non presente nella scheda`);
    }
    if (Array.isArray(v)) v.forEach((x, i) => visita(x, `${dove}[${i}]`));
    else if (typeof v === 'object') for (const [k, x] of Object.entries(v)) visita(x, dove ? `${dove}.${k}` : k);
  };
  visita(guida, '');
  return avvisi;
}

// --- 5. Chiamata al modello -------------------------------------------------

async function chiamaModello(chiave, messaggi) {
  for (let tentativoRete = 0; ; tentativoRete++) {
    let risposta;
    try {
      risposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${chiave}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://guide-pratiche.netlify.app',
        'X-Title': 'Guide Universitarie - import Notion',
      },
      body: JSON.stringify({
        model: MODELLO,
        messages: messaggi,
        temperature: 0,
        max_tokens: 16000,
        // Il ragionamento esteso (attivo di default su V4) rallenta molto
        // senza servire a un'estrazione vincolata da schema.
        reasoning: { effort: 'low', exclude: true },
        response_format: { type: 'json_schema', json_schema: { name: 'guida', strict: true, schema: SCHEMA_JSON } },
        // Solo provider che supportano lo schema JSON, i più veloci per primi.
        provider: { require_parameters: true, sort: 'throughput' },
        usage: { include: true },
      }),
      signal: AbortSignal.timeout(240_000),
    });
    } catch (e) {
      // Errori di rete o timeout: si riprova con attesa crescente.
      if (tentativoRete < 4) {
        log(`  … rete: ${e.cause?.code ?? e.name}, nuovo tentativo`);
        await new Promise((r) => setTimeout(r, 2000 * 2 ** tentativoRete));
        continue;
      }
      throw e;
    }
    if ((risposta.status === 429 || risposta.status >= 500) && tentativoRete < 4) {
      await new Promise((r) => setTimeout(r, 2000 * 2 ** tentativoRete));
      continue;
    }
    const corpo = await risposta.json().catch(() => ({}));
    if (!risposta.ok) throw new Error(`OpenRouter ${risposta.status}: ${corpo.error?.message ?? 'errore'}`);
    return { testo: corpo.choices?.[0]?.message?.content ?? '', usage: corpo.usage ?? {}, modello: corpo.model };
  }
}

async function estrai(chiave, scheda) {
  const hash = crypto.createHash('sha256').update(MODELLO + ISTRUZIONI + JSON.stringify(SCHEMA_JSON) + scheda.corpo).digest('hex').slice(0, 16);
  const fileCache = path.join(DIR_CACHE, `${slugify(scheda.nome)}-${hash}.json`);
  if (!RIFAI) {
    try {
      return { ...JSON.parse(await fs.readFile(fileCache, 'utf8')), daCache: true };
    } catch {}
  }

  const messaggi = [
    { role: 'system', content: ISTRUZIONI },
    { role: 'user', content: `Scheda "${scheda.nome}" (${scheda.anno}). Restituisci il json.\n\n<scheda>\n${scheda.corpo}\n</scheda>` },
  ];
  let costo = 0, token = 0, ultimoErrore = '', modello = MODELLO;
  for (let t = 1; t <= TENTATIVI; t++) {
    const { testo, usage, modello: m } = await chiamaModello(chiave, messaggi);
    modello = m ?? modello;
    costo += usage.cost ?? 0;
    token += usage.total_tokens ?? 0;
    let json;
    try {
      json = JSON.parse(testo);
    } catch {
      ultimoErrore = 'JSON non valido o vuoto';
      messaggi.push({ role: 'assistant', content: testo || '(vuoto)' }, { role: 'user', content: 'La risposta non era json valido. Restituisci solo il json conforme allo schema.' });
      continue;
    }
    const esito = ZodGuida.safeParse(json);
    if (esito.success) {
      const risultato = { guida: esito.data, tentativi: t, costo, token, modello };
      await fs.mkdir(DIR_CACHE, { recursive: true });
      await fs.writeFile(fileCache, JSON.stringify(risultato, null, 2));
      return risultato;
    }
    ultimoErrore = esito.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    messaggi.push({ role: 'assistant', content: testo }, { role: 'user', content: `Il json non rispetta i vincoli: ${ultimoErrore}. Correggi e restituisci solo il json completo.` });
  }
  throw new Error(`validazione fallita dopo ${TENTATIVI} tentativi: ${ultimoErrore}`);
}

// --- 6. Composizione dello YAML finale --------------------------------------

/**
 * Righe vuote attorno agli elenchi: in Markdown una riga di testo subito dopo
 * un elenco verrebbe agganciata all'ultima voce.
 */
function normalizzaMd(testo) {
  if (typeof testo !== 'string') return testo;
  const elenco = (r) => /^\s*([-*]|\d+[.)])\s+/.test(r);
  const righe = testo.replace(/\r\n/g, '\n').split('\n');
  const out = [];
  for (const r of righe) {
    const prec = out[out.length - 1];
    if (prec !== undefined && prec.trim() !== '' && r.trim() !== '' && elenco(prec) !== elenco(r) && !/^\s{2,}/.test(r)) out.push('');
    out.push(r);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
const CAMPI_MD = ['descrizione_generale', 'exam_details', 'program', 'material_tips', 'body'];
const conMdNormalizzato = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, CAMPI_MD.includes(k) ? normalizzaMd(v) : v]));

const pulisci = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)));

/**
 * Controlli deterministici sul tempo di studio (alimenta l'istogramma per
 * modulo). Modifica la guida e restituisce gli avvisi.
 */
function controllaTempo(guida, sorgente) {
  const avvisi = [];
  const moduli = guida.moduli;
  // Tempo complessivo copiato su tutti i moduli → torna nella descrizione.
  if (moduli.length > 1 && moduli.every((m) => m.study_time) && new Set(moduli.map((m) => m.study_time)).size === 1) {
    const t = moduli[0].study_time;
    for (const m of moduli) { m.study_time = null; m.giorni_min = null; m.giorni_max = null; }
    if (!(guida.descrizione_generale ?? '').includes(t)) {
      guida.descrizione_generale = `${guida.descrizione_generale ? `${guida.descrizione_generale}\n\n` : ''}Tempo di studio complessivo: ${t}.`;
    }
    avvisi.push(`tempo "${t}" identico su tutti i moduli: trattato come complessivo (spostato nella descrizione)`);
  }
  const haTempo = moduli.some((m) => m.study_time) || /tempo di studio/i.test(guida.descrizione_generale ?? '');
  if (/per quanto studiare|quanto tempo/i.test(sorgente) && !haTempo) avvisi.push('la scheda indica un tempo di studio ma non è stato estratto');
  return avvisi;
}

// Campi gestiti in Decap (Notion non li riporta): se la scheda non li indica,
// si conserva il valore già presente nella guida, così l'import non cancella
// link, CFU e dati della scheda inseriti dai rappresentanti.
const CAMPI_DECAP_GUIDA = ['sottotitolo', 'cfu_totali', 'link_sbobine_generale', 'link_whatsapp_generale'];
const CAMPI_DECAP_MODULO = ['cfu', 'semestre', 'preappello', 'frequenza', 'durata_orale_min', 'link_sbobine', 'link_whatsapp', 'google_sheet_url'];

function componiYaml(scheda, guida, esistente) {
  // Esame a modulo unico: il modulo si chiama come l'esame (convenzione del sito).
  if (guida.moduli.length === 1) guida.moduli[0].nome_modulo = guida.title;
  const idModuliEsistenti = new Map((esistente?.dati.moduli ?? []).map((m) => [chiaveTitolo(m.nome_modulo), m.id]));
  const moduliEsistenti = new Map((esistente?.dati.moduli ?? []).map((m) => [chiaveTitolo(m.nome_modulo), m]));
  const conserva = (nuovo, vecchio, campi) => {
    for (const k of campi) if ((nuovo[k] == null || nuovo[k] === '') && vecchio?.[k] != null && vecchio[k] !== '') nuovo[k] = vecchio[k];
    return nuovo;
  };
  const moduli = guida.moduli.map((m) => {
    const { nome_modulo, giorni_min, giorni_max, ...resto } = m;
    const vecchio = moduliEsistenti.get(chiaveTitolo(nome_modulo));
    conserva(resto, vecchio, CAMPI_DECAP_MODULO);
    // Email dei docenti inserite in Decap, abbinate per nome.
    const email = new Map((vecchio?.professors ?? []).filter((p) => p.email).map((p) => [chiaveTitolo(p.nome), p.email]));
    for (const p of resto.professors ?? []) if (!p.email && email.has(chiaveTitolo(p.nome))) p.email = email.get(chiaveTitolo(p.nome));
    return pulisci(conMdNormalizzato({
      nome_modulo,
      id: idModuliEsistenti.get(chiaveTitolo(nome_modulo)) ?? idCasuale('m'),
      ...resto,
      // Fascia dell'istogramma ("RAPPR."): calcolata dal codice, non dal modello.
      fascia_studio: giorni_min != null ? fasciaDaGiorni(giorni_min, giorni_max ?? giorni_min) : null,
      professors: resto.professors.map(pulisci),
    }));
  });
  conserva(guida, esistente?.dati, CAMPI_DECAP_GUIDA);
  const dati = pulisci({
    id: esistente?.dati.id ?? idCasuale('g'),
    title: guida.title,
    sottotitolo: guida.sottotitolo,
    anno_di_corso: scheda.anno,
    cfu_totali: guida.cfu_totali,
    link_sbobine_generale: guida.link_sbobine_generale,
    link_whatsapp_generale: guida.link_whatsapp_generale,
    descrizione_generale: moduli.length > 1 ? normalizzaMd(guida.descrizione_generale) : null,
    moduli,
    info_da_verificare: guida.info_da_verificare.map(pulisci),
    aggiornato_da: scheda.autore,
  });
  // ultimo_aggiornamento come data YAML semplice (z.date() nello schema Astro).
  const testo = YAML.stringify(dati, { lineWidth: 0, blockQuote: 'literal' });
  return `${testo}ultimo_aggiornamento: ${oggi()}\n`;
}

// --- Main -------------------------------------------------------------------

const tutte = await leggiIndice();
const pronte = tutte.filter((s) => s.stato === 'Fatto' && s.corpo.length >= MIN_CARATTERI && (!SOLO || s.nome === SOLO));
const scartate = tutte.filter((s) => !pronte.includes(s) && (!SOLO || s.nome === SOLO));
const esistenti = await leggiEsistenti();
// Guide già pubblicate (non solo id riservati): si modificano in Decap.
const giaNelSito = (s) => {
  const e = esistenti.get(chiaveTitolo(s.nome));
  return !!e && !e.riservato;
};
const daSaltare = AGGIORNA ? [] : pronte.filter(giaNelSito);
const daImportare = pronte.filter((s) => !daSaltare.includes(s));

if (ELENCO) {
  for (const s of daImportare) {
    const e = esistenti.get(chiaveTitolo(s.nome));
    const nota = e ? (e.riservato ? ` → crea ${e.file} con gli id riservati` : ` → RISCRIVE ${e.file} (--aggiorna)`) : '';
    console.log(`IMPORTA  ${s.anno.padEnd(8)} ${s.nome} (${s.corpo.length} car., ${s.autore ?? 'senza autore'})${nota}`);
  }
  for (const s of daSaltare) console.log(`già nel sito ${s.nome} (si modifica in Decap; --aggiorna per riscriverla)`);
  for (const s of scartate) console.log(`salta    ${(s.anno ?? '').padEnd(8)} ${s.nome} (${s.stato}, ${s.corpo.length} car.)`);
  process.exit(0);
}

const chiave = await chiaveApi();

log(`Schede: ${tutte.length} in tabella, ${daImportare.length} da importare, ${daSaltare.length} già nel sito, ${scartate.length} vuote o non pronte.`);
log(`Modello: ${MODELLO} · concorrenza ${CONCORRENZA}${DRY ? ' · DRY RUN' : ''}\n`);

const inizio = Date.now();
const esiti = await limitaConcorrenza(daImportare, CONCORRENZA, async (scheda) => {
  const t0 = Date.now();
  try {
    const r = await estrai(chiave, scheda);
    const esistente = esistenti.get(chiaveTitolo(scheda.nome));
    const avvisiTempo = controllaTempo(r.guida, scheda.corpo);
    const yaml = componiYaml(scheda, r.guida, esistente);
    const nomeFile = esistente?.file ?? `${slugify(scheda.nome)}.yaml`;
    const dest = DRY ? path.join(DIR_CACHE, 'dry', nomeFile) : path.join(DIR_GUIDE, nomeFile);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, yaml);
    const avvisi = [...avvisiTempo, ...sospetti(r.guida, scheda.corpo)];
    log(`✓ ${scheda.nome} → ${nomeFile}${esistente ? (esistente.riservato ? ' (id riservati)' : ' (riscritta, --aggiorna)') : ''} · ${r.guida.moduli.length} moduli · ${r.daCache ? 'cache' : `${r.tentativi} tent., ${((Date.now() - t0) / 1000).toFixed(1)}s`}${avvisi.length ? ` · ⚠ ${avvisi.length} avvisi` : ''}`);
    return { scheda: scheda.nome, file: nomeFile, ok: true, sostituisce: !!esistente, moduli: r.guida.moduli.map((m) => m.nome_modulo), daVerificare: r.guida.info_da_verificare.length, avvisi, costo: r.daCache ? 0 : r.costo, token: r.daCache ? 0 : r.token, modello: r.modello };
  } catch (e) {
    log(`✗ ${scheda.nome}: ${e.message}`);
    return { scheda: scheda.nome, ok: false, errore: e.message };
  }
});

const ok = esiti.filter((e) => e.ok);
const costo = ok.reduce((a, e) => a + (e.costo ?? 0), 0);
const token = ok.reduce((a, e) => a + (e.token ?? 0), 0);
log(`\nFatto in ${((Date.now() - inizio) / 1000).toFixed(1)}s: ${ok.length}/${esiti.length} riuscite · ${token} token · costo ${costo.toFixed(4)} $`);
console.log(JSON.stringify({ esiti, scartate: scartate.map((s) => ({ nome: s.nome, stato: s.stato, caratteri: s.corpo.length })) }, null, 2));
process.exitCode = esiti.every((e) => e.ok) ? 0 : 1;
