import type { Metadata } from "next";
import NavBar from "@/components/NavBar";
import "./globals.css";

export const metadata: Metadata = {
  title: "Showroom POS Compliance - Bathshack",
};

// Silka (see globals.css) is the primary brand font; Poppins - loaded here
// from Google Fonts - is Bathshack's documented fallback font, used until
// real Silka webfont files are dropped into /public/fonts.
const FONT_STACK = "'Silka', 'Poppins', Arial, sans-serif";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, fontFamily: FONT_STACK, background: "#F7F7F8", color: "#1D1C1D" }}>
        <NavBar />
        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px" }}>{children}</main>
      </body>
    </html>
  );
}
