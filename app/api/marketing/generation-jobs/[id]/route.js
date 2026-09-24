export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

function retired() {
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "LEGACY_MARKETING_GENERATION_JOB_DELETE_RETIRED",
        message: "Legacy Marketing generation-job mutation is retired. Use governed Creative Generation job controls.",
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
