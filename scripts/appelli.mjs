#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// appelli.mjs — Appelli d'esame da ESSE3 (UNIPV) per le guide del sito
//
// Legge la "Bacheca Appelli" pubblica dell'Università di Pavia per il corso di
// MEDICINA E CHIRURGIA (CdS 04400, Golgi) e, per ogni guida in
// src/content/guide/, raccoglie gli appelli dei prossimi 12 mesi, assegnandoli
// ai moduli. Scrive src/data/appelli.json, letto dal sito in fase di build.
//
// Frequenza: UNA VOLTA ALLA SETTIMANA (GitHub Action .github/workflows/appelli.yml),
// come farebbe una persona a mano: poche decine di richieste, lente. Non va
// lanciato a ogni build: ESSE3 chiede di non essere visitato da programmi
// automatici (robots.txt), quindi lo usiamo il meno possibile.
//
// Uso:
//   node scripts/appelli.mjs                         # aggiorna src/data/appelli.json
//   node scripts/appelli.mjs --solo=Psichiatria --dry
//   node scripts/appelli.mjs --riusa                 # rielabora i dati già scaricati, senza rete
//   node scripts/appelli.mjs --elenco                # attività didattiche ESSE3 (codice e nome)
//   node scripts/appelli.mjs --senza-dettagli        # niente aula/edificio (meno richieste)
//   node scripts/appelli.mjs --aiuto
//
// Abbinamento guida ↔ esame ESSE3:
//   1. campo `esse3_codice` della guida (codice attività, es. "501694"), stabile;
//   2. altrimenti abbinamento automatico per nome; i casi dubbi sono segnalati.
// Abbinamento appello ↔ modulo: su ESSE3 gli appelli sono per esame e il nome
// dell'appello dice il modulo ("TOSSICOLOGIA A-L e M-Z"). Si confronta con
// `esse3_appello` del modulo o con il suo nome; ciò che non corrisponde a un
// modulo (es. "VERBALIZZAZIONE") resta "dell'intero esame".
//
// In caso di errore (rete, pagina ESSE3 cambiata) lo script esce con errore
// SENZA toccare src/data/appelli.json: il sito continua con i dati precedenti.
// Nessuna dipendenza esterna oltre a `yaml`.
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const RADICE = join(dirname(fileURLToPath(import.meta.url)), '..');
const CARTELLA_GUIDE = join(RADICE, 'src/content/guide');
const OUT_JSON = join(RADICE, 'src/data/appelli.json');

const BASE = 'https://studentionline.unipv.it/ListaAppelliOfferta.do';
const SITO = 'https://studentionline.unipv.it/';
const USER_AGENT = 'guide-universitarie/1.0 (guide dei rappresentanti degli studenti di Medicina UniPV; aggiornamento settimanale)';

// Medicina e Chirurgia — Università di Pavia (configurazione del form ESSE3).
const DIPARTIMENTO = { id: '10004', nome: 'DIPARTIMENTO DI MEDICINA INTERNA E TERAPIA MEDICA' };
const CDS = { id: '10045', codice: '04400', nome: 'MEDICINA E CHIRURGIA' };

// Controllo di sanità: sotto questa soglia la pagina ESSE3 è probabilmente cambiata.
const MIN_ATTIVITA = 20;

// ── Argomenti da riga di comando ─────────────────────────────────────────────

const opz = { da: null, a: null, solo: null, dettagli: true, elenco: false, pausa: 400, dry: false, json: false, riusa: false };

for (const arg of process.argv.slice(2)) {
  if (arg === '--dry') opz.dry = true;
  else if (arg === '--json') opz.json = true;
  else if (arg === '--elenco') opz.elenco = true;
  else if (arg === '--riusa') opz.riusa = true;
  else if (arg === '--senza-dettagli') opz.dettagli = false;
  else if (arg.startsWith('--solo=')) opz.solo = arg.slice(7);
  else if (arg.startsWith('--da=')) opz.da = arg.slice(5);
  else if (arg.startsWith('--a=')) opz.a = arg.slice(4);
  else if (arg.startsWith('--pausa=')) opz.pausa = Number(arg.slice(8)) || 0;
  else if (arg === '--aiuto' || arg === '-h') {
    console.log(`
Appelli d'esame (ESSE3 / UNIPV) per le guide del sito

  --solo=TITOLO     elabora solo le guide il cui titolo contiene TITOLO
  --elenco          stampa le attività didattiche ESSE3 (codice e nome) ed esce
  --riusa           niente rete: riassegna gli appelli già in src/data/appelli.json
  --da=GG/MM/AAAA   inizio finestra (default: oggi)
  --a=GG/MM/AAAA    fine finestra   (default: tra 12 mesi)
  --senza-dettagli  non scarica aula/edificio (meno richieste)
  --pausa=MS        attesa tra le richieste HTTP (default: 400)
  --dry             non scrive file, stampa solo il riepilogo
  --json            stampa il JSON su stdout
`);
    process.exit(0);
  }
}

// ── Utilità date ─────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');
const dmyData = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const isoDaDmy = (s) => {
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(s || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

function finestraDefault() {
  const oggi = new Date();
  const fra12 = new Date(oggi);
  fra12.setFullYear(oggi.getFullYear() + 1);
  return { da: dmyData(oggi), a: dmyData(fra12) };
}
const finestra = { ...finestraDefault(), ...(opz.da ? { da: opz.da } : {}), ...(opz.a ? { a: opz.a } : {}) };

// La tendina delle attività di ESSE3 dipende dalla finestra temporale: per il
// catalogo completo si usa sempre una finestra ampia.
const FINESTRA_CATALOGO = { da: '01/01/2015', a: '31/12/2035' };

// ── HTTP: sessione, richieste, pausa ─────────────────────────────────────────

let cookie = '';
const aspetta = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (s) => console.log(s);

async function richiesta(url, body) {
  if (opz.pausa) await aspetta(opz.pausa);
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: {
      cookie,
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml',
      ...(body ? { 'content-type': 'application/x-www-form-urlencoded', referer: BASE } : {}),
    },
    body: body ? new URLSearchParams(body).toString() : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [coppia] = c.split(';');
    const eq = coppia.indexOf('=');
    if (eq < 0) continue;
    const k = coppia.slice(0, eq);
    cookie = cookie.split('; ').filter((x) => x && !x.startsWith(k + '=')).concat(coppia).join('; ');
  }
  const testo = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} su ${url}`);
  return testo;
}

// ── HTML: piccoli parser ─────────────────────────────────────────────────────

const ENTITA = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodifica(s) {
  return (s || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITA[e.toLowerCase()] ?? m;
    const esa = e[1] === 'x' || e[1] === 'X';
    return String.fromCodePoint(parseInt(e.slice(esa ? 2 : 1), esa ? 16 : 10));
  });
}
function testo(html) {
  return decodifica((html || '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/​/g, '') // zero-width space usato da ESSE3
    .replace(/\s+/g, ' ')
    .trim();
}
function opzioni(html, id) {
  const m = new RegExp(`<select[^>]*id="${id}"[^>]*>([\\s\\S]*?)</select>`, 'i').exec(html);
  if (!m) return [];
  return [...m[1].matchAll(/<option value="([^"]*)"(?: title="([^"]*)")?[^>]*>([\s\S]*?)<\/option>/g)].map((o) => ({
    id: decodifica(o[1]),
    nome: testo(o[2] || o[3]),
  }));
}

// ── Abbinamento per nome ─────────────────────────────────────────────────────

const STOPWORD = new Set([
  'DI', 'DE', 'DEL', 'DELL', 'DELLA', 'DELLE', 'DELLO', 'DEGLI', 'DEI', 'E', 'ED',
  'IL', 'LO', 'LA', 'I', 'GLI', 'LE', 'UN', 'UNA', 'UNO', 'AL', 'ALLO', 'ALLA',
  'AI', 'AGLI', 'ALLE', 'DA', 'CON', 'PER', 'IN', 'SU', 'NEL', 'NELLA', 'NELLO',
  // Parti del nome dell'appello che non identificano il modulo.
  'A', 'L', 'M', 'Z', 'SCRITTO', 'ORALE',
]);

function token(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t && !STOPWORD.has(t));
}
function similarita(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  const jaccard = inter / (A.size + B.size - inter);
  const contenuto = inter / Math.min(A.size, B.size);
  return Math.max(jaccard, contenuto * 0.95);
}
/** Miglior candidato per un nome, se non è ambiguo (soglia 0.8). */
function migliore(nome, candidati, tokenDi) {
  const t = token(nome);
  if (!t.length) return null;
  const classifica = candidati.map((c) => ({ c, s: similarita(t, tokenDi(c)) })).sort((x, y) => y.s - x.s);
  const [best, second] = classifica;
  if (!best || best.s < 0.8) return null;
  if (second && Math.abs(second.s - best.s) < 1e-9) return null; // ex aequo → ambiguo
  return { c: best.c, punteggio: best.s };
}

/**
 * Modulo a cui appartiene un turno, o null = intero esame. Su ESSE3 le prove
 * dei moduli sono "Prova Parziale" e quelle dell'esame intero (verbalizzazioni,
 * esami a prova unica come Pediatria) "Prova Finale"; il nome dell'appello
 * dice poi di quale modulo si tratta.
 */
function moduloDellAppello(turno, moduli, nomeEsame) {
  if (moduli.length === 1) return moduli[0];
  const appello = turno.appello || '';
  const nomeAppello = appello.toUpperCase();
  const espliciti = moduli.filter((m) => m.esse3_appello && nomeAppello.includes(m.esse3_appello.toUpperCase()));
  if (espliciti.length === 1) return espliciti[0];
  if (/finale/i.test(turno.tipoProva || '')) return null;
  // Senza tipo di prova: un appello col nome dell'esame vale per l'esame intero.
  if (!turno.tipoProva && similarita(token(appello), token(nomeEsame)) >= 0.8) return null;
  const r = migliore(appello, moduli.filter((m) => !m.esse3_appello), (m) => token(m.nome));
  return r ? r.c : null;
}

// ── Lettura delle guide ──────────────────────────────────────────────────────

async function leggiGuide() {
  const file = (await readdir(CARTELLA_GUIDE)).filter((f) => /\.ya?ml$/.test(f));
  const guide = [];
  for (const f of file.sort()) {
    const dati = parseYaml(await readFile(join(CARTELLA_GUIDE, f), 'utf8'));
    if (!dati?.title || !dati.id) continue;
    guide.push({
      file: f,
      id: dati.id,
      title: dati.title,
      esse3_codice: dati.esse3_codice ? String(dati.esse3_codice) : null,
      moduli: (dati.moduli || [])
        .filter((m) => m.id)
        .map((m) => ({ id: m.id, nome: m.nome_modulo || '', esse3_appello: m.esse3_appello || null })),
    });
  }
  return guide;
}

// ── ESSE3 ────────────────────────────────────────────────────────────────────

/** Apre la sessione e carica l'elenco delle attività didattiche del CdS. */
async function caricaAttivita() {
  await richiesta(BASE); // GET iniziale → cookie di sessione
  const html = await richiesta(BASE, {
    data_da: FINESTRA_CATALOGO.da,
    data_a: FINESTRA_CATALOGO.a,
    fac_id: DIPARTIMENTO.id,
    cds_id: CDS.id,
    ad_id: '',
    docente_id: '',
    TIPO_FORM: '1',
    form_id_formRicercaCds: 'formRicercaCds',
    '_fw_refresh-form.x': 'selectionCds',
  });
  const attivita = opzioni(html, 'selectionAd')
    .filter((o) => o.id)
    .map((o) => {
      const cod = /\[([^\]]*)\]/.exec(o.nome);
      const nome = o.nome.replace(/^\s*\[[^\]]*\]\s*/, '');
      return { id: o.id, codice: cod ? cod[1] : null, nome, token: token(nome) };
    });
  if (attivita.length < MIN_ATTIVITA) {
    throw new Error(`solo ${attivita.length} attività didattiche lette: la pagina ESSE3 è cambiata? Dati non aggiornati.`);
  }
  return attivita;
}

/** Turni d'appello di una attività nella finestra scelta. */
async function cercaTurni(attivita) {
  const html = await richiesta(BASE, {
    data_da: finestra.da,
    data_a: finestra.a,
    fac_id: DIPARTIMENTO.id,
    cds_id: CDS.id,
    ad_id: attivita.id,
    docente_id: '',
    TIPO_FORM: '1',
    form_id_formRicercaCds: 'formRicercaCds',
    btnSubmit: 'Avvia Ricerca',
  });
  if (!/formRicercaCds/.test(html)) throw new Error(`risposta inattesa da ESSE3 per ${attivita.nome}: pagina cambiata?`);
  const tbody = /<tbody class="table-1-body">([\s\S]*?)<\/tbody>/.exec(html);
  if (!tbody) return []; // nessun appello nella finestra
  const turni = [];
  for (const riga of tbody[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const celle = [...riga[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
    if (celle.length < 8) throw new Error(`tabella degli appelli con ${celle.length} colonne (attese 8): pagina ESSE3 cambiata?`);
    const dateIscrizione = testo(celle[2]).match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    const link = [...celle[3].matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)];
    const voci = link.length ? link.map((l) => ({ href: decodifica(l[1]), etichetta: testo(l[2]) })) : [{ href: null, etichetta: testo(celle[3]) }];

    for (const v of voci) {
      let url = null;
      if (v.href) {
        url = v.href.replace(/;jsessionid=[^?]*/i, '').replace(/&amp;/g, '&');
        if (!/^https?:/i.test(url)) url = SITO + url.replace(/^\//, '');
      }
      // Pubblicati solo i dati utili allo studente: niente commissione né iscritti.
      turni.push({
        appello: testo(celle[1]),
        giorno: isoDaDmy(v.etichetta),
        ora: (/(\d{2}:\d{2})/.exec(v.etichetta) || [])[1] || null,
        iscrizioniDa: isoDaDmy(dateIscrizione[0]),
        iscrizioniA: isoDaDmy(dateIscrizione[1]),
        tipo: testo(celle[4]) || null,
        tipoProva: testo(celle[5]) || null,
        url,
      });
    }
  }
  return turni;
}

/** Dettaglio del turno: edificio e aula. */
async function dettaglioTurno(url) {
  const html = await richiesta(url);
  const dl = /<dl class="record-riga">([\s\S]*?)<\/dl>/.exec(html);
  const campi = {};
  if (dl) for (const m of dl[1].matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/g)) campi[testo(m[1])] = testo(m[2]);
  return { edificio: campi['Edificio'] || null, aula: campi['Aula'] || null };
}

// ── Programma principale ─────────────────────────────────────────────────────

/** Turni già scaricati (per --riusa): per codice attività. */
async function turniSalvati() {
  if (!existsSync(OUT_JSON)) throw new Error('--riusa: src/data/appelli.json non esiste');
  const vecchi = JSON.parse(await readFile(OUT_JSON, 'utf8'));
  const perCodice = new Map();
  for (const g of Object.values(vecchi.guide ?? {})) {
    const cod = g.esame?.codice ?? g.attivita?.[0]?.codice;
    if (!cod) continue;
    // Formato attuale (moduli/generale) o quello della prima versione (appelli).
    const tutti = g.appelli ?? [...Object.values(g.moduli ?? {}).flat(), ...(g.generale ?? [])];
    perCodice.set(cod, { esame: g.esame ?? { id: g.attivita[0].id, codice: cod, nome: g.attivita[0].nome }, turni: tutti });
  }
  return perCodice;
}

async function main() {
  const guide = (await leggiGuide()).filter((g) => !opz.solo || g.title.toLowerCase().includes(opz.solo.toLowerCase()));
  log(`Guide: ${guide.length} · finestra ${finestra.da} → ${finestra.a}${opz.riusa ? ' · --riusa (senza rete)' : ''}`);

  const salvati = opz.riusa ? await turniSalvati() : null;
  const attivita = opz.riusa
    ? [...salvati.values()].map((x) => ({ ...x.esame, token: token(x.esame.nome.replace(/^\s*\[[^\]]*\]\s*/, '')) }))
    : await caricaAttivita();
  if (!opz.riusa) log(`Attività didattiche ESSE3 (${CDS.nome}): ${attivita.length}`);

  if (opz.elenco) {
    for (const a of [...attivita].sort((x, y) => x.nome.localeCompare(y.nome, 'it'))) console.log(`[${a.codice}]\t${a.nome}`);
    return;
  }

  const risultato = {};
  const avvisi = [];

  for (const g of guide) {
    // 1. Esame ESSE3 della guida.
    let esame = null;
    if (g.esse3_codice) {
      esame = attivita.find((a) => a.codice === g.esse3_codice) ?? null;
      if (!esame) avvisi.push(`${g.title}: esse3_codice ${g.esse3_codice} non trovato su ESSE3`);
    } else {
      const r = migliore(g.title, attivita, (a) => a.token);
      if (r) esame = r.c;
      else avvisi.push(`${g.title}: nessun esame ESSE3 abbinato con sicurezza (imposta "Codice esame ESSE3" in Decap)`);
    }
    if (!esame) continue;

    // 2. Turni dell'esame.
    let turni;
    if (opz.riusa) {
      turni = (salvati.get(esame.codice)?.turni ?? []).map(({ appello, giorno, ora, iscrizioniDa, iscrizioniA, tipo, tipoProva, url, aula, edificio }) => ({
        appello, giorno, ora, iscrizioniDa, iscrizioniA, tipo, tipoProva, url, aula: aula ?? null, edificio: edificio ?? null,
      }));
    } else {
      turni = await cercaTurni(esame);
      if (opz.dettagli) {
        for (const t of turni) {
          if (!t.url) continue;
          try {
            Object.assign(t, await dettaglioTurno(t.url));
          } catch {
            /* aula non disponibile: il turno resta valido */
          }
        }
      }
    }
    turni.sort((x, y) => `${x.giorno}${x.ora}`.localeCompare(`${y.giorno}${y.ora}`));

    // 3. Assegnazione ai moduli dal nome dell'appello.
    const moduli = Object.fromEntries(g.moduli.map((m) => [m.id, []]));
    const generale = [];
    for (const t of turni) {
      const m = moduloDellAppello(t, g.moduli, esame.nome);
      (m ? moduli[m.id] : generale).push(t);
    }
    // Normali "dell'intero esame": verbalizzazioni e appelli col nome dell'esame.
    const nomiNonAssegnati = [...new Set(generale.map((t) => t.appello))].filter(
      (n) => !/VERBALIZZ/i.test(n) && similarita(token(n), token(esame.nome)) < 0.8,
    );
    if (g.moduli.length > 1 && nomiNonAssegnati.length) {
      avvisi.push(`${g.title}: appelli non attribuiti a un modulo: ${nomiNonAssegnati.join(', ')} (se servono, imposta "Nome dell'appello su ESSE3" nel modulo)`);
    }

    risultato[g.id] = { titolo: g.title, esame: { id: esame.id, codice: esame.codice, nome: esame.nome }, moduli, generale };
    log(`  ${g.title} ← [${esame.codice}] ${esame.nome}: ${turni.length} appelli`);
  }

  const dati = {
    generato_il: new Date().toISOString(),
    fonte: { bacheca: BASE, corso_di_studio: CDS },
    intervallo: { da: isoDaDmy(finestra.da), a: isoDaDmy(finestra.a) },
    guide: risultato,
  };

  if (opz.json) console.log(JSON.stringify(dati, null, 2));
  if (opz.dry) log('\n(--dry: nessun file scritto)');
  else {
    await mkdir(dirname(OUT_JSON), { recursive: true });
    await writeFile(OUT_JSON, JSON.stringify(dati, null, 2) + '\n');
    log(`\nScritto ${OUT_JSON}`);
  }
  if (avvisi.length) {
    log('\nDa controllare:');
    for (const a of avvisi) log(`  · ${a}`);
  }
}

main().catch((e) => {
  console.error(`Errore: ${e.message || e}\nsrc/data/appelli.json NON è stato modificato: il sito usa i dati precedenti.`);
  process.exit(1);
});
