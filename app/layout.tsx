import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = { title: "Kargo Hiring", description: "Ranked shortlist, interview briefs and replies for Kargo's PM and Senior PM roles" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f4f3fa" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
