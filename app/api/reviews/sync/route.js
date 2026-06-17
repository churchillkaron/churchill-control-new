export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST(req) {
  try {
    const body = await req.json();
    const tenantId = body.tenantId;

    if (!tenantId) {
      return NextResponse.json({ success: false, error: "Missing tenantId" }, { status: 400 });
    }

    const baseUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "http://localhost:3000";

    const results = [];

    for (const route of ["sync-google", "sync-facebook"]) {
      try {
        const res = await fetch(`${baseUrl}/api/reviews/${route}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId }),
        });

        const data = await res.json();
        results.push({ route, ...data });
      } catch (error) {
        results.push({ route, success: false, error: error.message });
      }
    }

    return NextResponse.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("[SYNC_REVIEWS]", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
