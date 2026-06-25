import { NextResponse } from "next/server";
import { platformRuntime } from "@/lib/platform/runtime";

export async function POST() {

  const manifest =
    platformRuntime.reload();

  return NextResponse.json({

    success: true,

    manifest,

  });

}
