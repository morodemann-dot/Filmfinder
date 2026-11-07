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
  vote_average      real,                             -- TMDB-Durchschnitt (0–10)
  vote_count        integer,                          -- Anzahl Stimmen bei TMDB
  directors         text[] not null default '{}',   -- Regie (bei Serien: Schöpfer)
  studios           text[] not null default '{}',   -- Produktionsfirmen
  collection_id     integer,                          -- Filmreihe (TMDB)
  collection_name   text,
  imdb_id           text,                             -- z. B. tt0111161
  cast_names        text[] not null default '{}',   -- Hauptbesetzung
  oscars            text[] not null default '{}',   -- gewonnene Oscar-Kategorien (seit 1980)
  globes            text[] not null default '{}',   -- gewonnene Golden-Globe-Kategorien
  festivals         text[] not null default '{}',   -- Festival-/BAFTA-Gewinne
  canon             text[] not null default '{}',   -- Kritiker-Kanon (Criterion, National Film Registry)
  keywords          text[],                           -- TMDB-Stichworte (null = noch nicht geladen)
  writers           text[] not null default '{}',
  cinematographers  text[] not null default '{}',
  composers         text[] not null default '{}',
  certification_de  text,                             -- FSK
  based_on          text[] not null default '{}',   -- Wikidata: basiert auf …
  wd_genres         text[] not null default '{}',   -- Wikidata: feinere Genres
  narrative_locations text[] not null default '{}', -- Wikidata: Handlungsort
  set_in_period     text[] not null default '{}',   -- Wikidata: Zeit der Handlung
  main_subjects     text[] not null default '{}',   -- Wikidata: Hauptthema
  wikidata_checked_at timestamptz,
  black_and_white   boolean,                          -- Wikidata: Schwarzweiß
  budget_usd        bigint,                           -- Wikidata: Budget (US-$)
  box_office_usd    bigint,                           -- Wikidata: Einspielergebnis (US-$)
  nominations       text[] not null default '{}',   -- Wikidata: Nominierungen
  filming_locations text[] not null default '{}',   -- Wikidata: Drehorte
  wikidata_version  smallint,
  kept_at           timestamptz,                      -- beim Aussortieren geprüft & behalten
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

-- ---------------------------------------------------------------------
-- 5) Entdecken-Abfrage
-- ---------------------------------------------------------------------
create index if not exists titles_created_idx on public.titles (created_at desc);

-- Liefert Titel, die die angemeldete Person noch NICHT eingeordnet hat – gefiltert und sortiert.
create or replace function public.discover_titles(
  p_media  text default null,   -- 'movie' / 'tv' / null = alle
  p_genre  text default null,
  p_decade int  default null,   -- z. B. 1990
  p_sort   text default 'beliebt', -- beliebt | neu | preise | jahr_neu | jahr_alt
  p_limit  int  default 60,
  p_offset int  default 0
) returns setof public.titles
language sql stable security invoker set search_path = public as $$
  select t.* from public.titles t
  where (p_media is null or t.media_type = p_media)
    and (p_genre is null or p_genre = any (t.genres))
    and (p_decade is null or (t.release_year >= p_decade and t.release_year < p_decade + 10))
    and (p_sort <> 'preise' or cardinality(t.oscars) + cardinality(t.globes) > 0)
    and not exists (
      select 1 from public.user_title_feedback f
      where f.title_id = t.id and f.user_id = (select auth.uid())
    )
  order by
    case when p_sort = 'neu' then t.created_at end desc nulls last,
    case when p_sort = 'preise' then cardinality(t.oscars) + cardinality(t.globes) end desc nulls last,
    case when p_sort = 'jahr_neu' then t.release_year end desc nulls last,
    case when p_sort = 'jahr_alt' then t.release_year end asc nulls last,
    t.popularity desc nulls last,
    t.id
  limit least(p_limit, 200) offset greatest(p_offset, 0);
$$;
grant execute on function public.discover_titles(text, text, int, text, int, int) to authenticated;

notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------
-- 6) Sperrliste: bewusst entfernte Filme werden nicht erneut importiert
-- ---------------------------------------------------------------------
create table if not exists public.excluded_titles (
  media_type  text not null,
  tmdb_id     integer not null,
  title       text,
  excluded_at timestamptz not null default now(),
  primary key (media_type, tmdb_id)
);
alter table public.excluded_titles enable row level security;

-- Zentrale Regeln für alle Importe (genau eine Zeile)
create table if not exists public.catalog_settings (
  id            integer primary key default 1 check (id = 1),
  min_rating    real    not null default 6.3,
  min_votes     integer not null default 1500,
  series_exempt boolean not null default true,  -- Filmreihen dürfen schwächere Teile enthalten
  updated_at    timestamptz not null default now()
);
insert into public.catalog_settings (id) values (1) on conflict (id) do nothing;
alter table public.catalog_settings enable row level security;

-- Vorschau: neue Kandidaten warten hier, bis sie angenommen oder abgelehnt werden
create table if not exists public.import_candidates (
  id         bigint generated always as identity primary key,
  media_type text not null,
  tmdb_id    integer not null,
  row        jsonb not null,           -- alle Filmdaten, fertig für den Katalog
  source     text,                     -- z. B. "Festival-Gewinner"
  status     text not null default 'offen' check (status in ('offen', 'angenommen', 'abgelehnt')),
  created_at timestamptz not null default now(),
  unique (media_type, tmdb_id)
);
create index if not exists import_candidates_status_idx on public.import_candidates (status, created_at desc);
alter table public.import_candidates enable row level security;

create table if not exists public.title_features (
  title_id      bigint not null references public.titles (id) on delete cascade,
  model         text not null,                -- 'haiku' oder 'sonnet'
  features      jsonb not null,               -- Stimmung, Tempo, Komplexität …
  had_plot      boolean not null default false, -- lag eine Wikipedia-Handlung vor?
  input_tokens  integer not null default 0,   -- für die Kostenübersicht
  output_tokens integer not null default 0,
  created_at    timestamptz not null default now(),
  primary key (title_id, model)
);
alter table public.title_features enable row level security;
drop policy if exists "KI-Merkmale lesen" on public.title_features;
create policy "KI-Merkmale lesen" on public.title_features for select to authenticated using (true);
notify pgrst, 'reload schema';
-- Antworten hier fließen NICHT in das Geschmacksprofil ein.
create table if not exists public.ai_duel (
  user_id     uuid not null references auth.users (id) on delete cascade,
  title_id    bigint not null references public.titles (id) on delete cascade,
  picked_by   text[] not null default '{}',   -- welche Quellen den Film vorgeschlagen haben (ohne, haiku, sonnet)
  answer      text check (answer in ('passt', 'passt_nicht', 'gesehen')),
  answered_at timestamptz,
  created_at  timestamptz not null default now(),
  primary key (user_id, title_id)
);
alter table public.ai_duel enable row level security; -- keine Regeln = nur der Server der App
notify pgrst, 'reload schema';
-- Was hat gefallen / gestört (z. B. "+regie:Christopher Nolan", "-aspekt:langatmig")
alter table public.user_title_feedback add column if not exists aspects text[] not null default '{}';

-- "Heute nicht" / "Vielleicht später": Film für eine Weile ausblenden
create table if not exists public.snoozed (
  user_id  uuid not null references auth.users (id) on delete cascade,
  title_id bigint not null references public.titles (id) on delete cascade,
  until    timestamptz not null,
  primary key (user_id, title_id)
);
alter table public.snoozed enable row level security;
drop policy if exists "Eigene Pausen" on public.snoozed;
create policy "Eigene Pausen" on public.snoozed for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Profil: Anzeigename + Freigabe fürs gemeinsame Schauen (freiwillig)
create table if not exists public.profiles (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  display_name   text,
  share_together boolean not null default false,
  updated_at     timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "Eigenes Profil" on public.profiles;
create policy "Eigenes Profil" on public.profiles for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

notify pgrst, 'reload schema';
alter table public.user_title_feedback add column if not exists favorite boolean not null default false;
notify pgrst, 'reload schema';
alter table public.titles add column if not exists tmdb_recs integer[];          -- TMDB-IDs der empfohlenen Filme (beste zuerst)
alter table public.titles add column if not exists recs_checked_at timestamptz;  -- wann zuletzt abgeholt
notify pgrst, 'reload schema';
