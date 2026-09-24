export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "LEGACY_MARKETING_ANALYZE_ASSET_RETIRED",
        message: "Legacy standalone Marketing asset analysis is retired. Use governed asset upload and Creative inspection.",
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
