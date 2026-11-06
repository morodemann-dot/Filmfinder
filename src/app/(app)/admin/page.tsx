import { notFound } from "next/navigation";
import ImportForm from "./ImportForm";
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
      </p>
      <p className="muted small">
        Jede Seite einer Liste enthält 20 Titel. Pro Durchgang höchstens 5 Seiten (= 100 Titel), damit der
        Server nicht zu lange braucht. Danach einfach mit der nächsten Startseite weitermachen.
        Doppelte Titel werden automatisch erkannt.
      </p>
      <ImportForm />
    </>
  );
}
