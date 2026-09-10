import { defineCollection, z } from 'astro:content';

// Anni di corso — mirror del progetto MkDocs esistente (docs/I_Anno..VI_Anno),
// dove l'organizzazione del sito è per anno accademico, non per corso di laurea.
// Deve restare identico all'elenco "options" in public/admin/config.yml.
export const ANNI_DI_CORSO = ['I Anno', 'II Anno', 'III Anno', 'IV Anno', 'V Anno', 'VI Anno'] as const;

export const SEMESTRI = ['I', 'II'] as const;

// Allineato 1:1 alle opzioni realmente in uso nel progetto esistente.
export const TIPI_ESAME = ['Orale', 'Scritto', 'Scritto + Orale'] as const;

const professoreSchema = z.object({
  nome: z.string().min(1).max(150),
  email: z.string().email().optional(),
  stile: z.string().max(500).optional(),
});

// Un modulo = uno "scheda_esame"/"scheda_modulo" del progetto MkDocs: un esame a
// modulo singolo ha semplicemente moduli.length === 1 con nome_modulo === title.
const moduloSchema = z.object({
  nome_modulo: z.string().min(1).max(150),
  cfu: z.number().int().min(1).max(60).optional(),
  semestre: z.enum(SEMESTRI).optional(),
  difficolta: z.number().int().min(1).max(5).optional(),
  exam_type: z.enum(TIPI_ESAME).optional(),

  link_sbobine: z.string().url().optional(),
  link_whatsapp: z.string().url().optional(),
  google_sheet_url: z.string().url().optional(),
  study_time: z.string().max(100).optional(),

  // Sezioni narrative: testo Markdown ristretto (solo bold/italic/liste/link,
  // nessun heading/HTML), sanificato in src/lib/markdown.ts prima del render.
  exam_details: z.string().optional(),
  program: z.string().min(1),
  material_tips: z.string().optional(),
  body: z.string().optional(),

  professors: z.array(professoreSchema).default([]),
});

const infoDaVerificareSchema = z.object({
  campo: z.string().min(1).max(200),
  nota: z.string().optional(),
});

const guideCollection = defineCollection({
  // 'data', non 'content': niente body Markdown libero, tutto è
  // frontmatter tipizzato — l'unico modo di generare HTML è passare
  // questi campi attraverso i componenti fissi del layout.
  type: 'data',
  schema: z.object({
    title: z.string().min(3).max(150),
    anno_di_corso: z.enum(ANNI_DI_CORSO),
    cfu_totali: z.number().int().min(1).max(120).optional(),

    // Rilevanti solo per un esame integrato (moduli.length > 1): link e
    // descrizione a livello di esame aggregato, equivalenti allo
    // "scheda_integrato"/index.md del progetto esistente.
    link_sbobine_generale: z.string().url().optional(),
    link_whatsapp_generale: z.string().url().optional(),
    descrizione_generale: z.string().optional(),

    moduli: z.array(moduloSchema).min(1),

    info_da_verificare: z.array(infoDaVerificareSchema).default([]),

    ultimo_aggiornamento: z.date(),
    aggiornato_da: z.string().max(100).optional(),
  }),
});

export const collections = {
  guide: guideCollection,
};
