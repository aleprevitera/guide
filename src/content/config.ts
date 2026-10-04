import { defineCollection, z } from 'astro:content';
import { FASCE_STUDIO } from '../lib/fasce';

// Anni di corso — mirror del progetto MkDocs esistente (docs/I_Anno..VI_Anno),
// dove l'organizzazione del sito è per anno accademico, non per corso di laurea.
// Deve restare identico all'elenco "options" in public/admin/config.yml.
export const ANNI_DI_CORSO = ['I Anno', 'II Anno', 'III Anno', 'IV Anno', 'V Anno', 'VI Anno'] as const;

export const SEMESTRI = ['I', 'II'] as const;

// Allineato 1:1 alle opzioni realmente in uso nel progetto esistente.
export const TIPI_ESAME = ['Orale', 'Scritto', 'Scritto + Orale'] as const;

export const FREQUENZE = ['Obbligatoria', 'Consigliata', 'Facoltativa'] as const;

// Fasce del tempo di studio (stima del rappresentante e voti): definite in
// src/lib/fasce.ts perché servono anche nel browser.
export { FASCE_STUDIO, type FasciaStudio } from '../lib/fasce';

// Id stabili e immutabili, distinti da titolo e slug: servono ad agganciare
// dati esterni (es. i feedback) anche se una guida viene rinominata.
// Generati dal widget "readonly-id" di Decap (public/admin/index.html).
// Opzionali solo per compatibilità; l'unicità è verificata in build.
export const GUIDA_ID = /^g-[a-z0-9]{8}$/;
export const MODULO_ID = /^m-[a-z0-9]{8}$/;

// Decap salva i campi svuotati come "" (e a volte null) invece di toglierli:
// per i campi facoltativi valgono come "non compilato", così un rappresentante
// che cancella un link o un menu non blocca la build del sito.
const vuotoComeAssente = (v: unknown) => (v === '' || v === null ? undefined : v);
const opz = <T extends z.ZodTypeAny>(schema: T) => z.preprocess(vuotoComeAssente, schema.optional());

const professoreSchema = z.object({
  nome: z.string().min(1).max(150),
  email: opz(z.string().email()),
  stile: opz(z.string().max(500)),
});

// Un modulo = uno "scheda_esame"/"scheda_modulo" del progetto MkDocs: un esame a
// modulo singolo ha semplicemente moduli.length === 1 con nome_modulo === title.
const moduloSchema = z.object({
  id: opz(z.string().regex(MODULO_ID)),
  nome_modulo: z.string().min(1).max(150),
  cfu: opz(z.number().int().min(1).max(60)),
  semestre: opz(z.enum(SEMESTRI)),
  difficolta: opz(z.number().int().min(1).max(5)),
  exam_type: opz(z.enum(TIPI_ESAME)),

  link_sbobine: opz(z.string().url()),
  link_whatsapp: opz(z.string().url()),
  google_sheet_url: opz(z.string().url()),
  study_time: opz(z.string().max(100)),

  // Scheda esame (tutti facoltativi; in pagina compaiono solo se presenti).
  preappello: opz(z.enum(['Sì', 'No'])),
  frequenza: opz(z.enum(FREQUENZE)),
  durata_orale_min: opz(z.number().int().min(1).max(240)),
  fascia_studio: opz(z.enum(FASCE_STUDIO)),

  // Sezioni narrative: testo Markdown ristretto (solo bold/italic/liste/link,
  // nessun heading/HTML), sanificato in src/lib/markdown.ts prima del render.
  exam_details: opz(z.string()),
  program: z.string().min(1),
  material_tips: opz(z.string()),
  body: opz(z.string()),

  professors: z.preprocess(vuotoComeAssente, z.array(professoreSchema).default([])),
});

const infoDaVerificareSchema = z.object({
  campo: z.string().min(1).max(200),
  nota: opz(z.string()),
});

const guideCollection = defineCollection({
  // 'data', non 'content': niente body Markdown libero, tutto è
  // frontmatter tipizzato — l'unico modo di generare HTML è passare
  // questi campi attraverso i componenti fissi del layout.
  type: 'data',
  schema: z.object({
    id: opz(z.string().regex(GUIDA_ID)),
    title: z.string().min(3).max(150),
    sottotitolo: opz(z.string().max(200)),
    anno_di_corso: z.enum(ANNI_DI_CORSO),
    cfu_totali: opz(z.number().int().min(1).max(120)),

    // Rilevanti solo per un esame integrato (moduli.length > 1): link e
    // descrizione a livello di esame aggregato, equivalenti allo
    // "scheda_integrato"/index.md del progetto esistente.
    link_sbobine_generale: opz(z.string().url()),
    link_whatsapp_generale: opz(z.string().url()),
    descrizione_generale: opz(z.string()),

    moduli: z.array(moduloSchema).min(1),

    info_da_verificare: z.preprocess(vuotoComeAssente, z.array(infoDaVerificareSchema).default([])),

    ultimo_aggiornamento: z.coerce.date(),
    aggiornato_da: opz(z.string().max(100)),
  }),
});

export const collections = {
  guide: guideCollection,
};
