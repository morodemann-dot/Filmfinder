import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Diese Einstellungen müssen bei Vercel unter "Environment Variables" stehen.
const REQUIRED = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "TMDB_READ_TOKEN",
  "INVITE_CODE",
  "ADMIN_EMAILS",
];

// Zeigt eine verständliche Fehlerseite statt "Internal Server Error".
// Es werden nur NAMEN angezeigt, niemals die geheimen Werte.
function setupError(lines: string[]) {
  const html = `<!doctype html><html lang="de"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Filmfinder – Einrichtung</title>
<body style="font-family:system-ui;background:#0f0d0c;color:#f3ece4;padding:24px;max-width:640px;margin:auto;line-height:1.5">
<h1 style="color:#f0a63a">Einrichtung noch nicht vollständig</h1>
<ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>
<p style="color:#a89c90">Bei Vercel: Project → Settings → Environment Variables korrigieren,
danach unter Deployments beim neuesten Eintrag „…“ → <b>Redeploy</b> klicken.</p>
</body></html>`;
  return new NextResponse(html, { status: 500, headers: { "content-type": "text/html; charset=utf-8" } });
}

// Der "Türsteher": läuft vor jeder Seite.
// Er hält die Anmeldung frisch und schickt nicht angemeldete Personen zur Anmeldeseite.
export async function proxy(request: NextRequest) {
  const missing = REQUIRED.filter((n) => !process.env[n]?.trim());
  if (missing.length) {
    return setupError(missing.map((n) => `Fehlt oder ist leer: <code>${n}</code>`));
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    return setupError([
      "<code>NEXT_PUBLIC_SUPABASE_URL</code> sieht falsch aus. Sie sollte so aussehen: <code>https://abcdefgh.supabase.co</code> (ohne weitere Zusätze dahinter).",
    ]);
  }

  // Schlüssel dürfen nur "normale" Zeichen enthalten (keine Pfeile, Leerzeichen, Anführungszeichen).
  const keyProblems: string[] = [];
  const checkKey = (name: string, prefixes: string[], hint: string) => {
    const v = process.env[name]!.trim();
    if (!/^[A-Za-z0-9_.\-]+$/.test(v)) {
      keyProblems.push(`<code>${name}</code> enthält unerlaubte Zeichen (z. B. Leerzeichen, Pfeile „→“ oder Anführungszeichen). Bitte nur den reinen Schlüssel einfügen. ${hint}`);
    } else if (!prefixes.some((p) => v.startsWith(p))) {
      keyProblems.push(`<code>${name}</code> hat den falschen Anfang. ${hint}`);
    }
  };
  checkKey("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", ["sb_publishable_", "eyJ"], "Er beginnt mit <code>sb_publishable_</code>.");
  checkKey("SUPABASE_SECRET_KEY", ["sb_secret_", "eyJ"], "Er beginnt mit <code>sb_secret_</code>.");
  checkKey("TMDB_READ_TOKEN", ["eyJ"], "Gemeint ist der lange „API Read Access Token“ von TMDB, er beginnt mit <code>eyJ</code>.");
  if (keyProblems.length) return setupError(keyProblems);

  let response = NextResponse.next({ request });

  try {
    const supabase = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim(), {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });

    const { data } = await supabase.auth.getUser();
    const path = request.nextUrl.pathname;
    const isPublic = path.startsWith("/login") || path.startsWith("/ueber");

    if (!data.user && !isPublic) {
      const to = request.nextUrl.clone();
      to.pathname = "/login";
      return NextResponse.redirect(to);
    }
    return response;
  } catch (e) {
    return setupError([
      "Die Verbindung zu Supabase ist fehlgeschlagen. Bitte URL und Publishable key prüfen.",
      `Technische Meldung: <code>${String(e instanceof Error ? e.message : e).replace(/</g, "&lt;")}</code>`,
    ]);
  }
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon|apple-icon|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)",
  ],
};
