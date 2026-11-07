import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import Welcome from "@/components/Welcome";
import { ThemeToggle } from "@/components/ThemePicker";
import SettingsMenu from "@/components/SettingsMenu";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";

// Rahmen für alle Seiten nach der Anmeldung: Kopfzeile oben, Navigation unten.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  // Für die Begrüßung neuer Nutzer: wie viele Filme wurden schon mit Punkten bewertet?
  const { count: ratedCount } = user
    ? await (await createClient())
        .from("user_title_feedback").select("title_id", { count: "exact", head: true })
        .eq("user_id", user.id).not("rating", "is", null)
    : { count: 0 };
  return (
    <>
      <div className="shell">
        <header className="topbar">
          <Link href="/" className="brand">
            Film<span>finder</span>
          </Link>
          <div className="links">
            <ThemeToggle />
            <SettingsMenu admin={isAdmin(user?.email)} />
          </div>
        </header>
        {children}
      </div>
      <BottomNav />
      <Welcome ratedCount={ratedCount ?? 0} />
    </>
  );
}
