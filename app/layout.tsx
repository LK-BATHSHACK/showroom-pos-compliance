import type { Metadata, Viewport } from "next";
import NavBar from "@/components/NavBar";
import { getSession } from "@/lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Showroom Compliance - Bathshack",
};

// Next.js 14 does inject a default viewport tag on its own even without
// this - checked directly against the rendered HTML (2 Sep 2026) - so the
// mobile "everything's tiny" risk isn't a missing-tag problem. Declaring it
// explicitly anyway (the supported App Router API, rather than a raw <meta>
// which would just duplicate Next's own tag) so it's guaranteed correct and
// visible in the codebase rather than relying on a framework default nobody
// can see.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Silka (see globals.css) is the primary brand font; Poppins - loaded here
// from Google Fonts - is Bathshack's documented fallback font, used until
// real Silka webfont files are dropped into /public/fonts.
const FONT_STACK = "'Silka', 'Poppins', Arial, sans-serif";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, fontFamily: FONT_STACK, background: "#F7F7F8", color: "#1D1C1D" }}>
        <NavBar session={session} />
        <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 16px" }}>{children}</main>
      </body>
    </html>
  );
}
