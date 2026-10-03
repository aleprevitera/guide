import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './supabase-config';

export { DOMINIO_ATENEO } from './supabase-config';

// Importato solo dinamicamente (import('./supabase')): la libreria finisce in
// un chunk separato e si scarica solo quando serve. Vedi src/lib/auth.ts.
export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    flowType: 'pkce',
    detectSessionInUrl: true,
    persistSession: true,
  },
});
