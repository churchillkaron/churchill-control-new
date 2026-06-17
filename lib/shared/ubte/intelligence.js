import { getUBTELogs } from "@/lib/shared/ubte/observability";

/**
 * UBTE INTELLIGENCE LAYER
 * Turns raw execution logs into system insights
 */

export function analyzeUBTE() {
  const logs = getUBTELogs();

  const total = logs.length;

  const errors = logs.filter(l => l.stage === "ERROR");
  const success = logs.filter(l => l.stage === "SUCCESS");
  const skipped = logs.filter(l => l.stage === "SKIP_DUPLICATE");

  const avgDuration =
    logs
      .filter(l => l.duration)
      .reduce((acc, l) => acc + l.duration, 0) /
    (logs.filter(l => l.duration).length || 1);

  const slowOps = logs.filter(l => (l.duration || 0) > 500);

  return {
    summary: {
      total,
      success: success.length,
      errors: errors.length,
      skipped: skipped.length
    },

    performance: {
      avgDuration: Math.round(avgDuration),
      slowOperations: slowOps.length
    },

    health:
      errors.length > total * 0.1
        ? "CRITICAL"
        : errors.length > total * 0.05
        ? "WARNING"
        : "GOOD"
  };
}
