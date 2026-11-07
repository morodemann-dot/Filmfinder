import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./glass.css"; // "Liquid Glass"-Stil – zum Abschalten diese Zeile entfernen

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
