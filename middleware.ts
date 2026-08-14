import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionValue } from "@/lib/auth-edge";

export async function middleware(req: NextRequest) {
  const cookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  const secret = process.env.SESSION_SECRET || "";

  if (cookie && secret && (await verifySessionValue(cookie, secret))) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Everything except: the login page itself, its API route, Vercel cron
  // endpoints (self-protected via CRON_SECRET instead), and static assets -
  // both Next's own (_next/static, _next/image) and anything in /public
  // (logos, fonts, favicon, etc.), matched generically by file extension so
  // new files dropped into /public don't need this list updated.
  matcher: [
    "/((?!login|api/login|api/cron|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?|ttf|otf)$).*)",
  ],
};
