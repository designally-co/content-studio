import type { Metadata, Viewport } from "next";
import {
  Gabarito,
  IBM_Plex_Sans_Thai,
  Instrument_Sans,
  Spline_Sans_Mono,
  Zalando_Sans,
} from "next/font/google";
import "./globals.css";

const gabarito = Gabarito({
  variable: "--font-gabarito",
  subsets: ["latin"],
});

const instrument = Instrument_Sans({
  variable: "--font-instrument",
  subsets: ["latin"],
});

// The CI display face, used by the sign-in page only — it is the one screen
// this app shares with the team app, and the two should read as one product.
// `preload: false` so every other route does not pay for a face it never sets.
const zalando = Zalando_Sans({
  variable: "--font-zalando",
  subsets: ["latin"],
  weight: ["600", "700"],
  preload: false,
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
      className={`${gabarito.variable} ${instrument.variable} ${splineMono.variable} ${plexThai.variable} ${zalando.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
