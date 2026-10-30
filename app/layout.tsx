import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Outfit } from "next/font/google";
import { Header } from "@/components/site/Header";
import { Footer } from "@/components/site/Footer";
import { WorldDriver } from "@/components/world/WorldDriver";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const instrument = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-instrument",
});
const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });

/** A CSP nonce is per request, so pages render dynamically. */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "Scam Scout", template: "%s · Scam Scout" },
  description: "Check any website, phone number or payee before you pay. A risk level with the evidence. Advice only, not a fraud finding.",
  openGraph: {
    title: "Scam Scout",
    description: "Check any website, phone number or payee before you pay.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className={`${geist.variable} ${geistMono.variable} ${instrument.variable} ${outfit.variable}`}>
      <body>
        <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-3 focus:py-2 focus:text-bg">
          Skip to content
        </a>
        <WorldDriver />
        <Header />
        <div id="content">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
