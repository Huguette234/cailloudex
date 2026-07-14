-- ============================================================
-- CaillouDEX — Activation de l'ESPACE ADMIN
-- À exécuter UNE fois dans Supabase → SQL Editor (sur PC).
-- Donne à TON compte (email vérifié) le droit de lire/gérer les
-- données de tous les joueurs. Sans danger pour les autres joueurs :
-- seul l'email ci-dessous est autorisé (vérifié côté serveur par Supabase).
-- ============================================================

-- >>> Remplace l'email si besoin <<<
-- (doit correspondre exactement à ADMIN_EMAIL dans index.html)

-- Fonction pratique : est-ce que l'appelant est l'admin ?
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(lower(auth.jwt() ->> 'email') = lower('hdalainecastets@gmail.com'), false);
$$;

-- Politiques admin : lecture + gestion de toutes les lignes, pour l'admin uniquement.
-- (Les politiques "own" existantes restent en place pour les joueurs normaux.)

-- player_meta
drop policy if exists admin_all_player_meta on public.player_meta;
create policy admin_all_player_meta on public.player_meta
  for all using (public.is_admin()) with check (public.is_admin());

-- rocks
drop policy if exists admin_all_rocks on public.rocks;
create policy admin_all_rocks on public.rocks
  for all using (public.is_admin()) with check (public.is_admin());

-- profiles
drop policy if exists admin_all_profiles on public.profiles;
create policy admin_all_profiles on public.profiles
  for all using (public.is_admin()) with check (public.is_admin());

-- friends (si la table existe)
drop policy if exists admin_all_friends on public.friends;
create policy admin_all_friends on public.friends
  for all using (public.is_admin()) with check (public.is_admin());

-- reports (signalements)
drop policy if exists admin_all_reports on public.reports;
create policy admin_all_reports on public.reports
  for all using (public.is_admin()) with check (public.is_admin());

-- app_errors (logs)
drop policy if exists admin_all_app_errors on public.app_errors;
create policy admin_all_app_errors on public.app_errors
  for all using (public.is_admin()) with check (public.is_admin());

-- scan_log (compteur de scans)
drop policy if exists admin_read_scan_log on public.scan_log;
create policy admin_read_scan_log on public.scan_log
  for select using (public.is_admin());

-- ============================================================
-- ANNONCES : table de config globale, lisible par tous, modifiable par l'admin
-- ============================================================
create table if not exists public.app_config (
  id int primary key default 1,
  announcement text,
  updated_at timestamptz default now()
);
insert into public.app_config (id) values (1) on conflict (id) do nothing;

alter table public.app_config enable row level security;

drop policy if exists app_config_read on public.app_config;
create policy app_config_read on public.app_config
  for select using (true);

drop policy if exists app_config_admin_write on public.app_config;
create policy app_config_admin_write on public.app_config
  for all using (public.is_admin()) with check (public.is_admin());
