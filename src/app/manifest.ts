import type { MetadataRoute } from "next";

/**
 * The web-app manifest, so the studio can be added to a phone's home screen
 * and open as an app: its own icon, its own name, no browser chrome.
 *
 * The icon is the studio's design language at 512px — the white plate on the
 * CI orange, a headline in ink, the mark's full stop in the accent (see
 * public/app-icon.svg for the source; the PNGs are rasterised from it). One
 * artwork serves both `any` and `maskable`: it keeps a wide safe zone, so an
 * Android mask that trims the corners still shows the whole sheet.
 *
 * Colours are the studio's own: the ground for the splash and the theme, so
 * the OS chrome around the app is the same grey the app sits on.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Designally Article Studio",
    short_name: "Article Studio",
    description: "Internal AI-powered content generation for the Designally team",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f8f7",
    theme_color: "#f8f8f7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
