"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Schwebende Leiste unten im "Liquid Glass"-Stil: nur Symbole, das aktive ist gefüllt und leuchtet.
// (Vorheriger Stand liegt auf GitHub im Zweig "design-vor-glas-leiste".)
const items = [
  { href: "/", label: "Filmfinder", fill: true,
    d: "M11 2.5l2.2 5.8 5.8 2.2-5.8 2.2L11 18.5l-2.2-5.8L3 10.5l5.8-2.2zM18.5 15.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" },
  { href: "/entdecken", label: "Entdecken", fill: false,
    d: "M10.5 18a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15zM16 16l5 5" },
  { href: "/bewerten", label: "Bewerten", fill: true,
    d: "M12 2.8l2.8 5.7 6.3.9-4.55 4.45 1.07 6.25L12 17.15 6.38 20.1l1.07-6.25L2.9 9.4l6.3-.9z" },
  { href: "/bibliothek", label: "Bibliothek", fill: true,
    d: "M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z" },
];

export default function BottomNav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Hauptnavigation">
      {items.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
        return (
          <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined} aria-label={it.label} title={it.label}>
            <svg viewBox="0 0 24 24" aria-hidden
              fill={active && it.fill ? "currentColor" : "none"} stroke="currentColor"
              strokeWidth={active && !it.fill ? 2.7 : 2.1} strokeLinecap="round" strokeLinejoin="round">
              <path d={it.d} />
            </svg>
          </Link>
        );
      })}
    </nav>
  );
}
