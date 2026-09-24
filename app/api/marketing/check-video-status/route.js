export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "LEGACY_MARKETING_CHECK_VIDEO_STATUS_RETIRED",
        message: "Legacy Marketing video-status reconciliation is retired. Use governed Creative Generation status.",
      },
    },
    { status: 410 },
  );
}

export async function GET() {
  return retired();
}

export async function POST() {
  return retired();
}

export async function DELETE() {
  return retired();
}
