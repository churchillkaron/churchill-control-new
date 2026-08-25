export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  claimSecretarySipOutboundCall,
  dispatchSecretarySipOutboundCall,
  secretarySipGatewayReadiness,
} from "@/lib/operator/secretary/SecretarySipGatewayTransportRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const readiness = secretarySipGatewayReadiness();
  if (!readiness.ready) {
    return Response.json(
      {
        success: true,
        contract: "AVANTIQO_SECRETARY_SIP_TRANSPORT_PROCESS_V1",
        status: "not_configured",
        claimed_count: 0,
        dispatched_count: 0,
        readiness,
        external_authority_used: false,
      },
      { headers: { "Cache-Control": "no-store, private" } },
    );
  }

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit")) || 4, 12));
  const results = [];

  for (let index = 0; index < limit; index += 1) {
    const claimed = await claimSecretarySipOutboundCall({ leaseSeconds: 120 });
    if (!claimed) break;
    results.push(await dispatchSecretarySipOutboundCall(claimed));
  }

  const failed = results.filter((item) => item.status === "failed").length;
  const retryScheduled = results.filter((item) => item.status === "retry_scheduled").length;
  const dispatched = results.filter((item) => item.status === "dialing").length;

  return Response.json(
    {
      success: failed === 0,
      contract: "AVANTIQO_SECRETARY_SIP_TRANSPORT_PROCESS_V1",
      status: failed ? "partial_failure" : "completed",
      claimed_count: results.length,
      dispatched_count: dispatched,
      retry_scheduled_count: retryScheduled,
      failed_count: failed,
      results,
      external_authority_used: false,
    },
    {
      status: failed ? 207 : 200,
      headers: { "Cache-Control": "no-store, private" },
    },
  );
}
