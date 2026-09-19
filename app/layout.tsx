import type { Metadata, Viewport } from "next";
import { Instrument_Sans, Newsreader } from "next/font/google";
import "./globals.css";

const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["italic", "normal"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "FPL Team Analysis",
  description: "Best XI + C/VC from free FPL API data",
};

export const viewport: Viewport = {
  themeColor: "#F7F7F3",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${instrument.variable} ${newsreader.variable}`}
        style={{ fontFamily: "var(--font-instrument), var(--font)" }}
      >
        {children}
      </body>
    </html>
  );
}
