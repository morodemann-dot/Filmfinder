import { redirect } from "next/navigation";
import Onboarding from "./Onboarding";
import { myFavorites, onboardingNeeded } from "@/app/onboarding-actions";
import { getUser } from "@/lib/supabase/server";

// Einstiegs-Tutorial (wird beim ersten Öffnen gezeigt; ?neu=1 zeigt es erneut)
export default async function StartPage({ searchParams }: { searchParams: Promise<{ neu?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { neu } = await searchParams;
  if (!neu && !(await onboardingNeeded())) redirect("/");
  return (
    <div className="shell onboarding">
      <Onboarding initialFavorites={await myFavorites()} />
    </div>
  );
}
