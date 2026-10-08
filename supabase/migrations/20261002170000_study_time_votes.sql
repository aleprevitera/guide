-- Voti sul tempo di studio per modulo (istogramma "E tu, quanto hai studiato?").
--
-- Modello di accesso:
--   * votare: solo utenti autenticati con email @universitadipavia.it
--     (login con codice via email; il dominio è imposto anche dall'hook
--     before-user-created più sotto). Un voto per studente e modulo,
--     modificabile.
--   * leggere il proprio voto: solo il proprietario (RLS).
--   * leggere la distribuzione: chiunque, ma solo come conteggi aggregati
--     tramite study_time_counts(); le singole righe non sono mai pubbliche.

-- ---------------------------------------------------------------------------
-- Tabella
-- ---------------------------------------------------------------------------

create table public.study_time_votes (
  -- id stabile del modulo (src/content/config.ts, MODULO_ID)
  modulo_id text not null check (modulo_id ~ '^m-[a-z0-9]{8}$'),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- deve restare identico a FASCE_STUDIO in src/lib/fasce.ts
  fascia text not null check (fascia in ('< 1 sett', '1–2 sett', '3–4 sett', '5–8 sett', '> 8 sett')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (modulo_id, user_id)
);

comment on table public.study_time_votes is
  'Un voto per studente e modulo sul tempo di studio. Righe private (RLS); conteggi pubblici via study_time_counts().';

-- La PK (modulo_id, user_id) copre i conteggi per modulo e la ricerca del
-- proprio voto; questo indice serve alla cascata da auth.users.
create index study_time_votes_user_id_idx on public.study_time_votes (user_id);

create function public.study_time_votes_touch_updated_at()
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

create trigger study_time_votes_touch_updated_at
before update on public.study_time_votes
for each row execute function public.study_time_votes_touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.study_time_votes enable row level security;

create policy "Lo studente legge il proprio voto"
on public.study_time_votes for select
to authenticated
using ((select auth.uid()) = user_id);

-- Il controllo sul dominio usa auth.jwt()->>'email', che viene da
-- auth.users.email (gestito da Supabase Auth), non da user_metadata.
create policy "Lo studente d'ateneo inserisce il proprio voto"
on public.study_time_votes for insert
to authenticated
with check (
  (select auth.uid()) = user_id
  and lower((select auth.jwt() ->> 'email')) like '%@universitadipavia.it'
);

create policy "Lo studente d'ateneo modifica il proprio voto"
on public.study_time_votes for update
to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and lower((select auth.jwt() ->> 'email')) like '%@universitadipavia.it'
);

-- Le nuove tabelle non sono esposte automaticamente alla Data API: permessi
-- espliciti e minimi. Nessun accesso per anon; update solo della fascia.
revoke all on public.study_time_votes from anon, authenticated;
grant select on public.study_time_votes to authenticated;
grant insert (modulo_id, fascia) on public.study_time_votes to authenticated;
grant update (fascia) on public.study_time_votes to authenticated;

-- ---------------------------------------------------------------------------
-- Voto (insert o sovrascrittura) — SECURITY INVOKER: valgono RLS e grant.
-- ---------------------------------------------------------------------------

create function public.cast_study_time_vote(p_modulo_id text, p_fascia text)
returns void
language sql
security invoker
set search_path = ''
as $$
  insert into public.study_time_votes (modulo_id, fascia)
  values (p_modulo_id, p_fascia)
  on conflict (modulo_id, user_id) do update set fascia = excluded.fascia;
$$;

revoke execute on function public.cast_study_time_vote(text, text) from public, anon;
grant execute on function public.cast_study_time_vote(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Conteggi aggregati — SECURITY DEFINER per contare anche i voti altrui,
-- ma restituisce solo (fascia, numero di voti) di un modulo: nessun user_id,
-- nessuna riga singola.
-- ---------------------------------------------------------------------------

create function public.study_time_counts(p_modulo_id text)
returns table (fascia text, voti bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select v.fascia, count(*)::bigint
  from public.study_time_votes v
  where v.modulo_id = p_modulo_id
  group by v.fascia;
$$;

revoke execute on function public.study_time_counts(text) from public;
grant execute on function public.study_time_counts(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hook Auth "before-user-created": solo account @universitadipavia.it.
-- Va attivato da Dashboard › Authentication › Hooks.
-- ---------------------------------------------------------------------------

create function public.hook_solo_account_ateneo(event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  email text := lower(coalesce(event -> 'user' ->> 'email', ''));
begin
  if email like '%@universitadipavia.it' then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'error', jsonb_build_object(
      'message', 'Accesso riservato agli account @universitadipavia.it.',
      'http_code', 403
    )
  );
end;
$$;

grant execute on function public.hook_solo_account_ateneo(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_solo_account_ateneo(jsonb) from public, anon, authenticated;
