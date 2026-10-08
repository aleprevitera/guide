-- I feedback sono contenuti "extra": visibili solo a chi ha fatto l'accesso
-- con l'account d'ateneo. I conteggi non sono più pubblici.

create or replace function public.study_time_counts(p_modulo_id text)
returns table (fascia text, voti bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select v.fascia, count(*)::bigint
  from public.study_time_votes v
  where v.modulo_id = p_modulo_id
    -- difesa in profondità: vale anche se l'hook Auth non fosse attivo
    and lower((select auth.jwt()) ->> 'email') like '%@universitadipavia.it'
  group by v.fascia;
$$;

revoke execute on function public.study_time_counts(text) from public, anon;
grant execute on function public.study_time_counts(text) to authenticated;
