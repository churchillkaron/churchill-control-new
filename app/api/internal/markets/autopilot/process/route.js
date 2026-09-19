export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { runDueAutonomousPaperCycles } from "@/lib/markets/runtime/MarketAutonomousPaperRuntime";

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
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 10, 1), 50);
    const result = await runDueAutonomousPaperCycles({ limit });
    return Response.json(result, { status: result.failed > 0 ? 207 : 200 });
  } catch (error) {
    console.error("MARKETS_AUTOPILOT_CRON_FAILED", error);
    return Response.json(
      {
        success: false,
        error: error?.message || "Markets paper autopilot processing failed",
      },
      { status: 500 },
    );
  }
}
