import { redirect } from "next/navigation";

// Die Suche ist jetzt Teil von "Entdecken".
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(q ? `/entdecken?q=${encodeURIComponent(q)}` : "/entdecken");
}
