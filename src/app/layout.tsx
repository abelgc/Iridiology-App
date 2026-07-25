import type { Metadata } from "next";
import { Cormorant_Garamond, DM_Sans, Fraunces } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const cormorant = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
});

const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  // Required so the share image resolves to an absolute URL — link previews
  // reject a relative one. Without Open Graph tags, scrapers fell back to the
  // favicon, which only worked while that file happened to be 1024x1024.
  metadataBase: new URL("https://narasimhasolutions.com"),
  title: "Narasimha Solutions — Iridology Analysis",
  description: "Professional iris analysis by Narasimha Solutions",
  openGraph: {
    title: "Narasimha Solutions — Iridology Analysis",
    description: "Professional iris analysis by Narasimha Solutions",
    url: "https://narasimhasolutions.com",
    siteName: "Narasimha Solutions",
    type: "website",
    locale: "es_ES",
    // Declared explicitly rather than via the opengraph-image file convention:
    // that convention emits a hashed query string (?opengraph-image.<hash>.png)
    // and the URL changes on every deploy that touches the file. Messaging
    // crawlers handle a plain static path far more reliably, and a stable URL
    // keeps already-cached previews pointing somewhere that still exists.
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        type: "image/png",
        alt: "Narasimha Solutions",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Narasimha Solutions — Iridology Analysis",
    description: "Professional iris analysis by Narasimha Solutions",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${cormorant.variable} ${dmSans.variable} ${fraunces.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body className="min-h-full flex flex-col bg-white">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
