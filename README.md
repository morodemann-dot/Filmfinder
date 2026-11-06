# Filmfinder – Stufe 1

Web-App zum Entdecken und Bewerten von Filmen und Serien. Läuft im Browser und lässt sich
auf dem iPhone wie eine App auf den Home-Bildschirm legen.

**Was Stufe 1 kann**
- Konto anlegen (nur mit Einladungscode) und anmelden
- **Entdecken:** Katalog nach Beliebtheit, Filter Film/Serie und Genre
- **Bewerten:** Schnell-Bewerten, ein Titel nach dem anderen (½ bis 5 Sterne)
- **Suche:** im eigenen Katalog und live bei TMDB, Treffer per Tipp hinzufügen
- **Bibliothek:** Gesehen, Merkliste, Kein Interesse, Nicht gesehen
- **Katalog füllen** (nur Admin): Listen von TMDB importieren

## Aufbau (wo liegt was?)

| Ordner / Datei | Bedeutung |
|---|---|
| `src/app/(app)/` | Die Seiten nach der Anmeldung (Entdecken, Bewerten, Suche, Bibliothek, Titel, Admin) |
| `src/app/login/` | Anmelde- und Registrierungsseite |
| `src/app/actions.ts` | Was passiert, wenn man Knöpfe drückt (Speichern, Import, Anmeldung) |
| `src/lib/tmdb.ts` | Verbindung zu TMDB |
| `src/lib/supabase/server.ts` | Verbindung zur Datenbank |
| `src/proxy.ts` | „Türsteher“: leitet nicht angemeldete Personen zur Anmeldung |
| `supabase/schema.sql` | Bauplan der Datenbank |

## Einrichtung

### 1. Supabase (Datenbank)
1. Auf https://supabase.com mit GitHub anmelden → **New project**, Region **Frankfurt (eu-central-1)**.
2. Links **SQL Editor** → Inhalt von `supabase/schema.sql` einfügen → **Run**.
3. **Project Settings → API Keys**: „Publishable key“ und „Secret key“ notieren.
   Die Projekt-URL steht unter **Project Settings → Data API**.

### 2. Vercel (Hosting)
1. Auf https://vercel.com mit GitHub anmelden → **Add New → Project** → Repository `filmfinder` importieren.
2. Unter **Environment Variables** alle Werte aus `.env.example` mit den echten Werten eintragen.
3. **Deploy**. Danach erhältst du eine Adresse wie `filmfinder-xyz.vercel.app`.

### 3. Loslegen
1. Adresse öffnen → **Neues Konto** mit deiner Admin-E-Mail und dem Einladungscode.
2. Oben **Katalog** → Listen importieren (z. B. je 5 Seiten von allen vier Listen ≈ 400 Titel).
3. Auf dem iPhone in Safari öffnen → Teilen-Symbol → **Zum Home-Bildschirm**.

## Lokal starten (optional, auf dem Mac)
```
npm install
cp .env.example .env.local   # Werte eintragen
npm run dev                  # dann http://localhost:3000 öffnen
```

## Hinweise
- TMDB-Daten dürfen höchstens 6 Monate gespeichert werden (Spalte `fetched_at`). Eine automatische
  Auffrischung kommt in einer späteren Stufe.
- This product uses the TMDB API but is not endorsed or certified by TMDB.
