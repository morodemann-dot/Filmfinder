-- Ergänzung 9: Qualitätsdaten von TMDB (Durchschnittsbewertung + Anzahl Stimmen).
-- Einmal im Supabase "SQL Editor" ausführen.
alter table public.titles add column if not exists vote_average real;
alter table public.titles add column if not exists vote_count   integer;
notify pgrst, 'reload schema';
