"use client";

import Link, { useLinkStatus } from "next/link";

// Reiter-Link mit sofortiger Rückmeldung: pulsiert, solange die Seite lädt.
function Label({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? "tab-pending" : undefined}>{children}</span>;
}

export default function TabLink({ href, pressed, children }: { href: string; pressed: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} aria-pressed={pressed} className="seg-link">
      <Label>{children}</Label>
    </Link>
  );
}
