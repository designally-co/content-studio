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
const zalando = Zalando_Sans({
  variable: "--font-zalando",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
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
  title: "Designally Content Studio",
  description: "Internal AI-powered content generation for the Designally team",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
