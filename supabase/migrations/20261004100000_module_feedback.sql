-- Feedback degli studenti per modulo, generalizzato: una tabella per tutti i
-- tipi di feedback (tempo di studio, difficoltà, e quelli futuri), con le
-- stesse regole della precedente study_time_votes:
--   * un voto per studente, modulo e tipo, modificabile;
--   * solo utenti autenticati con email @universitadipavia.it;
--   * ognuno legge solo il proprio voto; i conteggi aggregati via
--     feedback_counts() solo a utenti d'ateneo (contenuti "extra").
-- I valori ammessi per tipo devono restare identici a:
--   tempo_studio → FASCE_STUDIO in src/lib/fasce.ts
--   difficolta   → LIVELLI in src/lib/difficolta.ts

create table public.module_feedback (
  modulo_id text not null check (modulo_id ~ '^m-[a-z0-9]{8}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tipo text not null check (tipo in ('tempo_studio', 'difficolta')),
  valore text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (modulo_id, user_id, tipo),
  constraint module_feedback_valore_valido check (
    (tipo = 'tempo_studio' and valore in ('< 1 sett', '1–2 sett', '3–4 sett', '5–8 sett', '> 8 sett'))
    or (tipo = 'difficolta' and valore in ('facile', 'medio', 'difficile', 'estremo'))
  )
);

comment on table public.module_feedback is
  'Un voto per studente, modulo e tipo di feedback. Righe private (RLS); conteggi via feedback_counts().';

create index module_feedback_user_id_idx on public.module_feedback (user_id);
-- Conteggi per tipo su più moduli (card in elenco).
create index module_feedback_tipo_modulo_idx on public.module_feedback (tipo, modulo_id);

create function public.module_feedback_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger module_feedback_touch_updated_at
before update on public.module_feedback
for each row execute function public.module_feedback_touch_updated_at();

alter table public.module_feedback enable row level security;

create policy "Lo studente legge i propri feedback"
on public.module_feedback for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Lo studente d'ateneo inserisce i propri feedback"
on public.module_feedback for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and lower((select auth.jwt()) ->> 'email') like '%@universitadipavia.it'
);

create policy "Lo studente d'ateneo modifica i propri feedback"
on public.module_feedback for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and lower((select auth.jwt()) ->> 'email') like '%@universitadipavia.it'
);

revoke all on public.module_feedback from anon, authenticated;
grant select on public.module_feedback to authenticated;
grant insert (modulo_id, tipo, valore) on public.module_feedback to authenticated;
grant update (valore) on public.module_feedback to authenticated;

-- Voto (insert o sovrascrittura) — SECURITY INVOKER: valgono RLS e grant.
create function public.cast_feedback(p_modulo_id text, p_tipo text, p_valore text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.module_feedback (modulo_id, tipo, valore)
  values (p_modulo_id, p_tipo, p_valore)
  on conflict (modulo_id, user_id, tipo) do update set valore = excluded.valore;
$$;

revoke execute on function public.cast_feedback(text, text, text) from public, anon;
grant execute on function public.cast_feedback(text, text, text) to authenticated;

-- Conteggi aggregati per uno o più moduli — SECURITY DEFINER voluto: conta
-- anche i voti altrui ma restituisce solo (modulo, valore, numero di voti),
-- e solo a utenti autenticati d'ateneo.
create function public.feedback_counts(p_modulo_ids text[], p_tipo text)
returns table (modulo_id text, valore text, voti bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select f.modulo_id, f.valore, count(*)::bigint
  from public.module_feedback f
  where f.tipo = p_tipo
    and f.modulo_id = any (p_modulo_ids)
    and lower((select auth.jwt()) ->> 'email') like '%@universitadipavia.it'
  group by f.modulo_id, f.valore;
$$;

revoke execute on function public.feedback_counts(text[], text) from public, anon;
grant execute on function public.feedback_counts(text[], text) to authenticated;

-- Migrazione dei voti esistenti sul tempo di studio.
insert into public.module_feedback (modulo_id, user_id, tipo, valore, created_at, updated_at)
select modulo_id, user_id, 'tempo_studio', fascia, created_at, updated_at
from public.study_time_votes;

-- La vecchia tabella resta (rinominata e chiusa) per sicurezza; le sue
-- funzioni non servono più.
drop function public.cast_study_time_vote(text, text);
drop function public.study_time_counts(text);
alter table public.study_time_votes rename to study_time_votes_legacy;
revoke all on public.study_time_votes_legacy from anon, authenticated;
comment on table public.study_time_votes_legacy is
  'Archivio: voti sul tempo di studio prima di module_feedback (copiati lì il 2026-10-04). Non più usata.';
