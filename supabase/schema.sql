-- =====================================================================
-- FILMFINDER – Datenbank-Bauplan, Stufe 1
-- Diesen gesamten Text im Supabase "SQL Editor" einfügen und auf "Run" klicken.
-- Er legt die "Schubladen" (Tabellen) an, in denen die App ihre Daten speichert.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Titel-Katalog: ein Eintrag pro Film oder Serie
--    Die Spalten entsprechen den Merkmalen M001–M010 aus der Spezifikation.
--    Fehlende Werte bleiben leer (null) = "unbekannt".
-- ---------------------------------------------------------------------
create table if not exists public.titles (
  id                bigint generated always as identity primary key,
  media_type        text not null check (media_type in ('movie', 'tv')),
  tmdb_id           integer not null,
  title             text not null,                       -- M001 Titel
  original_title    text,                                -- M002 Originaltitel
  format            text check (format in ('Film', 'Serie', 'Miniserie', 'Special')), -- M003
  release_year      integer,                             -- M004 Erscheinungsjahr
  genres            text[] not null default '{}',        -- M005 Genres
  original_language text,                                -- M006 Originalsprache
  countries         text[] not null default '{}',        -- M007 Produktionsländer
  runtime_seconds   integer,                             -- M009 bzw. M065 (Episodenlänge)
  seasons           integer,                             -- M010 Serienumfang
  episodes          integer,                             -- M010 Serienumfang
  series_status     text,                                -- M066 Serienabschlussstatus
  overview          text,                                -- Kurzbeschreibung (nur Anzeige)
  poster_path       text,                                -- Plakat (Bild liegt bei TMDB)
  popularity        real,
  directors         text[] not null default '{}',   -- Regie (bei Serien: Schöpfer)
  studios           text[] not null default '{}',   -- Produktionsfirmen
  collection_id     integer,                          -- Filmreihe (TMDB)
  collection_name   text,
  imdb_id           text,                             -- z. B. tt0111161
  oscars            text[] not null default '{}',   -- gewonnene Oscar-Kategorien (seit 1980)
  globes            text[] not null default '{}',   -- gewonnene Golden-Globe-Kategorien
  metadata_source   text not null default 'tmdb',
  fetched_at        timestamptz not null default now(),  -- TMDB: max. 6 Monate speichern, dann auffrischen
  created_at        timestamptz not null default now(),
  unique (media_type, tmdb_id)
);

create index if not exists titles_popularity_idx on public.titles (popularity desc);
create index if not exists titles_title_search_idx
  on public.titles using gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(original_title,'')));

-- ---------------------------------------------------------------------
-- 2) Persönliche Bibliothek: was jede Person mit einem Titel gemacht hat
--    status:  merkliste           = nicht gesehen, aber interessiert
--             gesehen             = gesehen (mit oder ohne Bewertung)
--             nicht_gesehen       = kenne ich nicht / noch nicht gesehen (beim Schnellbewerten)
--             nicht_interessiert  = bitte nicht empfehlen
--    rating:  1–10 (= 0,5 bis 5 Sterne), nur bei "gesehen"
-- ---------------------------------------------------------------------
create table if not exists public.user_title_feedback (
  user_id    uuid not null references auth.users (id) on delete cascade,
  title_id   bigint not null references public.titles (id) on delete cascade,
  status     text not null check (status in ('merkliste', 'gesehen', 'nicht_gesehen', 'nicht_interessiert')),
  rating     smallint check (rating between 1 and 10),
  reason     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, title_id),
  check (rating is null or status = 'gesehen')
);

create index if not exists feedback_user_idx on public.user_title_feedback (user_id, updated_at desc);

-- ---------------------------------------------------------------------
-- 3) Zugriffsregeln (Row Level Security)
--    Jede Person sieht und ändert NUR ihre eigenen Bewertungen.
--    Den Katalog dürfen alle angemeldeten Personen lesen; neue Titel
--    schreibt nur der Server der App (mit dem geheimen Schlüssel).
-- ---------------------------------------------------------------------
alter table public.titles enable row level security;
alter table public.user_title_feedback enable row level security;

drop policy if exists "Katalog lesen" on public.titles;
create policy "Katalog lesen" on public.titles
  for select to authenticated using (true);

drop policy if exists "Eigene Bewertungen lesen" on public.user_title_feedback;
create policy "Eigene Bewertungen lesen" on public.user_title_feedback
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Eigene Bewertungen anlegen" on public.user_title_feedback;
create policy "Eigene Bewertungen anlegen" on public.user_title_feedback
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Eigene Bewertungen ändern" on public.user_title_feedback;
create policy "Eigene Bewertungen ändern" on public.user_title_feedback
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Eigene Bewertungen löschen" on public.user_title_feedback;
create policy "Eigene Bewertungen löschen" on public.user_title_feedback
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------
-- 4) Filmreihen: merkt sich, welche Reihen schon auf Vollständigkeit geprüft wurden.
--    Keine Regeln (policies) = nur der Server der App darf darauf zugreifen.
-- ---------------------------------------------------------------------
create table if not exists public.collections (
  id         integer primary key,
  name       text,
  checked_at timestamptz
);
alter table public.collections enable row level security;
create index if not exists titles_collection_idx on public.titles (collection_id);

create index if not exists titles_imdb_idx on public.titles (imdb_id);
