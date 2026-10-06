-- Cancellazione dell'account dal sito (informativa privacy, diritto alla
-- cancellazione): lo studente elimina il proprio utente e, a cascata, tutti i
-- suoi feedback (module_feedback e study_time_votes_legacy hanno
-- "on delete cascade" su auth.users).
--
-- SECURITY DEFINER voluto: un utente non può cancellare righe di auth.users
-- con i propri privilegi. La funzione cancella solo l'utente che la chiama
-- (auth.uid()), non accetta parametri, non è eseguibile da anon.

create or replace function public.elimina_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Accesso richiesto' using errcode = '42501';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.elimina_account() from public, anon;
grant execute on function public.elimina_account() to authenticated;

comment on function public.elimina_account() is
  'Elimina l''utente che la chiama e, a cascata, i suoi feedback. Unica funzione SECURITY DEFINER insieme a feedback_counts.';
