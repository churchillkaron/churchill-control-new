import { getUBTELogs } from "@/lib/shared/ubte/observability";
import { getUBTEMode } from "@/lib/shared/ubte/environment";

/**
 * UBTE SYSTEM HEALTH CHECK
 */

export function getUBTEHealth() {
  const logs = getUBTELogs();

  const mode = getUBTEMode();

  const status = {
    mode,
    logSystem: Array.isArray(logs),
    logCount: logs?.length || 0,
    engine: true,
    state: "UNKNOWN"
  };

  // simple stability logic
  const errorCount = logs.filter(l => l.stage === "ERROR").length;

  if (errorCount === 0) {
    status.state = "HEALTHY";
  } else if (errorCount < 5) {
    status.state = "WARNING";
  } else {
    status.state = "CRITICAL";
  }

  return status;
}
