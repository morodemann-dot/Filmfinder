-- Ergänzung 10: Katalog-Regeln, Import-Vorschau, Festival-/Kanon-Kennzeichnung.
-- Einmal im Supabase "SQL Editor" ausführen.

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

-- Auszeichnungen/Listen am Film (für Anzeige und als Ausnahme von der Qualitätsschwelle)
alter table public.titles add column if not exists festivals text[] not null default '{}';
alter table public.titles add column if not exists canon     text[] not null default '{}';

notify pgrst, 'reload schema';
