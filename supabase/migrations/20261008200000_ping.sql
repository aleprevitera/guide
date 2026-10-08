-- Ping per tenere attivo il progetto Supabase gratuito, che va in pausa dopo
-- circa 7 giorni senza attività (es. vacanze). Lo chiama la GitHub Action
-- .github/workflows/supabase-attivo.yml due volte a settimana.
--
-- Restituisce solo l'ora del database: non legge né scrive dati, quindi può
-- essere eseguita anche senza accesso (anon). SECURITY INVOKER.

create or replace function public.ping()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$
  select now();
$$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

comment on function public.ping() is
  'Tiene attivo il progetto gratuito (GitHub Action supabase-attivo). Nessun dato.';
