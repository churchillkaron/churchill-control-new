export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "LEGACY_MARKETING_PUBLISH_RETIRED",
        message: "The legacy marketing publish endpoint is retired.",
        correction: "Use the governed Campaigns execution path or Creative Publish command flow so provider readiness, approval, evidence and execution are enforced.",
      },
    },
    { status: 409 },
  );
}
