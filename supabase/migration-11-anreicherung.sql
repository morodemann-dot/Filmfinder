-- Ergänzung 11: Mehr Daten pro Film (TMDB + Wikidata). Einmal im Supabase "SQL Editor" ausführen.
-- TMDB
alter table public.titles add column if not exists keywords          text[];   -- leer = noch nicht geladen
alter table public.titles add column if not exists writers           text[] not null default '{}';
alter table public.titles add column if not exists cinematographers  text[] not null default '{}';
alter table public.titles add column if not exists composers         text[] not null default '{}';
alter table public.titles add column if not exists certification_de  text;     -- FSK
-- Wikidata
alter table public.titles add column if not exists based_on            text[] not null default '{}';
alter table public.titles add column if not exists wd_genres           text[] not null default '{}';
alter table public.titles add column if not exists narrative_locations text[] not null default '{}';
alter table public.titles add column if not exists set_in_period       text[] not null default '{}';
alter table public.titles add column if not exists main_subjects       text[] not null default '{}';
alter table public.titles add column if not exists wikidata_checked_at timestamptz;
notify pgrst, 'reload schema';
