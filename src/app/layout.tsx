import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./glass.css"; // "Liquid Glass"-Stil – zum Abschalten diese Zeile entfernen
import "./theme-light.css"; // Heller Modus

// Schrift: Helvetica Neue (ist auf iPhone und Mac bereits installiert).

export const metadata: Metadata = {
  title: "Filmfinder",
  description: "Filme und Serien nach deinem echten Geschmack entdecken",
  appleWebApp: { capable: true, title: "Filmfinder", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Setzt Hell/Dunkel schon vor dem ersten Bild (kein kurzes Aufblitzen) und folgt bei "Automatisch" dem iPhone.
const THEME_SCRIPT = `(function(){try{var m=window.matchMedia("(prefers-color-scheme: light)");function a(){var c=localStorage.getItem("ff-theme");var l=c==="light"||(c!=="dark"&&m.matches);document.documentElement.dataset.theme=l?"light":"dark";var t=document.querySelector('meta[name="theme-color"]');if(t)t.setAttribute("content",l?"#f2f2f7":"#000000");}a();m.addEventListener("change",a);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
