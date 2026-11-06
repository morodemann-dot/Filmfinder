/* eslint-disable @next/next/no-img-element */
import { posterUrl } from "@/lib/types";

// Zeigt das Filmplakat – oder den Titel als Text, wenn es kein Plakat gibt.
export default function Poster({
  path,
  title,
  size = "w342",
  badge,
}: {
  path: string | null;
  title: string;
  size?: "w185" | "w342" | "w500";
  badge?: string | null;
}) {
  const src = posterUrl(path, size);
  return (
    <div className="poster">
      {badge && <span className="badge">{badge}</span>}
      {src ? <img src={src} alt={`Plakat: ${title}`} loading="lazy" /> : title}
    </div>
  );
}
