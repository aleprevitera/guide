import { defineCollection, z } from 'astro:content';

// Elenco fisso dei corsi di laurea — deve restare identico all'elenco
// "options" del widget select in public/admin/config.yml. Modificarlo
// richiede una PR, non è editabile dai rappresentanti: impedisce
// categorie improvvisate che romperebbero badge/filtri condizionali.
export const CORSI_DI_LAUREA = [
  'Medicina e Chirurgia',
  'Odontoiatria e Protesi Dentaria',
  'Infermieristica',
  'Fisioterapia',
  'Biotecnologie',
] as const;

export const TIPI_ESAME = [
  'Orale',
  'Scritto',
  'Scritto e orale',
  'Progetto/Elaborato',
  'Altro',
] as const;

const moduloSchema = z.object({
  nome_modulo: z.string().min(1).max(150),
  docente: z.string().max(150).optional(),
  cfu: z.number().int().min(1).max(60).optional(),

  tipo_esame: z.enum(TIPI_ESAME),
  preappello: z.boolean().default(false),
  preappello_note: z.string().max(200).optional(),
  frequenza_obbligatoria: z.boolean().default(false),

  // Sezioni narrative: testo Markdown ristretto (solo bold/italic/liste/link,
  // nessun heading/HTML), sanificato in src/lib/markdown.ts prima del render.
  programma: z.string().min(1),
  dove_studiare: z.string().optional(),
  per_quanto_tempo_studiare: z.string().optional(),
  come_si_svolge_esame: z.string().optional(),
  consigli_pratici: z.string().optional(),
  domande_argomenti_ricorrenti: z.string().optional(),
});

const infoDaVerificareSchema = z.object({
  campo: z.string().min(1).max(200),
  nota: z.string().optional(),
});

const contattiSchema = z.object({
  email: z.string().email().optional(),
  sito_web: z.string().url().optional(),
  ufficio: z.string().max(200).optional(),
});

const linkUtileSchema = z.object({
  etichetta: z.string().min(1).max(80),
  url: z.string().url(),
});

const guideCollection = defineCollection({
  // 'data', non 'content': niente body Markdown libero, tutto è
  // frontmatter tipizzato — l'unico modo di generare HTML è passare
  // questi campi attraverso i componenti fissi del layout.
  type: 'data',
  schema: z.object({
    title: z.string().min(3).max(150),
    corso_di_laurea: z.enum(CORSI_DI_LAUREA),
    anno_accademico: z.string().regex(/^\d{4}\/\d{4}$/, 'Formato atteso: AAAA/AAAA'),
    cfu_totali: z.number().int().min(1).max(120).optional(),

    moduli: z.array(moduloSchema).min(1),

    calcolo_voto_finale: z.string().optional(),
    info_da_verificare: z.array(infoDaVerificareSchema).default([]),

    contatti: contattiSchema.optional(),
    link_utili: z.array(linkUtileSchema).default([]),

    ultimo_aggiornamento: z.date(),
    aggiornato_da: z.string().max(100).optional(),
  }),
});

export const collections = {
  guide: guideCollection,
};
