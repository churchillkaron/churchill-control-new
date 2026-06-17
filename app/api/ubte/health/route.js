import { getUBTEHealth } from "@/lib/shared/ubte/health";

/**
 * UBTE HEALTH CHECK API
 * Used for deployment readiness + monitoring
 */

export async function GET() {
  const health = getUBTEHealth();

  const ready = health.state !== "CRITICAL";

  return Response.json({
    timestamp: Date.now(),
    ready,
    health
  });
}
