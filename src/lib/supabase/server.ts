import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Verbindung zur Datenbank "im Namen" der angemeldeten Person.
// Die Zugriffsregeln (RLS) sorgen dafür, dass sie nur ihre eigenen Daten sieht.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // In reinen Anzeige-Seiten dürfen keine Cookies gesetzt werden – das übernimmt proxy.ts.
          }
        },
      },
    },
  );
}

// Verbindung mit dem GEHEIMEN Schlüssel. Nur auf dem Server benutzen!
// Wird gebraucht, um Titel in den Katalog zu schreiben und Konten anzulegen.
export function createAdminClient() {
  return createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    process.env.SUPABASE_SECRET_KEY!.trim(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// Gibt die angemeldete Person zurück (oder null).
export async function getUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export function isAdmin(email: string | undefined | null) {
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && admins.includes(email.toLowerCase());
}
