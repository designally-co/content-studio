import type { Metadata, Viewport } from "next";
import {
  IBM_Plex_Sans_Thai,
  Poppins,
  Spline_Sans_Mono,
  Zalando_Sans,
} from "next/font/google";
import "./globals.css";

/**
 * The CI names three faces and Thai decides how they combine.
 *
 * Zalando Sans for display, headings and every UI label; Poppins for Latin
 * body; IBM Plex Sans Thai for Thai in both roles, because Zalando has no Thai
 * glyphs whatever its readme says — Google publishes it in latin, latin-ext and
 * vietnamese only. The fallback is per codepoint, so a bilingual string
 * resolves correctly inside one run of text.
 *
 * Weights are 300/400/600/700. 500 is deliberately absent from the system, so
 * it is not loaded: a `font-medium` left anywhere in the app resolves to a
 * neighbouring weight rather than being synthesised.
 */
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "600", "700"],
});

// The CI display face, used by the sign-in page only — it is the one screen
// this app shares with the team app, and the two should read as one product.
// `preload: false` so every other route does not pay for a face it never sets.
/* THE VARIABLE FACE, NOT FOUR CUT INSTANCES. Listing weights loads exactly
   those and nothing between them, which is fine until a label needs to sit
   BETWEEN two of them — 500 read too light for the navigation and 600 too
   bold, and there was no way to say so. Zalando Sans has a weight axis; asking
   for the family without a list loads it, and every value on the axis becomes
   available. The named utilities keep working: `font-medium` is still 500, it
   is simply no longer the only thing near it. */
const zalando = Zalando_Sans({
  variable: "--font-zalando",
  subsets: ["latin"],
});

const splineMono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
});

// Gabarito and Instrument Sans ship latin/latin-ext only; Thai drafts fall
// through to Plex Thai rather than a system font.
const plexThai = IBM_Plex_Sans_Thai({
  variable: "--font-plex-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Designally Article Studio",
  description: "Internal AI-powered content generation for the Designally team",
};

/* THE SCREEN IS THE SCREEN. On iOS, tapping any field set below 16px makes
   Safari zoom the page in on it — the "magnifier" — and the layout then has
   to be pinched back before the rest of it can be seen. This app sets its
   fields at the body size on purpose, so the zoom is switched off at the
   viewport instead: `maximumScale: 1` is what Safari checks before it zooms
   on focus, and `userScalable: false` says the same thing to the browsers
   that read that field. The layout is already responsive; it does not need
   the browser's help.

   `resizes-content` asks a browser that supports it (Chrome on Android) to
   shrink the layout to the space above the keyboard, so a dock anchored to
   the foot of the screen rises with the keyboard the way an app's does. iOS
   ignores it and pans instead, which is the best it offers. */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${splineMono.variable} ${plexThai.variable} ${zalando.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
