import { NextResponse } from "next/server";
import { platformRuntime } from "@/lib/platform/runtime";

export async function GET() {

  const manifest =
    platformRuntime.boot();

  return NextResponse.json({

    success: true,

    started:
      platformRuntime.isStarted(),

    manifest,

  });

}
