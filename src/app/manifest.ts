import type { MetadataRoute } from "next";

// Das "Manifest" sagt dem iPhone: Diese Webseite darf sich wie eine App verhalten.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Filmfinder",
    short_name: "Filmfinder",
    description: "Filme und Serien nach deinem echten Geschmack entdecken",
    start_url: "/",
    display: "standalone",
    background_color: "#0f0d0c",
    theme_color: "#0f0d0c",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
