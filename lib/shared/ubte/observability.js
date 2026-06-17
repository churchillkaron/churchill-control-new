import { pushLog, getLogs } from "@/lib/shared/ubte/state";

/**
 * UBTE OBSERVABILITY (SCALE READY)
 */

export function logUBTE(entry) {
  const log = {
    ...entry,
    timestamp: Date.now()
  };

  pushLog(log);

  if (process.env.NODE_ENV !== "production") {
    console.log("[UBTE]", log);
  }
}

export function getUBTELogs() {
  return getLogs();
}
