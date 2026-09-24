export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "LEGACY_INSTAGRAM_PUBLISH_RETIRED",
        message: "The legacy direct Instagram publishing endpoint is retired.",
        correction: "Use the governed Creative Publish flow or an approved Campaigns organic-social execution adapter once provider preflight is satisfied.",
      },
    },
    { status: 409 },
  );
}
