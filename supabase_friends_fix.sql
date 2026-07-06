-- ============================================================
-- CaillouDEX — Réparation "Ajouter un ami : Pseudo introuvable"
-- À exécuter UNE fois dans Supabase → SQL Editor (sur PC de préférence).
-- Sans danger : ne supprime rien, ne fait que créer/compléter.
-- ============================================================

-- 1) Table publique des pseudos (miroir lisible par tout le monde)
create table if not exists public.profiles (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  username text unique
);

alter table public.profiles enable row level security;

-- Tout le monde peut CHERCHER un pseudo (nécessaire pour ajouter un ami)
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select using (true);

-- Chacun ne peut écrire QUE sa propre ligne
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (auth.uid() = user_id);

-- 2) Backfill : copie tous les pseudos déjà définis (anciens comptes)
insert into public.profiles (user_id, username)
select user_id, username
from public.player_meta
where username is not null
on conflict (user_id) do update set username = excluded.username;
