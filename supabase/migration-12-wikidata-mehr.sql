-- Ergänzung 12: Weitere Wikidata-Infos. Einmal im Supabase "SQL Editor" ausführen.
alter table public.titles add column if not exists black_and_white   boolean;                       -- Schwarzweiß-Film
alter table public.titles add column if not exists budget_usd        bigint;                        -- Budget in US-Dollar
alter table public.titles add column if not exists box_office_usd    bigint;                        -- Einspielergebnis (möglichst weltweit) in US-Dollar
alter table public.titles add column if not exists nominations       text[] not null default '{}';  -- Nominierungen (Preise)
alter table public.titles add column if not exists filming_locations text[] not null default '{}';  -- Drehorte
alter table public.titles add column if not exists wikidata_version  smallint;                      -- welche Wikidata-Abfrage zuletzt lief
notify pgrst, 'reload schema';
