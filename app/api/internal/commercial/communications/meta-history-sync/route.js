export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { syncDueMetaCommunicationHistory } from "@/lib/commercial/communications/CommunicationMetaInboxCatchupRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    const result = await syncDueMetaCommunicationHistory({
      organizationLimit: 1,
      successIntervalHours: 24,
      retryIntervalMinutes: 30,
    });

    return Response.json(result, {
      status: result.success ? 200 : 207,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error?.message || "Meta communication catch-up failed",
      },
      { status: 500 },
    );
  }
}
