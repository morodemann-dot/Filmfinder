import { notFound } from "next/navigation";
import FilmNet from "./FilmNet";
import { createClient, getUser, isAdmin } from "@/lib/supabase/server";
import { loadTasteData } from "@/lib/tasteData";
import { buildNet } from "@/lib/filmNet";

export const maxDuration = 60;

// Filmnetz (nur Admin): Filme, verbunden über gemeinsame Merkmale
export default async function NetPage() {
  const user = await getUser();
  if (!isAdmin(user?.email)) notFound();
  const { catalog } = await loadTasteData(await createClient(), user!.id);
  const { nodes, edges, genres } = buildNet(catalog);
  return <FilmNet nodes={nodes} edges={edges} genres={genres} />;
}
