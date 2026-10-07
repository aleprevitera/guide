#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// syllabus.mjs — Syllabus degli insegnamenti dal Catalogo Corsi Cineca (UNIPV)
//
// Dato l'indirizzo di un corso nel catalogo — es.
//   https://unipv.coursecatalogue.cineca.it/corsi/2026/10888
// scarica, per ogni attività didattica del corso, il syllabus ufficiale:
// obiettivi formativi, prerequisiti, contenuti/programma, testi di riferimento,
// modalità di verifica, metodi didattici, docenti, SSD, CFU, periodo.
//
// Il catalogo è un'app Angular: i dati arrivano dall'API JSON /api/v1.
//   1. /api/v1/corso/{anno}/{corso}                   → anagrafica del corso
//   2. /api/v1/corso-offerta/{anno}?codicione=...      → piano di studi (attività)
//   3. /api/v1/insegnamento?anno=&insegnamento=&...    → dettaglio con il syllabus
//
// Produce:
//   • src/data/syllabus.json   → dati strutturati (testo già ripulito dall'HTML)
//   • syllabus.md              → versione leggibile, un esame per sezione
//
// Uso:
//   node scripts/syllabus.mjs
//   node scripts/syllabus.mjs --url=https://unipv.coursecatalogue.cineca.it/corsi/2026/10888
//   node scripts/syllabus.mjs --solo=Psichiatria
//   node scripts/syllabus.mjs --anno-corso=5
//   node scripts/syllabus.mjs --limite=3 --dry
//   node scripts/syllabus.mjs --aiuto
//
// Solo API pubbliche, nessuna dipendenza esterna.
// ─────────────────────────────────────────────────────────────────────────────

import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITO = 'https://unipv.coursecatalogue.cineca.it';
const API = `${SITO}/api/v1`;
const OUT_JSON_DEFAULT = join(RADICE, 'src/data/syllabus.json');
const OUT_MD_DEFAULT = join(RADICE, 'syllabus.md');

// ── Argomenti ────────────────────────────────────────────────────────────────

const opz = {
  url: 'https://unipv.coursecatalogue.cineca.it/corsi/2026/10888',
  anno: null,
  corso: null,
  solo: null,
  annoCorso: null,
  limite: 0,
  out: OUT_JSON_DEFAULT,
  outMd: OUT_MD_DEFAULT,
  md: true,
  pausa: 100,
  dry: false,
  json: false,
  aiuto: false,
};

for (const arg of process.argv.slice(2)) {
  if (arg === '--dry') opz.dry = true;
  else if (arg === '--json') opz.json = true;
  else if (arg === '--senza-md') opz.md = false;
  else if (arg.startsWith('--url=')) opz.url = arg.slice(6);
  else if (arg.startsWith('--anno=')) opz.anno = arg.slice(7);
  else if (arg.startsWith('--corso=')) opz.corso = arg.slice(8);
  else if (arg.startsWith('--solo=')) opz.solo = arg.slice(7);
  else if (arg.startsWith('--anno-corso=')) opz.annoCorso = Number(arg.slice(13)) || null;
  else if (arg.startsWith('--limite=')) opz.limite = Number(arg.slice(9)) || 0;
  else if (arg.startsWith('--out=')) opz.out = join(RADICE, arg.slice(6));
  else if (arg.startsWith('--out-md=')) opz.outMd = join(RADICE, arg.slice(9));
  else if (arg.startsWith('--pausa=')) opz.pausa = Number(arg.slice(8)) || 0;
  else if (arg === '--aiuto' || arg === '-h') opz.aiuto = true;
}

if (opz.aiuto) {
  console.log(`
Syllabus degli insegnamenti dal Catalogo Corsi Cineca (UNIPV)

  --url=URL         indirizzo del corso nel catalogo (default: /corsi/2026/10888)
  --anno=AAAA       anno di offerta (sovrascrive quello dell'URL)
  --corso=CODICE    codice corso / cdsId (sovrascrive quello dell'URL)
  --solo=TESTO      solo gli insegnamenti il cui nome contiene TESTO
  --anno-corso=N    solo gli insegnamenti dell'anno di corso N (1..6)
  --limite=N        scarica al massimo N insegnamenti (per prove)
  --out=FILE        JSON di uscita (default: src/data/syllabus.json)
  --out-md=FILE     Markdown di uscita (default: syllabus.md)
  --senza-md        non genera il Markdown
  --pausa=MS        attesa tra le richieste HTTP (default: 100)
  --dry             non scrive file, stampa solo il riepilogo
  --json            stampa il JSON su stdout
  --aiuto           questo messaggio
`);
  process.exit(0);
}

// Se l'URL contiene anno e corso, li estrae (a meno che non siano passati a parte).
{
  const m = /\/corsi\/(\d+)\/(\d+)/.exec(opz.url);
  if (m) {
    opz.anno = opz.anno || m[1];
    opz.corso = opz.corso || m[2];
  }
}
if (!opz.anno || !opz.corso) {
  console.error('Specifica --anno e --corso (oppure un --url /corsi/ANNO/CORSO).');
  process.exit(1);
}

// ── HTTP + utilità ───────────────────────────────────────────────────────────

const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);

async function api(percorso, params) {
  if (opz.pausa) await aspetta(opz.pausa);
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const url = `${API}/${percorso}${qs}`;
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${url}`);
  const testo = await res.text();
  try {
    return JSON.parse(testo);
  } catch {
    throw new Error(`Risposta non JSON da ${url}`);
  }
}
/** L'API a volte restituisce un array, a volte un oggetto con chiavi numeriche. */
const primo = (d) => (Array.isArray(d) ? d[0] : d && d['0'] ? Object.values(d)[0] : d);

const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodifica(s) {
  return (s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const hex = e[1] === 'x' || e[1] === 'X';
      return String.fromCodePoint(parseInt(hex ? e.slice(2) : e.slice(1), hex ? 16 : 10));
    }
    return ENTITA[e.toLowerCase()] ?? m;
  });
}
/** Da HTML (con span, style, br, liste) a testo leggibile. */
function pulisci(html) {
  if (html == null) return '';
  if (typeof html !== 'string') return String(html);
  const s = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|li|tr|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '');
  return decodifica(s)
    .replace(/\u200b/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function unici(stringhe) {
  const visti = new Set();
  const out = [];
  for (const s of stringhe) {
    const t = (s || '').trim();
    if (t && !visti.has(t)) {
      visti.add(t);
      out.push(t);
    }
  }
  return out;
}

// ── Estrazione ───────────────────────────────────────────────────────────────

/** Per ogni insegnamento (cod) sceglie l'occorrenza più recente non successiva all'anno di offerta. */
function scegliOccorrenze(attivita, annoOfferta) {
  const gruppi = new Map();
  for (const a of attivita) {
    if (!a || !a.cod) continue;
    if (!gruppi.has(a.cod)) gruppi.set(a.cod, []);
    gruppi.get(a.cod).push(a);
  }
  const scelte = [];
  for (const arr of gruppi.values()) {
    const passati = arr.filter((a) => Number(a.aa) <= annoOfferta);
    const pool = passati.length ? passati : arr;
    pool.sort((x, y) => Number(y.aa) - Number(x.aa));
    scelte.push(pool[0]);
  }
  return scelte;
}

function estraiEsame(o) {
  const docenti = unici([
    ...(o.titolari || []).map((d) => d.des),
    ...(o.responsabili || []).map((d) => d.des),
    ...(o.docenti || []).map((d) => d.des),
  ]);
  const moduli = unici((o.moduli || []).map((m) => m.des_it));

  const voci = (o.testiTotali || []).map((t) => ({
    chiave: unici([t.chiave_udCod, t.chiave_domPartCod, t.chiave_fatPartCod]).join(' / ') || null,
    obiettivi: pulisci(t.obiettivi_formativi_it || t.mod_obiettivi_formativi_it),
    prerequisiti: pulisci(t.prerequisiti_it || t.mod_prerequisiti_it),
    contenuti: pulisci(t.contenuti_it || t.mod_contenuti_it),
    testi: pulisci(t.testi_it || t.mod_testi_it),
    verifica: pulisci(t.verifica_apprendimento_it),
    metodi: pulisci(t.metodi_didattici_est_it),
    altro: pulisci(t.altro_it),
    altriTesti: (t.altri_testi_ugov || []).map((a) => pulisci(a.ugov_altri_testi_it)).filter(Boolean),
  }));

  const campo = (chiave) => unici(voci.map((v) => v[chiave])).join('\n\n');
  const testiExtra = unici(voci.flatMap((v) => v.altriTesti)).join('\n\n');
  const sintesi = {
    obiettivi: campo('obiettivi'),
    prerequisiti: campo('prerequisiti'),
    contenuti: campo('contenuti'),
    testi: [campo('testi'), testiExtra].filter(Boolean).join('\n\n'),
    verifica: campo('verifica'),
    metodi: campo('metodi'),
  };

  return {
    codice: o.cod || null,
    codiceAttivita: o.adCod || null,
    nome: o.des_it || null,
    nome_en: o.des_en || null,
    annoErogazione: o.aa || null,
    annoCorso: o.corso_anno ?? null,
    crediti: o.crediti ?? null,
    ssd: o.ssd || null,
    tipo: o.tipo_it || null,
    ambito: o.ambito_it || null,
    metodiDidattici: o.metodi_didattici_it || null,
    valutazione: o.valutazione_it || null,
    frequenza: o.frequenza_it || null,
    oreMinimeFrequenza: o.oreMinimeFrequenza ?? null,
    lingua: o.lingua_des_it || null,
    periodo: o.periodo_didattico_it || null,
    sede: o.sedeDenominazioneComune || o.sede_des_it || null,
    docenti,
    moduli,
    url: o.url ? SITO + o.url : `${SITO}/corsi/${opz.anno}/${opz.corso}`,
    syllabus: voci,
    sintesi,
  };
}

// ── Markdown ─────────────────────────────────────────────────────────────────

function titoloAnno(n) {
  return ['', 'I', 'II', 'III', 'IV', 'V', 'VI'][n] ? `${['', 'I', 'II', 'III', 'IV', 'V', 'VI'][n]} anno` : null;
}

function renderMarkdown(dati) {
  const righe = [];
  righe.push(`# Syllabus degli insegnamenti`);
  righe.push('');
  righe.push(`**${dati.corso.nome}** — ${dati.corso.cdsCod ? `corso di studio ${dati.corso.cdsCod}, ` : ''}anno di offerta ${dati.corso.anno}`);
  righe.push('');
  righe.push(`Fonte: [${dati.fonte.catalogo}](${dati.fonte.catalogo}) · generato il ${new Date(dati.generato_il).toLocaleString('it-IT')} · ${dati.esami.length} insegnamenti.`);
  righe.push('');
  righe.push('---');
  righe.push('');

  for (const e of dati.esami) {
    const meta = unici([e.ssd, e.crediti != null ? `${e.crediti} CFU` : null, titoloAnno(e.annoCorso), e.periodo, e.tipo]).join(' · ');
    righe.push(`## ${e.nome}`);
    righe.push('');
    if (meta) righe.push(`*${meta}*  `);
    if (e.docenti.length) righe.push(`**Docenti:** ${e.docenti.join('; ')}  `);
    if (e.moduli.length) righe.push(`**Moduli:** ${e.moduli.join('; ')}  `);
    if (e.frequenza) righe.push(`**Frequenza:** ${e.frequenza}${e.oreMinimeFrequenza ? ` (minimo ${e.oreMinimeFrequenza} ore)` : ''}  `);
    if (e.valutazione) righe.push(`**Valutazione:** ${e.valutazione}  `);
    righe.push(`[Scheda ufficiale](${e.url})`);
    righe.push('');
    const sezioni = [
      ['Obiettivi formativi', e.sintesi.obiettivi],
      ['Prerequisiti', e.sintesi.prerequisiti],
      ['Contenuti / programma', e.sintesi.contenuti],
      ['Testi di riferimento', e.sintesi.testi],
      ['Metodi didattici', e.sintesi.metodi],
      ['Verifica dell’apprendimento', e.sintesi.verifica],
    ];
    for (const [titolo, testo] of sezioni) {
      if (!testo) continue;
      righe.push(`### ${titolo}`);
      righe.push('');
      righe.push(testo);
      righe.push('');
    }
    righe.push('---');
    righe.push('');
  }
  return righe.join('\n');
}

// ── Programma principale ─────────────────────────────────────────────────────

async function main() {
  const anno = opz.anno;
  const corso = opz.corso;
  log(`Catalogo: /corsi/${anno}/${corso}`);

  const corsoDati = primo(await api(`corso/${anno}/${corso}`));
  if (!corsoDati || !corsoDati.des_it) throw new Error('Corso non trovato');
  log(`Corso: ${corsoDati.des_it} (${corsoDati.cdsCod || corsoDati.cod}) · ${corsoDati.classe_it || ''}`);

  const offerta = await api(`corso-offerta/${anno}`, { codicione: corsoDati.codicione });
  const attivita = [];
  for (const coorte of Object.keys(offerta)) {
    for (const periodo of Object.values(offerta[coorte])) {
      for (const a of periodo.attivita || []) attivita.push(a);
    }
  }
  log(`Attività didattiche nel piano di studi: ${attivita.length}`);

  let scelte = scegliOccorrenze(attivita, Number(anno));
  log(`Insegnamenti unici (occorrenza più recente): ${scelte.length}`);

  if (opz.solo) {
    const t = opz.solo.toLowerCase();
    scelte = scelte.filter((a) => (a.des_it || '').toLowerCase().includes(t));
  }
  if (opz.annoCorso) scelte = scelte.filter((a) => Number(a.annoCorso) === opz.annoCorso);
  if (opz.limite) scelte = scelte.slice(0, opz.limite);
  log(`Da scaricare: ${scelte.length}`);

  const esami = [];
  let n = 0;
  for (const a of scelte) {
    n++;
    try {
      const det = primo(
        await api('insegnamento', {
          anno: a.aa,
          insegnamento: a.cod,
          ordinamento_aa: a.ordinamento_aa,
          af_percorso: a.corso_percorso_id,
          corso_cod: a.corso_cod,
        })
      );
      if (!det || !det.des_it) {
        log(`  [${n}/${scelte.length}] ${a.des_it} → nessun dettaglio`);
        continue;
      }
      const esame = estraiEsame(det);
      esami.push(esame);
      const riempito = unici([esame.sintesi.contenuti, esame.sintesi.obiettivi, esame.sintesi.testi]).length;
      log(`  [${n}/${scelte.length}] ${esame.nome} (${esame.codice}, aa ${esame.annoErogazione}) → ${riempito ? 'syllabus ok' : 'syllabus vuoto'}`);
    } catch (e) {
      log(`  [${n}/${scelte.length}] ${a.des_it} → ERRORE: ${e.message || e}`);
    }
  }

  esami.sort((x, y) => (x.annoCorso || 0) - (y.annoCorso || 0) || (x.nome || '').localeCompare(y.nome || '', 'it'));

  const dati = {
    generato_il: new Date().toISOString(),
    fonte: { catalogo: `${SITO}/corsi/${anno}/${corso}`, api: `${API}/insegnamento` },
    corso: {
      anno,
      cod: corsoDati.cod || corso,
      cdsId: corsoDati.cdsId || corso,
      cdsCod: corsoDati.cdsCod || null,
      codicione: corsoDati.codicione || null,
      nome: corsoDati.des_it,
      nome_en: corsoDati.des_en || null,
      classe: corsoDati.classe_it || null,
      dipartimento: corsoDati.dip_des_it || null,
      ordinamento_aa: corsoDati.ordinamento_aa ?? null,
    },
    esami,
  };

  if (opz.json) console.log(JSON.stringify(dati, null, 2));

  if (opz.dry) {
    log('\n(--dry: nessun file scritto)');
  } else {
    await mkdir(dirname(opz.out), { recursive: true });
    await writeFile(opz.out, JSON.stringify(dati, null, 2) + '\n');
    log(`\nScritto ${opz.out}`);
    if (opz.md) {
      await writeFile(opz.outMd, renderMarkdown(dati));
      log(`Scritto ${opz.outMd}`);
    }
  }

  const conSyllabus = esami.filter((e) => e.sintesi.contenuti || e.sintesi.obiettivi).length;
  log(`\nRiepilogo: ${esami.length} insegnamenti, ${conSyllabus} con contenuti/obiettivi compilati.`);
}

main().catch((e) => {
  console.error('Errore:', e.message || e);
  process.exit(1);
});
