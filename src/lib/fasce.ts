// Fasce del tempo di studio. Modulo senza dipendenze da astro:content perché
// lo usano anche gli script nel browser (istogramma).
// Deve restare identico a:
//   - le "options" di fascia_studio in public/admin/config.yml
//   - il check su study_time_votes.fascia in supabase/migrations/
export const FASCE_STUDIO = ['< 1 sett', '1–2 sett', '3–4 sett', '5–8 sett', '> 8 sett'] as const;
export type FasciaStudio = (typeof FASCE_STUDIO)[number];

export const isFascia = (v: unknown): v is FasciaStudio => FASCE_STUDIO.includes(v as FasciaStudio);
