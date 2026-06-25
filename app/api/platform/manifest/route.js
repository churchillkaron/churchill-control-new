import { NextResponse } from "next/server";
import { getPlatformManifest } from "@/lib/platform-manifest";

export async function GET() {
  return NextResponse.json({
    success: true,
    manifest: getPlatformManifest(),
  });
}
