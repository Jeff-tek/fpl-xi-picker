import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FPL Team Analysis",
  description: "Best XI + C/VC from free FPL API data",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
