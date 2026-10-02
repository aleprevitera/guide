import { createClient } from '@supabase/supabase-js';

// URL e chiave "publishable" del progetto Supabase: sono pubbliche per
// costruzione (finiscono nel browser) e l'accesso ai dati è regolato da RLS
// e dai permessi definiti in supabase/migrations/. Mai mettere qui la chiave
// secret / service_role.
const SUPABASE_URL = 'https://zbdovlgoincjtjvmesft.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_aJ5tbRbkzrjcIsOnu1kDUA_O4W5nbde';

/** Dominio degli account istituzionali ammessi al voto. */
export const DOMINIO_ATENEO = 'universitadipavia.it';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
  },
});
