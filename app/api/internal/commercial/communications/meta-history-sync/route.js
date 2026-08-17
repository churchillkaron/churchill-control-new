export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  refreshDueMetaMessagingReadiness,
  syncDueMetaCommunicationHistory,
} from "@/lib/commercial/communications/CommunicationMetaInboxCatchupRuntime";

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

  const url = new URL(request.url);
  const recoveryRequested = url.searchParams.get("recovery") === "1";

  if (!recoveryRequested) {
    try {
      const result = await refreshDueMetaMessagingReadiness({
        connectionLimit: 3,
      });

      return Response.json(
        {
          ...result,
          mode: "WEBHOOK_FIRST",
          historyProviderCalls: 0,
          message:
            "Meta Messenger and Instagram messaging use real-time webhooks. Readiness is refreshed here; history synchronization remains recovery-only.",
        },
        {
          status: result.success ? 200 : 207,
        },
      );
    } catch (error) {
      return Response.json(
        {
          success: false,
          mode: "WEBHOOK_FIRST",
          historyProviderCalls: 0,
          error: error?.message || "Meta messaging readiness refresh failed",
        },
        { status: 500 },
      );
    }
  }

  try {
    const result = await syncDueMetaCommunicationHistory({
      organizationLimit: 1,
      successIntervalHours: 168,
      retryIntervalMinutes: 1440,
    });

    return Response.json(
      {
        ...result,
        mode: "RECOVERY_ONLY",
      },
      {
        status: result.success ? 200 : 207,
      },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        mode: "RECOVERY_ONLY",
        error: error?.message || "Meta communication recovery failed",
      },
      { status: 500 },
    );
  }
}
