-- ===== ROCKS (le dex de chaque joueur) =====
create table public.rocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  catalog_number int not null,
  name text not null,
  personality text,
  quip text,
  special_move text,
  rock_type text,
  type_label text,
  type_color text,
  location text,
  rarity text,
  rarity_label text,
  hex text,
  atk int,
  def int,
  vit int,
  ai_generated boolean default false,
  size_cm numeric,
  photo text,
  anime_photo text,
  character_photo text,
  char_gen_count int default 0,
  upgrade_level int default 0,
  evolved boolean default false,
  color_category text,
  shiny boolean default false,
  created_at timestamptz default now()
);

alter table public.rocks enable row level security;

create policy "rocks_select_own" on public.rocks for select using (auth.uid() = user_id);
create policy "rocks_insert_own" on public.rocks for insert with check (auth.uid() = user_id);
create policy "rocks_update_own" on public.rocks for update using (auth.uid() = user_id);
create policy "rocks_delete_own" on public.rocks for delete using (auth.uid() = user_id);

-- ===== PLAYER META (streak, badges, victoires...) =====
create table public.player_meta (
  user_id uuid primary key references auth.users(id) on delete cascade,
  streak int default 0,
  last_capture_date date,
  badges text[] default '{}',
  shared int default 0,
  today_challenge jsonb,
  challenge_date date,
  challenge_completed_date date,
  wins int default 0,
  losses int default 0,
  xp int default 0,
  gravillons int default 0,
  gems int default 0,
  inventory jsonb default '{}'::jsonb,
  food jsonb default '{}'::jsonb,
  lucky_boost_until timestamptz,
  streak_freeze_count int default 0,
  owned_frames jsonb default '[]'::jsonb,
  equipped_frame text,
  custom_title text,
  username text,
  updated_at timestamptz default now()
);

alter table public.player_meta enable row level security;

create policy "meta_select_own" on public.player_meta for select using (auth.uid() = user_id);
create policy "meta_insert_own" on public.player_meta for insert with check (auth.uid() = user_id);
create policy "meta_update_own" on public.player_meta for update using (auth.uid() = user_id);

-- ===== SCAN LOG (limite IA 20/jour — géré uniquement par la fonction serveur) =====
create table public.scan_log (
  user_id uuid not null references auth.users(id) on delete cascade,
  scan_date date not null default current_date,
  count int not null default 0,
  primary key (user_id, scan_date)
);

alter table public.scan_log enable row level security;
-- Pas de policy ici volontairement : seule la clé "service_role" (utilisée par l'Edge Function)
-- peut lire/écrire cette table. Les joueurs ne peuvent jamais la modifier eux-mêmes.
