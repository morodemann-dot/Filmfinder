import Link from "next/link";
import BottomNav from "@/components/BottomNav";
import { ThemeToggle } from "@/components/ThemePicker";
import SettingsMenu from "@/components/SettingsMenu";
import { getUser, isAdmin } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { onboardingNeeded } from "@/app/onboarding-actions";

// Rahmen für alle Seiten nach der Anmeldung: Kopfzeile oben, Navigation unten.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  // Einstiegs-Tutorial: wer es noch nicht gemacht hat (auch bestehende Nutzer), sieht es zuerst
  if (user && (await onboardingNeeded())) redirect("/start");
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
    </>
  );
}
