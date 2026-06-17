import { getUBTELogs } from "@/lib/shared/ubte/observability";

/**
 * UBTE LIVE DASHBOARD API
 * Returns real-time execution state
 */

export async function GET() {
  const logs = getUBTELogs();

  const last100 = logs.slice(-100);

  const summary = {
    total: logs.length,
    success: logs.filter(l => l.stage === "SUCCESS").length,
    errors: logs.filter(l => l.stage === "ERROR").length,
    skipped: logs.filter(l => l.stage === "SKIP_DUPLICATE").length
  };

  return Response.json({
    summary,
    recent: last100
  });
}
