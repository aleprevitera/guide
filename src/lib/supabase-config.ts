// Configurazione pubblica di Supabase, senza dipendenze: importabile ovunque
// senza caricare la libreria client (che sta in src/lib/supabase.ts).
// URL e chiave "publishable" sono pubbliche per costruzione; l'accesso ai
// dati è regolato da RLS e permessi (supabase/migrations/). Mai mettere qui
// la chiave secret / service_role.
export const SUPABASE_REF = 'zbdovlgoincjtjvmesft';
export const SUPABASE_URL = `https://${SUPABASE_REF}.supabase.co`;
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_aJ5tbRbkzrjcIsOnu1kDUA_O4W5nbde';

/** Chiave localStorage in cui supabase-js salva la sessione (default della libreria). */
export const CHIAVE_SESSIONE = `sb-${SUPABASE_REF}-auth-token`;

/** Dominio degli account istituzionali ammessi. */
export const DOMINIO_ATENEO = 'universitadipavia.it';
