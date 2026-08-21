import { NextResponse } from "next/server";

const WORKFORCE_CANONICAL_HOST = "avantiqo.ai";
const INVESTOR_V7_LAUNCH_PATH = "/api/internal/creative-investor-spatial-master-v7-launch";
const INVESTOR_V7_LAUNCH_TOKEN = "avq-investor-spatial-master-v7-launch-20260821";
const INVESTOR_V7_RENDER_TOKEN = "avq-investor-spatial-master-v7-20260821";

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
    }).then(async (response) => {
      if (!response.ok) {
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

export function middleware(request, event) {
  if (request.nextUrl.pathname === INVESTOR_V7_LAUNCH_PATH) {
    return launchInvestorV7(request, event);
  }

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
  matcher: [
    "/workforce/:path*",
    "/staff/:path*",
    "/api/internal/creative-investor-spatial-master-v7-launch",
  ],
};
