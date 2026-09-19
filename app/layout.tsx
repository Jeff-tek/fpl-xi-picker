import type { Metadata } from "next";

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
      <body style={{ fontFamily: "system-ui", margin: 0 }}>{children}</body>
    </html>
  );
}
