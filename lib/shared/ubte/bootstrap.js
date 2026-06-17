import { getUBTEHealth } from "@/lib/shared/ubte/health";

/**
 * UBTE BOOT VALIDATOR
 * Runs at system startup (safety gate)
 */

export function validateUBTEBoot() {
  const health = getUBTEHealth();

  if (health.state === "CRITICAL") {
    throw new Error("UBTE BOOT FAILED: SYSTEM IS NOT HEALTHY");
  }

  if (!health.logSystem) {
    throw new Error("UBTE BOOT FAILED: LOG SYSTEM NOT READY");
  }

  return {
    ok: true,
    mode: health.mode,
    state: health.state
  };
}
