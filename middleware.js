import { NextResponse } from "next/server";

const WORKFORCE_CANONICAL_HOST = "avantiqo.ai";

export function middleware(request) {
  const hostname = String(request.nextUrl.hostname || "").toLowerCase();

  if (
    process.env.VERCEL_ENV === "production" &&
    hostname &&
    hostname !== WORKFORCE_CANONICAL_HOST
  ) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.protocol = "https:";
    canonicalUrl.hostname = WORKFORCE_CANONICAL_HOST;
    canonicalUrl.port = "";

    return NextResponse.redirect(canonicalUrl, 307);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/workforce/:path*", "/staff/:path*"],
};
