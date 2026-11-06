"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Entdecken", d: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" },
  { href: "/bewerten", label: "Bewerten", d: "M4 6h16M4 12h10M4 18h7M18 14l2 2 3-4" },
  { href: "/suche", label: "Suche", d: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4" },
  { href: "/bibliothek", label: "Bibliothek", d: "M5 4h4v16H5zM11 4h4v16h-4zM17 5l3 .8-3.6 14-3-.8" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Hauptnavigation">
      {items.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={it.d} />
            </svg>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
