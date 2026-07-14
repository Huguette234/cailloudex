-- ============================================================
-- CaillouDEX — Correctif "permission denied for table reports/app_errors"
-- À exécuter dans Supabase → SQL Editor (après supabase_admin.sql).
-- Les tables reports/app_errors/app_config ont été créées sans droits de
-- table pour le rôle authenticated ; on les accorde ici. La sécurité reste
-- assurée par les politiques RLS (déjà en place) : seul l'admin lit/gère.
-- ============================================================

grant select, insert, update, delete on public.reports to authenticated;
grant select, insert, update, delete on public.app_errors to authenticated;
grant select, insert, update, delete on public.app_config to authenticated;

-- RLS activé (idempotent) — les données restent filtrées par les politiques
alter table public.reports enable row level security;
alter table public.app_errors enable row level security;

-- Les joueurs peuvent continuer à signaler / logger (mais pas lire)
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated with check (auth.uid() = reporter_id);

drop policy if exists app_errors_insert on public.app_errors;
create policy app_errors_insert on public.app_errors
  for insert to authenticated with check (true);
