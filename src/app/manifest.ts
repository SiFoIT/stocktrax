import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StockTrax",
    short_name: "StockTrax",
    description: "Track your investments with real-time data",
    start_url: "/",
    display: "standalone",
    // Dark --background from globals.css; the app defaults to the dark theme.
    background_color: "#0c0e12",
    theme_color: "#0c0e12",
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
