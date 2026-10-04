// Fasce del tempo di studio. Modulo senza dipendenze da astro:content perché
// lo usano anche gli script nel browser (istogramma).
// Deve restare identico a:
//   - le "options" di fascia_studio in public/admin/config.yml
//   - il check su module_feedback.valore (tipo tempo_studio) in supabase/migrations/
export const FASCE_STUDIO = ['< 1 sett', '1–2 sett', '3–4 sett', '5–8 sett', '> 8 sett'] as const;
export type FasciaStudio = (typeof FASCE_STUDIO)[number];

export const isFascia = (v: unknown): v is FasciaStudio => FASCE_STUDIO.includes(v as FasciaStudio);

/**
 * Fascia del tempo di studio a partire da un intervallo in giorni (stima del
 * rappresentante → etichetta "RAPPR." nell'istogramma). Si usa il punto medio
 * dell'intervallo in settimane, con soglie a metà fra le fasce:
 * < 1 → "< 1 sett", < 2,5 → "1–2 sett", < 4,5 → "3–4 sett", < 8,5 → "5–8 sett", oltre → "> 8 sett".
 * Esempi: 3–4 giorni → < 1 sett; 15 giorni → 1–2 sett; 20 giorni → 3–4 sett;
 * 1 mese (30) → 3–4 sett; 45–60 giorni → 5–8 sett. Usata anche da scripts/importa-notion.mjs.
 */
export function fasciaDaGiorni(min: number, max: number = min): FasciaStudio {
  const settimane = (min + max) / 2 / 7;
  if (settimane < 1) return '< 1 sett';
  if (settimane < 2.5) return '1–2 sett';
  if (settimane < 4.5) return '3–4 sett';
  if (settimane < 8.5) return '5–8 sett';
  return '> 8 sett';
}
