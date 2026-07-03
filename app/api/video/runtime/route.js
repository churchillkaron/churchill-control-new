export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { VideoRuntime } from "@/lib/video/runtime/VideoRuntime";

export async function POST(req) {
  try {
    const body = await req.json();

    const production = await VideoRuntime(body);

    return NextResponse.json({
      success: true,
      production,
    });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      {
        success: false,
        error: err.message,
      },
      {
        status: 500,
      }
    );
  }
}
