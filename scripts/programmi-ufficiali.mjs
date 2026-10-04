#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// programmi-ufficiali.mjs — Programmi e CFU ufficiali nelle guide
//
// Legge src/data/programmi-ufficiali.json (catalogo dei corsi UniPV, corso di
// Medicina e Chirurgia Golgi) e aggiorna le guide in src/content/guide/:
//   • esse3_codice  = codice attività dell'insegnamento (es. "501694");
//   • cfu_totali    = crediti ufficiali;
//   • program       = programma ufficiale (sostituisce quello scritto dai
//                     rappresentanti), diviso per modulo; in fondo il link
//                     alla scheda del catalogo;
//   • ultimo_aggiornamento = oggi, solo se qualcosa cambia.
// Il testo ufficiale non viene riscritto: solo ripulito (paragrafi ripetuti,
// spazi) e convertito nel Markdown ristretto delle guide.
//
// Divisione per modulo (esami a più moduli):
//   1. se il testo ha un'intestazione col nome di ogni modulo, per intestazioni;
//   2. altrimenti DeepSeek (OpenRouter, come l'import da Notion) ASSEGNA le
//      righe numerate ai moduli o a "comune": risponde solo numeri di riga,
//      il testo lo ricompone il codice dalle righe originali, quindi non può
//      essere alterato. Le righe comuni vanno in tutti i moduli; un modulo
//      senza righe riceve il programma intero. Risposte in cache (.cache/).
//
// Uso:
//   node scripts/programmi-ufficiali.mjs --dry      # mostra cosa cambierebbe
//   node scripts/programmi-ufficiali.mjs            # scrive le guide
//   node scripts/programmi-ufficiali.mjs --solo=Pediatria
//
// Da rilanciare quando esce il catalogo del nuovo anno accademico (dopo aver
// aggiornato src/data/programmi-ufficiali.json).
// ─────────────────────────────────────────────────────────────────────────────

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import crypto from 'node:crypto';
import YAML from 'yaml';

const RADICE = join(import.meta.dirname, '..');
const DIR_GUIDE = join(RADICE, 'src/content/guide');
const CATALOGO = join(RADICE, 'src/data/programmi-ufficiali.json');

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const SOLO = args.find((a) => a.startsWith('--solo='))?.slice(7)?.toLowerCase();
const oggi = new Date().toISOString().slice(0, 10);
const DIR_CACHE = join(RADICE, '.cache/programmi-ufficiali');
const MODELLO = 'deepseek/deepseek-v4.1-flash';

async function chiaveApi() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY;
  const env = await readFile(join(RADICE, '.env'), 'utf8').catch(() => '');
  const m = env.match(/^OPENROUTER_API_KEY\s*=\s*"?([^"\n]+)"?/m);
  if (m) return m[1].trim();
  throw new Error('Manca OPENROUTER_API_KEY (ambiente o .env).');
}

/**
 * Assegna ogni riga (non vuota) a un modulo o a "comune" con DeepSeek.
 * Restituisce Map(indice riga → id modulo | 'comune').
 */
async function assegnaConModello(righe, moduli, titolo) {
  const numerate = righe.map((r, i) => ({ r, i })).filter((x) => x.r);
  const ids = moduli.map((m) => m.id);
  const hash = crypto.createHash('sha256').update(MODELLO + titolo + JSON.stringify(numerate) + ids.join()).digest('hex').slice(0, 16);
  const fileCache = join(DIR_CACHE, `${hash}.json`);
  const inCache = await readFile(fileCache, 'utf8').then(JSON.parse).catch(() => null);
  let assegnazioni = inCache;
  if (!assegnazioni) {
    const elenco = moduli.map((m) => `- ${m.id}: ${m.nome_modulo}`).join('\n');
    const testo = numerate.map((x) => `${x.i}: ${x.r}`).join('\n');
    const risposta = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${await chiaveApi()}`, 'Content-Type': 'application/json', 'X-Title': 'Guide Universitarie - programmi ufficiali' },
      body: JSON.stringify({
        model: MODELLO,
        temperature: 0,
        max_tokens: 16000,
        reasoning: { effort: 'low', exclude: true },
        provider: { require_parameters: true, sort: 'throughput' },
        messages: [
          {
            role: 'system',
            content:
              'Ricevi il programma ufficiale di un esame universitario di Medicina, una riga per numero, e i moduli dell\'esame. ' +
              'Assegna OGNI riga al modulo di cui tratta, oppure a "comune" se è un\'introduzione, un\'indicazione generale o vale per tutti i moduli. ' +
              'Le righe di uno stesso argomento stanno di solito nello stesso modulo della riga precedente. Non riscrivere nulla: rispondi solo in json con numero di riga e modulo.',
          },
          { role: 'user', content: `Esame: ${titolo}\nModuli:\n${elenco}\n\nProgramma:\n${testo}` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'assegnazioni',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['righe'],
              properties: {
                righe: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['riga', 'modulo'],
                    properties: { riga: { type: 'integer' }, modulo: { type: 'string', enum: [...ids, 'comune'] } },
                  },
                },
              },
            },
          },
        },
      }),
      signal: AbortSignal.timeout(180_000),
    });
    const corpo = await risposta.json();
    if (!risposta.ok) throw new Error(`OpenRouter ${risposta.status}: ${corpo.error?.message ?? ''}`);
    assegnazioni = JSON.parse(corpo.choices[0].message.content).righe;
    await mkdir(DIR_CACHE, { recursive: true });
    await writeFile(fileCache, JSON.stringify(assegnazioni));
  }
  const mappa = new Map();
  for (const a of assegnazioni) if (righe[a.riga] && (ids.includes(a.modulo) || a.modulo === 'comune')) mappa.set(a.riga, a.modulo);
  // Righe non assegnate dal modello: comuni (meglio ripetute che perse).
  for (const x of numerate) if (!mappa.has(x.i)) mappa.set(x.i, 'comune');
  return mappa;
}

/** Righe del modulo: comuni + sue, nell'ordine originale, separatori compresi. */
function righeDelModulo(righe, assegnazione, id) {
  const tenute = righe.map((r, i) => (r ? (assegnazione.get(i) === 'comune' || assegnazione.get(i) === id ? r : null) : ''));
  const out = [];
  for (const r of tenute) {
    if (r === null) continue;
    if (r === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
    out.push(r);
  }
  return out;
}

// ── Testo ────────────────────────────────────────────────────────────────────

const STOP = new Set(['DI', 'DEL', 'DELLA', 'DELLE', 'DEGLI', 'DEI', 'DELL', 'E', 'ED', 'PER', 'LA', 'IL', 'LE', 'GLI', 'I', 'IN', 'A', 'AL', 'APPARATO']);
const token = (s) =>
  new Set(
    (s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, ' ')
      .trim()
      .split(' ')
      .filter((t) => t && !STOP.has(t)),
  );
function similarita(a, b) {
  const A = token(a);
  const B = token(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return Math.max(inter / (A.size + B.size - inter), (0.95 * inter) / Math.min(A.size, B.size));
}

/** Righe pulite, senza paragrafi ripetuti (il catalogo a volte li duplica). */
function righePulite(testo) {
  const paragrafi = (testo || '')
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.split('\n').map((r) => r.replace(/\s+/g, ' ').trim()).filter(Boolean))
    .filter((p) => p.length);
  const visti = new Set();
  const righe = [];
  for (const p of paragrafi) {
    const chiave = p.join(' ').toUpperCase();
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    righe.push(...p, '');
  }
  return righe;
}

/** Riga che sembra un'intestazione: corta, tutta maiuscola o che finisce con ":". */
const sembraTitolo = (r) => r.length > 2 && r.length <= 90 && (/:$/.test(r) || (r === r.toUpperCase() && /[A-Z]{3}/.test(r)));

/**
 * Divide le righe per modulo cercando intestazioni col nome del modulo.
 * Restituisce { comune: righe prima della prima intestazione di modulo,
 * perModulo: Map(idModulo → righe) } oppure null se non si riesce a
 * riconoscere un'intestazione per ogni modulo.
 */
function dividiPerModulo(righe, moduli) {
  const inizi = [];
  righe.forEach((r, i) => {
    if (!sembraTitolo(r)) return;
    const classifica = moduli.map((m) => ({ m, s: similarita(r.replace(/:$/, ''), m.nome_modulo) })).sort((a, b) => b.s - a.s);
    if (classifica[0].s >= 0.6 && classifica[0].s > (classifica[1]?.s ?? 0)) inizi.push({ i, id: classifica[0].m.id });
  });
  if (new Set(inizi.map((x) => x.id)).size !== moduli.length) return null;
  const perModulo = new Map(moduli.map((m) => [m.id, []]));
  inizi.forEach((x, k) => {
    const fine = k + 1 < inizi.length ? inizi[k + 1].i : righe.length;
    perModulo.get(x.id).push(...righe.slice(x.i, fine), '');
  });
  return { comune: righe.slice(0, inizi[0].i), perModulo };
}

/** Righe → Markdown ristretto delle guide (paragrafi, elenchi, grassetto). */
function markdown(righe) {
  const out = [];
  for (const r of righe) {
    if (!r) {
      if (out.length && out[out.length - 1] !== '') out.push('');
      continue;
    }
    const elenco = /^[-•*–]\s+(.*)$/.exec(r);
    const numerata = /^(\d+)[).]\s+(.*)$/.exec(r);
    const prec = out[out.length - 1];
    if (elenco || numerata) {
      if (prec && prec !== '' && !/^(- |\d+\. )/.test(prec)) out.push('');
      out.push(elenco ? `- ${elenco[1]}` : `${numerata[1]}. ${numerata[2]}`);
    } else {
      if (prec && prec !== '') out.push('');
      out.push(sembraTitolo(r) ? `**${r.replace(/\*/g, '')}**` : r);
    }
  }
  while (out[out.length - 1] === '') out.pop();
  return out.join('\n');
}

// Programmi scritti dai rappresentanti che non dicono nulla in più di quello
// ufficiale: si scartano. Gli altri contengono consigli (argomenti più chiesti,
// cose da integrare) e finiscono in testa a "Consigli e Materiale".
const GENERICI = [/^programma da confermare\.?$/i, /^il programma è quello delle lezioni del corso\.?$/i, /^tutti gli argomenti contenuti nel syllabus\.?$/i];
function salvaConsigli(m) {
  const vecchio = (m.program ?? '').trim();
  if (!vecchio || vecchio.includes('coursecatalogue.cineca.it') || GENERICI.some((r) => r.test(vecchio))) return;
  // Solo un elenco di argomenti: è il programma, ora c'è quello ufficiale.
  if (vecchio.split('\n').filter((r) => r.trim()).every((r) => /^\s*(-|\d+\.)\s/.test(r))) return;
  const tips = (m.material_tips ?? '').trim();
  if (tips.includes(vecchio)) return;
  m.material_tips = `**Sul programma**\n\n${vecchio}${tips ? `\n\n${tips}` : ''}`;
}

const fonte = (p) => `*Programma ufficiale dal catalogo dei corsi UniPV: [scheda dell'insegnamento](${p.url}).*`;

// ── Main ─────────────────────────────────────────────────────────────────────

const catalogo = JSON.parse(await readFile(CATALOGO, 'utf8'));
const programmi = catalogo.programmi;
let modificate = 0;

for (const f of (await readdir(DIR_GUIDE)).filter((x) => x.endsWith('.yaml')).sort()) {
  const percorso = join(DIR_GUIDE, f);
  const dati = YAML.parse(await readFile(percorso, 'utf8'));
  if (SOLO && !dati.title.toLowerCase().includes(SOLO)) continue;

  // Insegnamento: per codice se c'è, altrimenti per nome (abbinamento sicuro).
  let p = dati.esse3_codice ? programmi.find((x) => x.codiceAttivita === String(dati.esse3_codice)) : null;
  if (!p) {
    const classifica = programmi.map((x) => ({ x, s: similarita(dati.title, x.nome) })).sort((a, b) => b.s - a.s);
    if (classifica[0].s >= 0.8 && classifica[0].s > (classifica[1]?.s ?? 0)) p = classifica[0].x;
  }
  if (!p) {
    console.log(`✗ ${dati.title}: nessun insegnamento abbinato con sicurezza (imposta "Codice esame ESSE3")`);
    continue;
  }

  const prima = JSON.stringify(dati);
  dati.esse3_codice = p.codiceAttivita;
  if (p.crediti) dati.cfu_totali = p.crediti;

  // Anno di corso diverso dal catalogo: non si cambia, si segnala.
  const ROMANI = ['I', 'II', 'III', 'IV', 'V', 'VI'];
  const annoUfficiale = ROMANI[Number(p.annoCorso) - 1];
  if (annoUfficiale && dati.anno_di_corso !== `${annoUfficiale} Anno`) {
    const campo = 'Anno di corso';
    dati.info_da_verificare ??= [];
    if (!dati.info_da_verificare.some((i) => i.campo === campo)) {
      dati.info_da_verificare.push({ campo, nota: `Nel catalogo ufficiale UniPV l'insegnamento è al ${annoUfficiale} anno ([scheda](${p.url})).` });
    }
  }

  const righe = righePulite(p.programma);
  let resoconto;
  if (!righe.length) {
    resoconto = 'programma assente nel catalogo: lasciato com’era';
  } else if (dati.moduli.length === 1) {
    salvaConsigli(dati.moduli[0]);
    dati.moduli[0].program = `${markdown(righe)}\n\n${fonte(p)}`;
    resoconto = 'programma intero';
  } else {
    const divisione = dividiPerModulo(righe, dati.moduli);
    const assegnazione = divisione ? null : await assegnaConModello(righe, dati.moduli, p.nome);
    const conteggi = [];
    for (const m of dati.moduli) {
      let parte = divisione
        ? [...divisione.comune, ...divisione.perModulo.get(m.id)]
        : righeDelModulo(righe, assegnazione, m.id);
      const proprie = divisione ? divisione.perModulo.get(m.id).filter(Boolean).length : [...assegnazione.values()].filter((v) => v === m.id).length;
      conteggi.push(`${m.nome_modulo} ${proprie || 'nessuna'}`);
      // Nessuna riga sua: il catalogo non ha una parte per questo modulo.
      // Meglio dirlo che ripetere il programma degli altri moduli.
      const nota = proprie ? '' : '*Il programma ufficiale non ha una parte dedicata a questo modulo: vedi la scheda completa.*\n\n';
      salvaConsigli(m);
      m.program = `${parte.some(Boolean) ? `${markdown(parte)}\n\n` : ''}${nota}${fonte(p)}`;
    }
    const comuni = assegnazione ? [...assegnazione.values()].filter((v) => v === 'comune').length : divisione.comune.filter(Boolean).length;
    resoconto = `${divisione ? 'per intestazioni' : 'con DeepSeek'}: ${conteggi.join(', ')} righe, ${comuni} comuni`;
  }

  // Le segnalazioni "programma mancante" sono risolte dal programma ufficiale.
  if (righe.length && dati.info_da_verificare) {
    dati.info_da_verificare = dati.info_da_verificare.filter((i) => !/^programma/i.test(i.campo));
    if (!dati.info_da_verificare.length) delete dati.info_da_verificare;
  }

  if (JSON.stringify(dati) !== prima) {
    dati.ultimo_aggiornamento = oggi;
    modificate++;
    if (!DRY) {
      // ultimo_aggiornamento come data YAML semplice, in fondo come nelle altre guide.
      const { ultimo_aggiornamento, ...resto } = dati;
      await writeFile(percorso, `${YAML.stringify(resto, { lineWidth: 0, blockQuote: 'literal' })}ultimo_aggiornamento: ${ultimo_aggiornamento}\n`);
    }
  }
  console.log(`✓ ${dati.title} ← [${p.codiceAttivita}] ${p.nome} · ${p.crediti} CFU · ${resoconto}`);
}

console.log(`\n${modificate} guide ${DRY ? 'da aggiornare (--dry: nessun file scritto)' : 'aggiornate'}.`);
