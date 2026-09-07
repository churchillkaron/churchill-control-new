import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

import {
  getPublicSupabaseKey,
  getPublicSupabaseUrl,
} from "@/lib/shared/supabase/publicConfig";

const WORKFORCE_CANONICAL_HOST = "avantiqo.ai";
const INVESTOR_V7_LAUNCH_PATH = "/api/internal/creative-investor-spatial-master-v7-launch";
const INVESTOR_V7_LAUNCH_TOKEN = "avq-investor-spatial-master-v7-launch-20260821";
const INVESTOR_V7_RENDER_TOKEN = "avq-investor-spatial-master-v7-20260821";

function isWorkforcePath(pathname) {
  return pathname === "/workforce" || pathname.startsWith("/workforce/") ||
    pathname === "/staff" || pathname.startsWith("/staff/");
}

function hasSupabaseSessionCookie(request) {
  return request.cookies.getAll().some(({ name }) =>
    name.startsWith("sb-") && name.includes("-auth-token")
  );
}

async function refreshSupabaseSession(request) {
  if (!hasSupabaseSessionCookie(request)) {
    return NextResponse.next({ request });
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    getPublicSupabaseUrl(),
    getPublicSupabaseKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers = {}) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
          Object.entries(headers).forEach(([name, value]) => {
            response.headers.set(name, value);
          });
        },
      },
    },
  );

  await supabase.auth.getClaims();
  return response;
}
function launchInvestorV7(request, event) {
  if (request.nextUrl.searchParams.get("token") !== INVESTOR_V7_LAUNCH_TOKEN) {
    return new NextResponse(null, { status: 404 });
  }

  const action = String(request.nextUrl.searchParams.get("action") || "").toLowerCase();
  if (action !== "render-chunk" && action !== "render-final") {
    return NextResponse.json({ success: false, error: "Unsupported action" }, { status: 400 });
  }

  const target = request.nextUrl.clone();
  target.pathname = "/api/internal/creative-investor-spatial-master-v7";
  target.search = "";
  target.searchParams.set("action", action);
  target.searchParams.set("token", INVESTOR_V7_RENDER_TOKEN);

  if (action === "render-chunk") {
    const index = Number(request.nextUrl.searchParams.get("index"));
    if (!Number.isInteger(index) || index < 1 || index > 4) {
      return NextResponse.json({ success: false, error: "index must be 1..4" }, { status: 400 });
    }
    target.searchParams.set("index", String(index));
  }

  event.waitUntil(
    fetch(target.toString(), {
      method: "GET",
      cache: "no-store",
      headers: { "x-avantiqo-render-launch": "v7-durable" },
    }).then(async (response) => {      if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error("INVESTOR_V7_DURABLE_RENDER_FAILED", {
          action,
          index: target.searchParams.get("index"),
          status: response.status,
          body: body.slice(0, 1200),
        });
      }
    }).catch((error) => {
      console.error("INVESTOR_V7_DURABLE_RENDER_REQUEST_FAILED", {
        action,
        index: target.searchParams.get("index"),
        message: error?.message || String(error),
      });
    }),
  );

  return NextResponse.json({
    success: true,
    accepted: true,
    action,
    index: target.searchParams.get("index") ? Number(target.searchParams.get("index")) : null,
  }, { status: 202 });
}

export async function middleware(request, event) {  if (request.nextUrl.pathname === INVESTOR_V7_LAUNCH_PATH) {
    return launchInvestorV7(request, event);
  }

  if (
    process.env.NODE_ENV === "development" &&
    request.nextUrl.hostname === "127.0.0.1"
  ) {
    const localUrl = request.nextUrl.clone();
    localUrl.hostname = "localhost";
    return NextResponse.redirect(localUrl, 307);
  }

  const sessionResponse = await refreshSupabaseSession(request);
  const hostname = String(request.nextUrl.hostname || "").toLowerCase();

  if (
    process.env.VERCEL_ENV === "production" &&
    isWorkforcePath(request.nextUrl.pathname) &&
    hostname &&
    hostname !== WORKFORCE_CANONICAL_HOST
  ) {
    const canonicalUrl = request.nextUrl.clone();
    canonicalUrl.protocol = "https:";
    canonicalUrl.hostname = WORKFORCE_CANONICAL_HOST;
    canonicalUrl.port = "";

    const redirect = NextResponse.redirect(canonicalUrl, 307);
    sessionResponse.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return sessionResponse;
}

export const config = {  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|woff|woff2|ttf)$).*)",
  ],
};
