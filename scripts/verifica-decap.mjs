#!/usr/bin/env node
// verifica-decap.mjs — Le guide si possono salvare in Decap?
//
// Decap rifiuta il salvataggio se UN campo qualsiasi della guida non rispetta
// le regole di public/admin/config.yml (pattern, opzioni, obbligatori, min/max),
// anche un campo che il rappresentante non ha toccato. Le guide scritte dagli
// script non passano da quei controlli: questo script li ripete su tutte le
// guide e fa fallire il build se una non sarebbe salvabile.
// Controlla anche che i pattern accettino un valore d'esempio valido (un
// '\\d' di troppo in YAML tra apici singoli rende un campo mai salvabile).
//
//   node scripts/verifica-decap.mjs     (gira dentro npm run build)

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import YAML from 'yaml';

const RADICE = join(import.meta.dirname, '..');
const cfg = YAML.parse(await readFile(join(RADICE, 'public/admin/config.yml'), 'utf8')).collections[0];
const problemi = [];

// Valori d'esempio validi per i pattern principali: se un pattern li rifiuta, è rotto.
const ESEMPI = { esse3_codice: '501694', stile: 'Molto tranquilla, lascia parlare.', email: 'nome.cognome@unipv.it', link_whatsapp: 'https://chat.whatsapp.com/abc' };
function controllaPattern(fields) {
  for (const f of fields) {
    if (f.pattern && ESEMPI[f.name] && !new RegExp(f.pattern[0]).test(ESEMPI[f.name])) {
      problemi.push(`config.yml: il pattern di "${f.name}" (${f.pattern[0]}) rifiuta anche il valore valido "${ESEMPI[f.name]}"`);
    }
    if (f.fields) controllaPattern(f.fields);
  }
}
controllaPattern(cfg.fields);

function controlla(fields, dati, dove, file) {
  for (const f of fields) {
    const v = dati?.[f.name];
    const p = dove + f.name;
    const vuoto = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
    if (f.required === true && vuoto && !['hidden', 'readonly-id'].includes(f.widget)) problemi.push(`${file}: ${p} è obbligatorio ma vuoto`);
    if (vuoto) continue;
    if (f.widget === 'list' && f.fields) {
      v.forEach((x, i) => controlla(f.fields, x, `${p}[${i}].`, file));
      continue;
    }
    if (f.pattern && typeof v === 'string' && !new RegExp(f.pattern[0]).test(v)) problemi.push(`${file}: ${p} → ${f.pattern[1]} (${JSON.stringify(v.slice(0, 60))})`);
    if (f.widget === 'select' && f.options && !f.options.includes(v)) problemi.push(`${file}: ${p} → valore non tra le opzioni (${JSON.stringify(v)})`);
    if (f.widget === 'number' && ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max))) problemi.push(`${file}: ${p} → fuori intervallo (${v})`);
  }
}
const dir = join(RADICE, cfg.folder);
for (const file of (await readdir(dir)).filter((x) => x.endsWith('.yaml')).sort()) {
  controlla(cfg.fields, YAML.parse(await readFile(join(dir, file), 'utf8')), '', file);
}

if (problemi.length) {
  console.error(`✗ Decap: ${problemi.length} campi non salvabili\n  ${problemi.join('\n  ')}`);
  process.exit(1);
}
console.log('✓ Decap: tutte le guide sono salvabili');
