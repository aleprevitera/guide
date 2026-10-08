#!/usr/bin/env node
// docenti.mjs — Docenti ed email istituzionali dal catalogo dei corsi UniPV
//
// Per ogni guida con codice ESSE3, legge dal catalogo Cineca (API pubbliche,
// le stesse di scripts/syllabus.mjs) i docenti dell'insegnamento e, per
// ciascuno, la scheda docente: nome, email istituzionale, moduli insegnati.
//
//   1. scarica  → src/data/docenti.json  (fonte versionata, rilanci senza rete con --riusa)
//   2. inserisce nelle guide:
//      - docente già presente (stesso cognome): completa nome ed email, la nota
//        "Stile/Domande" scritta dai rappresentanti resta com'è;
//      - docente mancante: aggiunto al modulo che insegna (dal nome del modulo
//        nel catalogo), o all'unico modulo se l'esame non è diviso.
//      Email diverse da quelle già scritte: si tiene quella del catalogo e lo si segnala.
//      Cognome condiviso da più docenti dell'esame: si mettono tutti.
//
// Uso:
//   node scripts/docenti.mjs            # scarica e aggiorna le guide
//   node scripts/docenti.mjs --dry      # mostra cosa cambierebbe, senza scrivere guide
//   node scripts/docenti.mjs --riusa    # niente rete: usa src/data/docenti.json

import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';

const RADICE = join(import.meta.dirname, '..');
const DIR_GUIDE = join(RADICE, 'src/content/guide');
const SYLLABUS = join(RADICE, 'src/data/syllabus.json');
const USCITA = join(RADICE, 'src/data/docenti.json');
const API = 'https://unipv.coursecatalogue.cineca.it/api/v1';

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const RIUSA = args.includes('--riusa');
const oggi = new Date().toISOString().slice(0, 10);
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Testo -------------------------------------------------------------------

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const STOP = new Set(['di', 'del', 'della', 'delle', 'degli', 'dei', 'dell', 'e', 'ed', 'per', 'la', 'il', 'le', 'i', 'in', 'a', 'apparato']);
const parole = (s) => new Set((s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t)));
function somiglianza(a, b) {
  const A = parole(a), B = parole(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const t of A) if (B.has(t)) n++;
  return n / Math.min(A.size, B.size);
}
const maiuscola = (w) => w.toLowerCase().replace(/(^|[\s'’-])([a-zà-ü])/g, (m, p, c) => p + c.toUpperCase());

/**
 * "STIVALA LUCIA ANNA" + "luciaanna.stivala@unipv.it" → { nome: "Lucia Anna", cognome: "Stivala" }.
 * Il catalogo scrive COGNOME NOME senza separatore: l'email (nome.cognome)
 * dice dove finisce il cognome; senza riscontro, cognome = prima parola.
 */
function dividiNome(des, email) {
  const t = des.trim().split(/\s+/);
  const locale = (email || '').split('@')[0].toLowerCase();
  const [primaParte, secondaParte] = locale.split('.');
  for (let k = 1; k < t.length; k++) {
    const cognome = t.slice(0, k).join(' '), nome = t.slice(k).join(' ');
    // nome.cognome con il nome intero o solo il primo nome (christian.dibuduo).
    const nomeOk = norm(primaParte) === norm(nome) || norm(primaParte) === norm(t[k]);
    if (locale && nomeOk && norm(secondaParte) === norm(cognome)) return { nome: maiuscola(nome), cognome: maiuscola(cognome) };
  }
  // Senza riscontro: le particelle (DI, DE, DEL, LA...) fanno parte del cognome.
  const PARTICELLE = new Set(['DI', 'DE', 'DEL', 'DELLA', 'DEGLI', 'DAL', 'DALLA', 'DA', 'LA', 'LO', 'LI', 'VAN', 'VON']);
  let k = 1;
  while (k < t.length - 1 && PARTICELLE.has(t[k - 1].toUpperCase())) k++;
  return { nome: maiuscola(t.slice(k).join(' ')), cognome: maiuscola(t.slice(0, k).join(' ')) };
}

// --- 1. Catalogo -------------------------------------------------------------

async function api(percorso, params) {
  const url = new URL(`${API}/${percorso}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  for (let i = 0; ; i++) {
    const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'howtogolgi/1.0 (guide degli studenti di Medicina UniPV)' }, signal: AbortSignal.timeout(30_000) });
    if (r.ok) return r.json();
    if (i >= 2) throw new Error(`${r.status} su ${url}`);
    await pausa(1500);
  }
}
const primo = (x) => (Array.isArray(x) ? x[0] : x);

async function scarica(guide) {
  const catalogo = JSON.parse(await readFile(SYLLABUS, 'utf8')).esami;
  const esami = {};
  const schede = new Map();
  for (const g of guide) {
    const voce = catalogo.find((e) => String(e.codiceAttivita) === String(g.esse3_codice));
    if (!voce?.url) {
      console.log(`  ✗ ${g.title}: insegnamento non trovato nel catalogo`);
      continue;
    }
    // .../corsi/{aaCorso}/{corso}/insegnamenti/{anno}/{insegnamento}/{ordinamento}/{percorso}
    const m = voce.url.match(/\/corsi\/\d+\/(\d+)\/insegnamenti\/(\d+)\/(\d+)\/(\d+)\/(\d+)/);
    const det = primo(await api('insegnamento', { anno: m[2], insegnamento: m[3], ordinamento_aa: m[4], af_percorso: m[5], corso_cod: m[1] }));
    await pausa(300);
    const persone = new Map();
    for (const d of [...(det?.titolari ?? []), ...(det?.responsabili ?? []), ...(det?.docenti ?? [])]) {
      const p = persone.get(d.id) ?? { id: d.id, des: d.des, titolare: false };
      p.titolare ||= d.titolareFlg === 1;
      persone.set(d.id, p);
    }
    esami[g.esse3_codice] = { nome: voce.nome, docenti: [] };
    for (const p of persone.values()) {
      if (!schede.has(p.id)) {
        schede.set(p.id, await api(`docente/${p.id}`).catch(() => null));
        await pausa(300);
      }
      const s = schede.get(p.id);
      const email = (s?.email || s?.emailAteneo || '').toLowerCase() || null;
      // Moduli di QUESTO esame insegnati dal docente (nomi del catalogo).
      const moduli = [...new Set((s?.insegnamenti ?? []).filter((i) => String(i.adCod) === String(g.esse3_codice)).map((i) => i.des_it).filter(Boolean))];
      esami[g.esse3_codice].docenti.push({ ...dividiNome(p.des, email), email, titolare: p.titolare, moduli });
    }
    console.log(`  ✓ ${g.title}: ${esami[g.esse3_codice].docenti.length} docenti`);
  }
  return { generato_il: new Date().toISOString(), fonte: 'https://unipv.coursecatalogue.cineca.it (API insegnamento e docente)', esami };
}

// --- 2. Guide ----------------------------------------------------------------

/** Il docente del catalogo è questo professore della guida? (per cognome) */
// "Prof.ssa Crema", "Dott. Stefanelli" → "Crema", "Stefanelli".
const senzaTitolo = (nome) => nome.replace(/^\s*(prof\.?(ssa)?|dott\.?(ssa)?|dr\.?)\s+/i, '').trim();

function stessaPersona(prof, d) {
  const nome = senzaTitolo(prof.nome);
  if (prof.email && d.email && prof.email.toLowerCase() === d.email) return true;
  // Confronto a parole intere ("Santacroce" non è "Croce").
  const parole = nome.split(/\s+/).map(norm).filter(Boolean);
  const cognome = d.cognome.split(/\s+/).map(norm).filter(Boolean);
  const pos = parole.findIndex((_, k) => cognome.every((c, h) => parole[k + h] === c));
  if (pos < 0) return false;
  const altre = parole.filter((_, k) => k < pos || k >= pos + cognome.length);
  // Solo il cognome, oppure cognome + un nome che corrisponde a quello del catalogo.
  return altre.length === 0 || altre.some((a) => d.nome.split(/\s+/).map(norm).includes(a));
}

// Esami in cui il catalogo elenca moltissimi docenti (turni, reparti): si
// completano quelli già nella guida e si aggiunge solo il titolare.
const SOLO_NOMINATI = new Set(['501771']); // Semeiotica medica e chirurgica

// Nomi dei moduli nel catalogo che non somigliano a quelli delle guide.
const ALIAS = {
  RADIOLOGIA: 'Diagnostica per immagini',
  RADIOTERAPIA: 'Diagnostica per immagini',
  NEURORADIOLOGIA: 'Diagnostica per immagini',
  'MALATTIE METABOLICHE': 'Malattie del metabolismo',
};

function moduliDelDocente(d, moduli, titoloEsame) {
  if (moduli.length === 1) return [moduli[0]];
  const scelti = new Set();
  for (const grezzo of d.moduli) {
    // Il nome dell'esame intero non indica un modulo.
    if (norm(grezzo) === norm(titoloEsame)) continue;
    const nomeCat = ALIAS[grezzo] ?? grezzo;
    let migliore = null, punteggio = 0;
    for (const m of moduli) {
      const s = somiglianza(nomeCat, m.nome_modulo);
      if (s > punteggio) { punteggio = s; migliore = m; }
    }
    if (migliore && punteggio >= 0.5) scelti.add(migliore);
  }
  return [...scelti];
}

const guideFiles = (await readdir(DIR_GUIDE)).filter((f) => f.endsWith('.yaml')).sort();
const guide = [];
for (const f of guideFiles) guide.push({ file: f, ...YAML.parse(await readFile(join(DIR_GUIDE, f), 'utf8')) });

let dati;
if (RIUSA) dati = JSON.parse(await readFile(USCITA, 'utf8'));
else {
  console.log('Catalogo dei corsi: docenti per insegnamento…');
  dati = await scarica(guide.filter((g) => g.esse3_codice));
  await writeFile(USCITA, `${JSON.stringify(dati, null, 2)}\n`);
}

// Tutti i docenti del catalogo, per completare quelli citati in esami senza dati.
const TUTTI = Object.values(dati.esami).flatMap((e) => e.docenti);

console.log('\nGuide:');
let toccate = 0;
for (const g of guide) {
  // Esami senza docenti nel catalogo (es. VI anno): si completa comunque
  // dai docenti degli altri esami (passo 1 bis).
  const esame = dati.esami[g.esse3_codice] ?? (g.esse3_codice ? { nome: g.title, docenti: [] } : null);
  if (!esame) continue;
  const prima = JSON.stringify(g.moduli);
  const note = [];
  const nomeDi = (d) => `${d.nome} ${d.cognome}`.trim();
  // 1. Professori già nella guida: ognuno abbinato a UN solo docente del
  //    catalogo (confronto sui dati originali). Due docenti con lo stesso
  //    cognome (es. Laura e Paolo Fusar Poli) = ambiguo: la voce resta com'è
  //    e nessuno dei due viene aggiunto, da sistemare a mano.
  // Nomi senza titoli ("Prof.ssa", "Dott."): uniformi anche per i docenti che il catalogo non conosce.
  for (const m of g.moduli) for (const p of m.professors ?? []) p.nome = senzaTitolo(p.nome);
  const abbinati = new Set();
  const ambigui = new Set();
  const espansi = [];
  for (const m of g.moduli) {
    for (const p of m.professors ?? []) {
      const candidati = esame.docenti.filter((d) => stessaPersona(p, d));
      if (candidati.length > 1) {
        // Stesso cognome (es. Laura e Paolo Fusar Poli): vanno entrambi nel
        // modulo (scelta dei creatori, 2026-10-08). La nota del rappresentante
        // passa a tutti, tranne "titolare", che va solo al titolare del catalogo.
        candidati.forEach((d) => ambigui.add(d));
        const titolari = candidati.filter((d) => d.titolare);
        espansi.push({ m, p, nuovi: candidati.map((d) => {
          const nota = p.stile && (!/titolare/i.test(p.stile) || !titolari.length || titolari.includes(d)) ? { stile: p.stile } : {};
          return { nome: nomeDi(d), ...nota, ...(d.email ? { email: d.email } : {}) };
        }) });
        note.push(`= "${p.nome}" (${m.nome_modulo}) → ${candidati.map(nomeDi).join(' e ')}`);
        continue;
      }
      let d = candidati[0];
      // 1 bis. Non nel catalogo di questo esame: cognome UNICO fra tutti i
      // docenti del catalogo (altri esami) → nome ed email da lì.
      if (!d) {
        const altrove = [...new Map(TUTTI.filter((x) => stessaPersona(p, x)).map((x) => [x.email ?? nomeDi(x), x])).values()];
        if (altrove.length !== 1) continue;
        d = altrove[0];
        note.push(`(da un altro esame) "${p.nome}" → ${nomeDi(d)}`);
      }
      abbinati.add(d);
      if (p.nome !== nomeDi(d)) { note.push(`nome "${p.nome}" → "${nomeDi(d)}"`); p.nome = nomeDi(d); }
      if (d.email && p.email !== d.email) {
        if (p.email) note.push(`⚠ email di ${nomeDi(d)}: "${p.email}" → "${d.email}" (catalogo)`);
        p.email = d.email;
      }
    }
  }
  for (const { m, p, nuovi } of espansi) {
    const i = m.professors.indexOf(p);
    m.professors.splice(i, 1, ...nuovi);
  }
  // 2. Docenti mancanti: nel modulo che insegnano.
  for (const d of esame.docenti) {
    if (abbinati.has(d) || ambigui.has(d)) continue;
    if (SOLO_NOMINATI.has(String(g.esse3_codice)) && !d.titolare) continue;
    const dove = moduliDelDocente(d, g.moduli, esame.nome);
    if (!dove.length) {
      note.push(`? ${nomeDi(d)} (${d.moduli.join(', ') || 'nessun modulo indicato'}): modulo non riconosciuto, non aggiunto`);
      continue;
    }
    for (const m of dove) {
      m.professors = [...(m.professors ?? []), { nome: nomeDi(d), ...(d.email ? { email: d.email } : {}) }];
    }
    note.push(`+ ${nomeDi(d)} → ${dove.map((m) => m.nome_modulo).join(', ')}`);
  }
  // 3. Note "da verificare" su email/contatti ormai risolte: si tolgono solo se
  //    tutti i docenti che nominano hanno l'email (se non ne nominano nessuno:
  //    tutti quelli della guida). Brambilla, Costa & co. senza email = nota resta.
  const prof = g.moduli.flatMap((m) => m.professors ?? []);
  const cognome = (p) => norm(senzaTitolo(p.nome).split(/\s+/).slice(-1)[0]);
  const primaInfo = JSON.stringify(g.info_da_verificare ?? []);
  g.info_da_verificare = (g.info_da_verificare ?? []).filter((i) => {
    const testo = `${i.campo} ${i.nota ?? ''}`;
    if (!/e-?mail|contatt|nomi? complet|professori e/i.test(testo) || /^frequenza/i.test(i.campo)) return true;
    const citati = prof.filter((p) => cognome(p).length > 2 && norm(testo).includes(cognome(p)));
    // Nessun docente nominato: contano i moduli nominati (un modulo senza
    // docenti tiene la nota), altrimenti tutta la guida.
    const moduliCitati = g.moduli.filter((m) => g.moduli.length > 1 && norm(testo).includes(norm(m.nome_modulo)));
    const gruppo = citati.length ? citati : moduliCitati.length ? moduliCitati.flatMap((m) => m.professors ?? []) : prof;
    const vuoto = moduliCitati.some((m) => !(m.professors ?? []).length);
    const risolta = !vuoto && gruppo.length > 0 && gruppo.every((p) => p.email);
    if (risolta) note.push(`− da verificare: "${i.campo}" (risolta dal catalogo)`);
    return !risolta;
  });
  if (!g.info_da_verificare.length) delete g.info_da_verificare;
  const infoCambiate = JSON.stringify(g.info_da_verificare ?? []) !== primaInfo;

  if (JSON.stringify(g.moduli) !== prima || infoCambiate) {
    toccate++;
    if (!DRY) {
      const { file, ultimo_aggiornamento, ...resto } = g;
      await writeFile(join(DIR_GUIDE, file), `${YAML.stringify(resto, { lineWidth: 0, blockQuote: 'literal' })}ultimo_aggiornamento: ${oggi}\n`);
    }
  }
  console.log(`\n${g.title}`);
  for (const n of note) console.log(`  ${n}`);
}
console.log(`\n${toccate} guide ${DRY ? 'da aggiornare (--dry)' : 'aggiornate'}.`);
