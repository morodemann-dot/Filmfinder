import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { logout } from "@/app/actions";
import { getUser, isAdmin } from "@/lib/supabase/server";

// Rahmen für alle Seiten nach der Anmeldung: Kopfzeile oben, Navigation unten.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <>
      <div className="shell">
        <header className="topbar">
          <Link href="/" className="brand">
            Film<span>finder</span>
          </Link>
          <div className="row small">
            {isAdmin(user?.email) && (
              <Link href="/admin" className="muted">Katalog</Link>
            )}
            <Link href="/ueber" className="muted">Über</Link>
            <form action={logout}>
              <button className="btn ghost small" style={{ minHeight: 36 }}>Abmelden</button>
            </form>
          </div>
        </header>
        {children}
      </div>
      <BottomNav />
    </>
  );
}
