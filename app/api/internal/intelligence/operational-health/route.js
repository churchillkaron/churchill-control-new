export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import {
  getAvantiqoIntelligenceOperationalHealth,
} from "@/lib/intelligence/runtime/AvantiqoIntelligenceOperationalHealthRuntime";

function authorized(request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return (request.headers.get("authorization") || "") === `Bearer ${secret}`;
}

export async function GET(request) {
  if (!authorized(request)) {
    return Response.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const lookbackHours = Number(url.searchParams.get("lookback_hours")) || 24;
    const result = await getAvantiqoIntelligenceOperationalHealth({
      lookback_hours: lookbackHours,
    });
    return Response.json(result, {
      status: result.status === "SLO_ATTENTION_REQUIRED" ? 207 : 200,
    });
  } catch (error) {
    console.error("AVANTIQO_INTELLIGENCE_OPERATIONAL_HEALTH_FAILED", error);
    return Response.json(
      {
        success: false,
        contract: "AVANTIQO_INTELLIGENCE_OPERATIONAL_HEALTH_V1",
        status: "HEALTH_EVALUATION_FAILED",
        error: String(error?.message || error || "Health evaluation failed").slice(0, 800),
      },
      { status: 500 },
    );
  }
}
