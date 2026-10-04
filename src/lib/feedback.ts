// Accesso ai feedback degli studenti (tabella module_feedback): conteggi
// aggregati, voto personale, invio. Solo nel browser e solo con sessione:
// i dati sono "extra" e Supabase li nega a chi non ha fatto l'accesso.
// Una cache evita chiamate doppie fra scheda esame, pannello e card.

export type TipoFeedback = 'tempo_studio' | 'difficolta';
export type Conteggi = Record<string, number>;

/** Evento su window dopo un voto: { modulo, tipo }. */
export const EVENTO_FEEDBACK = 'feedback:aggiornato';

const client = () => import('./supabase');
const cache = new Map<string, Promise<Map<string, Conteggi>>>();

/** Conteggi per valore, per uno o più moduli, in una sola chiamata. */
export function conteggi(moduli: string[], tipo: TipoFeedback): Promise<Map<string, Conteggi>> {
  const chiave = `${tipo}|${[...moduli].sort().join(',')}`;
  let p = cache.get(chiave);
  if (!p) {
    p = (async () => {
      const { supabase } = await client();
      const { data, error } = await supabase.rpc('feedback_counts', { p_modulo_ids: moduli, p_tipo: tipo });
      if (error) throw error;
      const mappa = new Map<string, Conteggi>();
      for (const r of (data ?? []) as { modulo_id: string; valore: string; voti: number }[]) {
        const c = mappa.get(r.modulo_id) ?? {};
        c[r.valore] = Number(r.voti);
        mappa.set(r.modulo_id, c);
      }
      return mappa;
    })();
    p.catch(() => cache.delete(chiave));
    cache.set(chiave, p);
  }
  return p;
}

/** Il voto dell'utente corrente per un modulo e tipo (null se non ha votato). */
export async function mioVoto(modulo: string, tipo: TipoFeedback): Promise<string | null> {
  const { supabase } = await client();
  const { data, error } = await supabase.from('module_feedback').select('valore').eq('modulo_id', modulo).eq('tipo', tipo).maybeSingle();
  if (error) throw error;
  return data?.valore ?? null;
}

/** Registra (o cambia) il voto; true se riuscito. Avvisa gli altri componenti. */
export async function vota(modulo: string, tipo: TipoFeedback, valore: string): Promise<boolean> {
  const { supabase } = await client();
  const { error } = await supabase.rpc('cast_feedback', { p_modulo_id: modulo, p_tipo: tipo, p_valore: valore });
  if (error) return false;
  for (const k of [...cache.keys()]) if (k.startsWith(`${tipo}|`) && k.includes(modulo)) cache.delete(k);
  window.dispatchEvent(new CustomEvent(EVENTO_FEEDBACK, { detail: { modulo, tipo } }));
  return true;
}
