export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "LEGACY_MARKETING_RETRY_FAILED_RETIRED",
        message: "Legacy Marketing retry execution is retired. Use governed Campaigns or Creative Generation retry controls.",
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
