import type { Session } from '@supabase/supabase-js';
import { CHIAVE_SESSIONE, DOMINIO_ATENEO } from './supabase-config';

// Unico punto d'accesso all'autenticazione degli studenti (Google, account
// d'ateneo). L'accesso è facoltativo: serve per i contenuti "extra", cioè i
// feedback. I componenti ascoltano l'evento EVENTO_AUTH su window.

export const EVENTO_AUTH = 'auth:cambio';

export interface StatoAuth {
  session: Session | null;
  /** true solo al ritorno da un accesso appena completato (per le animazioni). */
  appenaEntrato: boolean;
  /** Messaggio se il ritorno da Google contiene un errore (es. account non d'ateneo). */
  errore: string | null;
}

const PARAMETRI_LOGIN = ['code', 'error', 'error_code', 'error_description'];
const CHIAVE_ANCORA = 'guide:ancora-prima-accesso';

let stato: Promise<StatoAuth> | null = null;

const caricaClient = () => import('./supabase');

const emailAmmessa = (s: Session | null) => !!s && (s.user.email ?? '').toLowerCase().endsWith(`@${DOMINIO_ATENEO}`);

function sessioneSalvata(): boolean {
  try {
    return localStorage.getItem(CHIAVE_SESSIONE) !== null;
  } catch {
    return false;
  }
}

function annuncia(s: StatoAuth) {
  window.dispatchEvent(new CustomEvent<StatoAuth>(EVENTO_AUTH, { detail: s }));
}

async function inizializza(): Promise<StatoAuth> {
  const url = new URL(location.href);
  const ritornoLogin = PARAMETRI_LOGIN.some((k) => url.searchParams.has(k));
  const errore = url.searchParams.get('error_description');

  // Nessuna sessione salvata e nessun ritorno da Google: non serve scaricare
  // la libreria Supabase.
  if (!ritornoLogin && !sessioneSalvata()) {
    return { session: null, appenaEntrato: false, errore: null };
  }

  const { supabase } = await caricaClient();
  // Al ritorno da Google il client scambia ?code= con la sessione (PKCE)
  // durante l'inizializzazione; getSession() la attende.
  let session = (await supabase.auth.getSession()).data.session;

  if (ritornoLogin) {
    PARAMETRI_LOGIN.forEach((k) => url.searchParams.delete(k));
    // L'ancora (es. il modulo aperto) non passa da Google: la ripristiniamo.
    try {
      const ancora = sessionStorage.getItem(CHIAVE_ANCORA);
      sessionStorage.removeItem(CHIAVE_ANCORA);
      if (ancora && !url.hash) url.hash = ancora;
    } catch {
      /* senza storage si resta in cima alla pagina */
    }
    history.replaceState(history.state, '', url);
    if (url.hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  }

  if (session && !emailAmmessa(session)) {
    // Non dovrebbe accadere (hook Auth + RLS), ma non lasciamo aperta una
    // sessione con un account non ammesso.
    await supabase.auth.signOut();
    session = null;
  }

  return {
    session,
    appenaEntrato: ritornoLogin && !!session,
    errore: errore ? `Accesso non riuscito. Usa il tuo account @${DOMINIO_ATENEO}.` : null,
  };
}

/**
 * Stato dell'accesso, calcolato una volta per pagina. I componenti lo
 * leggono all'avvio e ascoltano EVENTO_AUTH per i cambiamenti successivi
 * (l'accesso ricarica la pagina tornando da Google; l'uscita no).
 */
export function statoAuth(): Promise<StatoAuth> {
  stato ??= inizializza();
  return stato;
}

/** Avvia l'accesso con Google; al ritorno si torna sulla pagina corrente. */
export async function accedi(): Promise<{ errore: string | null }> {
  const { supabase } = await caricaClient();
  try {
    if (location.hash) sessionStorage.setItem(CHIAVE_ANCORA, location.hash.slice(1));
  } catch {
    /* facoltativo */
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: location.origin + location.pathname,
      // Suggerisce a Google gli account del dominio d'ateneo; il vincolo vero
      // è lato server (hook Auth + RLS).
      queryParams: { hd: DOMINIO_ATENEO, prompt: 'select_account' },
    },
  });
  return { errore: error ? 'Non è stato possibile avviare l’accesso con Google.' : null };
}

export async function esci(): Promise<void> {
  const { supabase } = await caricaClient();
  await supabase.auth.signOut();
  const nuovo: StatoAuth = { session: null, appenaEntrato: false, errore: null };
  stato = Promise.resolve(nuovo);
  annuncia(nuovo);
}

/** Nome breve da mostrare (solo visualizzazione, mai per autorizzazioni). */
export function nomeBreve(session: Session): string {
  const meta = session.user.user_metadata ?? {};
  const nome = (meta.given_name as string | undefined) ?? (meta.full_name as string | undefined)?.split(' ')[0];
  return nome || (session.user.email ?? '').split('@')[0];
}
