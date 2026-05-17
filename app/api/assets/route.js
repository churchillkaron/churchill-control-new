export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      error: "Use /api/assets/list instead",
    },
    { status: 400 }
  );
}