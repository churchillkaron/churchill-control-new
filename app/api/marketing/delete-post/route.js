export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "LEGACY_MARKETING_DELETE_POST_RETIRED",
        message: "Legacy direct social-post deletion is retired. Use governed provider/release controls.",
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
