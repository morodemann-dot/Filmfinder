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
  // nur das Nötigste an den Browser schicken (Plakate lädt erst die Detail-Liste)
  return <FilmNet nodes={nodes.map(({ id, t, y, g }) => ({ id, t, y, g }))} edges={edges} genres={genres} />;
}
