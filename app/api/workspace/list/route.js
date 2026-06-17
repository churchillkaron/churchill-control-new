import { NextResponse } from "next/server";
import { loadPlatformWorkspaceRuntime } from "@/lib/platform/runtime/loadPlatformWorkspaceRuntime";

export async function GET() {
  try {
    const workspace =
      await loadPlatformWorkspaceRuntime();

    return NextResponse.json(
      workspace
    );
  } catch (err) {
    console.error(
      "Platform workspace API error:",
      err
    );

    return NextResponse.json(
      {
        success: false,
        error:
          err.message,
      },
      {
        status: 500,
      }
    );
  }
}
