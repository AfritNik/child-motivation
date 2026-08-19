import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Семейная система мотивации",
    short_name: "Саша",
    description: "Учёба, самостоятельность, баллы и семейные награды",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f3ed",
    theme_color: "#285f66",
    lang: "ru",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
