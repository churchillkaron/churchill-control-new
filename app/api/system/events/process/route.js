export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { runEventProcessors } from "@/lib/workers/system/runEventProcessors";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));

    const mode = body.mode || "auto";

    const result = await runEventProcessors();

    return NextResponse.json({
      success: true,
      mode,
      result
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
