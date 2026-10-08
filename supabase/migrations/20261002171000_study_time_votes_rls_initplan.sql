-- Advisor "auth_rls_initplan": auth.jwt() va racchiuso da solo in una
-- subquery, così Postgres lo valuta una volta per query e non per riga.

alter policy "Lo studente d'ateneo inserisce il proprio voto"
on public.study_time_votes
with check (
  (select auth.uid()) = user_id
  and lower((select auth.jwt()) ->> 'email') like '%@universitadipavia.it'
);

alter policy "Lo studente d'ateneo modifica il proprio voto"
on public.study_time_votes
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and lower((select auth.jwt()) ->> 'email') like '%@universitadipavia.it'
);
