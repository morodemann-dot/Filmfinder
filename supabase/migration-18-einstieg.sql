-- Ergänzung 18: Einstiegs-Tutorial (Lieblingsfilme + Geschmacks-Check). Einmal im Supabase "SQL Editor" ausführen.
-- Wer das Tutorial noch nicht abgeschlossen hat, sieht es beim nächsten Öffnen der App.
alter table public.profiles add column if not exists onboarding_done_at timestamptz;
notify pgrst, 'reload schema';
