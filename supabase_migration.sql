-- ============================================================
-- MIGRATION CaillouDEX — colonnes manquantes
-- ------------------------------------------------------------
-- A executer une fois dans Supabase : Dashboard > SQL Editor > New query
-- 100% sans risque : "IF NOT EXISTS" ignore les colonnes deja presentes,
-- et aucune donnee existante n'est modifiee ni supprimee.
--
-- Corrige le bug ou saveMeta() echouait (colonnes absentes) :
--   -> defi du jour qui se reinitialisait, statut "defi releve" non garde,
--      inventaire / cadres de boutique / titre personnalise non sauvegardes.
-- ============================================================

-- ----- player_meta -----
alter table public.player_meta add column if not exists challenge_completed_date date;
alter table public.player_meta add column if not exists xp                    int         default 0;
alter table public.player_meta add column if not exists gravillons            int         default 0;
alter table public.player_meta add column if not exists gems                  int         default 0;
alter table public.player_meta add column if not exists inventory             jsonb       default '{}'::jsonb;
alter table public.player_meta add column if not exists food                  jsonb       default '{}'::jsonb;
alter table public.player_meta add column if not exists lucky_boost_until     timestamptz;
alter table public.player_meta add column if not exists streak_freeze_count   int         default 0;
alter table public.player_meta add column if not exists owned_frames          jsonb       default '[]'::jsonb;
alter table public.player_meta add column if not exists equipped_frame        text;
alter table public.player_meta add column if not exists custom_title          text;
alter table public.player_meta add column if not exists username              text;

-- ----- rocks (par securite, memes colonnes que l'app) -----
alter table public.rocks add column if not exists size_cm         numeric;
alter table public.rocks add column if not exists character_photo text;
alter table public.rocks add column if not exists char_gen_count  int     default 0;
alter table public.rocks add column if not exists upgrade_level   int     default 0;
alter table public.rocks add column if not exists evolved         boolean default false;
alter table public.rocks add column if not exists color_category  text;
alter table public.rocks add column if not exists shiny           boolean default false;
