import { notFound } from "next/navigation";
import { DirectorForm, HollywoodForm } from "./ImportForm";
import { removeAllSeries } from "@/app/actions";
import { createAdminClient, getUser, isAdmin } from "@/lib/supabase/server";

// Der Import darf bis zu 60 Sekunden dauern.
export const maxDuration = 60;

// Katalog-Verwaltung: nur für Admins (E-Mail steht in ADMIN_EMAILS).
export default async function AdminPage() {
  const user = await getUser();
  if (!isAdmin(user?.email)) notFound();

  const admin = createAdminClient();
  const [movies, shows] = await Promise.all([
    admin.from("titles").select("id", { count: "exact", head: true }).eq("media_type", "movie"),
    admin.from("titles").select("id", { count: "exact", head: true }).eq("media_type", "tv"),
  ]);

  return (
    <>
      <h1>Katalog füllen</h1>
      <p className="muted">
        Aktuell: <strong>{movies.count ?? 0}</strong> Filme und <strong>{shows.count ?? 0}</strong> Serien.
        Doppelte Titel werden automatisch erkannt.
      </p>

      <div style={{ display: "grid", gap: 16 }}>
        <HollywoodForm />
        <DirectorForm />

        {(shows.count ?? 0) > 0 && (
          <form action={removeAllSeries} className="panel">
            <h2 style={{ marginTop: 0 }}>Serien entfernen</h2>
            <p className="muted small" style={{ marginTop: 0 }}>
              Entfernt alle {shows.count} Serien aus dem Katalog – inklusive aller Bewertungen dazu.
              Das lässt sich nicht rückgängig machen.
            </p>
            <button className="btn">Alle Serien entfernen</button>
          </form>
        )}
      </div>
    </>
  );
}
