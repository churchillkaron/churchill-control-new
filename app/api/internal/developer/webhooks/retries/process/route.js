export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";

import { processDueDeveloperWebhookRetries } from "@/lib/developer/DeveloperWebhookRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return String(request.headers.get("authorization") || "").trim() === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store, private" } },
    );
  }

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 10, 25));

  try {
    const result = await processDueDeveloperWebhookRetries({ limit });
    return NextResponse.json(result, {
      status: result.failed_count > 0 ? 207 : 200,
      headers: { "Cache-Control": "no-store, private" },
    });
  } catch (error) {
    console.error("DEVELOPER_WEBHOOK_RETRY_WORKER_FAILED", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "DEVELOPER_WEBHOOK_RETRY_WORKER_FAILED",
      },
      { status: 500, headers: { "Cache-Control": "no-store, private" } },
    );
  }
}
