import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    success: false,
    error: "Staff migration preview is retired from the public application surface.",
    code: "STAFF_MIGRATION_HTTP_RETIRED",
  }, { status: 410 });
}
