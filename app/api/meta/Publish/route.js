export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "LEGACY_META_DIRECT_PUBLISH_RETIRED",
        message: "The legacy direct Meta publish endpoint is retired.",
        correction: "Use the governed Creative Publish release flow, or Campaigns provider preflight followed by explicit approved execution when the relevant campaign adapter is available.",
      },
    },
    { status: 409 },
  );
}
