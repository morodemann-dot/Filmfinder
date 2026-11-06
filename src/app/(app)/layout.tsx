import Link from "next/link";
import { Suspense } from "react";
import BottomNav from "@/components/BottomNav";
import ScrollReset from "@/components/ScrollReset";
import { logout } from "@/app/actions";
import { getUser, isAdmin } from "@/lib/supabase/server";

// Rahmen für alle Seiten nach der Anmeldung – aufgebaut wie eine iPhone-App:
// oben scrollt der Inhalt, unten steht die Leiste fest im Rahmen (nicht "angeheftet"),
// damit sie auf iOS nie verrutscht.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  return (
    <div className="app">
      <main className="scroller">
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="brand">
              Film<span>finder</span>
            </Link>
            <div className="links">
              {isAdmin(user?.email) && (
                <Link href="/admin">Katalog</Link>
              )}
              <Link href="/ueber">Über</Link>
              <form action={logout}>
                <button className="btn ghost" style={{ minHeight: 30, padding: 0, fontSize: "0.85rem" }}>Abmelden</button>
              </form>
            </div>
          </header>
          {children}
        </div>
      </main>
      <BottomNav />
      <Suspense>
        <ScrollReset />
      </Suspense>
    </div>
  );
}
