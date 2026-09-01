import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "CollabNGrow Passion Analyzer",
    template: "%s · CollabNGrow",
  },
  description:
    "A private, invitation-only reflection on what matters to you and who you are choosing to become.",
  // This experience is invitation-only; it should never be indexed (§7).
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#e0023f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        {children}
      </body>
    </html>
  );
}
