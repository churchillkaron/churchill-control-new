export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "LEGACY_MARKETING_PUBLISH_NOW_RETIRED",
        message: "The legacy publish-now endpoint is retired.",
        correction: "Use Campaigns provider preflight and explicit approved execution, or the governed Creative Publish release flow.",
      },
    },
    { status: 409 },
  );
}
