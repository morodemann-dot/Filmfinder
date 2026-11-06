import Link from "next/link";
import Poster from "./Poster";
import type { Title } from "@/lib/types";

export default function TitleCard({ t, badge }: { t: Pick<Title, "id" | "title" | "poster_path" | "release_year" | "format">; badge?: string | null }) {
  return (
    <Link href={`/titel/${t.id}`} className="card">
      <Poster path={t.poster_path} title={t.title} size="w185" badge={badge} />
      <div className="card-title">{t.title}</div>
      <div className="card-meta">
        {[t.format, t.release_year].filter(Boolean).join(" · ")}
      </div>
    </Link>
  );
}
