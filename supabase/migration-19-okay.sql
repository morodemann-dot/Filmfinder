-- Ergänzung 19: Duell und Geschmacks-Check mit drei Stufen ("würde ich schauen" / "okay" / "passt nicht").
-- Einmal im Supabase "SQL Editor" ausführen.
alter table public.ai_duel drop constraint if exists ai_duel_answer_check;
alter table public.ai_duel add constraint ai_duel_answer_check check (answer in ('passt', 'okay', 'passt_nicht', 'gesehen'));
notify pgrst, 'reload schema';
