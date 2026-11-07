"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { logout } from "@/app/actions";
import ThemePicker from "./ThemePicker";

// Zahnrad oben rechts: Katalog (nur Admin), Darstellung, Über, Abmelden
export default function SettingsMenu({ admin }: { admin: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="settings" ref={box}>
      <button className={`icon-round gear ${open ? "open" : ""}`} aria-label="Einstellungen" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden>
          <path d="M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" />
          <path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.5A7.4 7.4 0 0 0 7 6.5l-2.4-1-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 2.6 1.5l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 2.6-1.5l2.4 1 2-3.4z" />
        </svg>
      </button>
      {open && (
        <div className="settings-panel" role="menu">
          <div className="settings-label">Darstellung</div>
          <ThemePicker />
          <nav className="settings-links" onClick={() => setOpen(false)}>
            {admin && <Link href="/admin" role="menuitem">Katalog <span>›</span></Link>}
            <Link href="/start?neu=1" role="menuitem">Einstieg wiederholen <span>›</span></Link>
            <Link href="/ueber" role="menuitem">Über die App <span>›</span></Link>
          </nav>
          <form action={logout}>
            <button className="settings-logout" role="menuitem">Abmelden</button>
          </form>
        </div>
      )}
    </div>
  );
}
