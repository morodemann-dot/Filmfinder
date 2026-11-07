import { createClient, getUser } from "@/lib/supabase/server";
import { loadTasteData } from "@/lib/tasteData";
import MesstestView from "./MesstestView";

// Messtest: Wie treffsicher sind die Vorschläge – und welche Merkmale helfen wirklich?
export default async function MesstestPage() {
  const supabase = await createClient();
  const user = await getUser();
  const { rated } = await loadTasteData(supabase, user!.id, false);
  return <MesstestView rated={rated} />;
}
