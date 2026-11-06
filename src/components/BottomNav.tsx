"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Entdecken", d: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15.5 8.5l-2 5-5 2 2-5z" },
  { href: "/fuer-dich", label: "Für dich", d: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" },
  { href: "/bewerten", label: "Bewerten", d: "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" },
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
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={it.d} />
            </svg>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
