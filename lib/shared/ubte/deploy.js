import { getUBTEHealth } from "@/lib/shared/ubte/health";
import { validateUBTEBoot } from "@/lib/shared/ubte/bootstrap";

/**
 * UBTE DEPLOYMENT CONTROLLER
 * Production release gate
 */

export function runDeploymentCheck() {
  const boot = validateUBTEBoot();
  const health = getUBTEHealth();

  const checks = {
    boot: boot.ok,
    health: health.state !== "CRITICAL",
    logs: health.logCount >= 0
  };

  const ready =
    checks.boot &&
    checks.health;

  if (!ready) {
    throw new Error(
      "UBTE DEPLOY BLOCKED: SYSTEM NOT READY"
    );
  }

  return {
    status: "READY_FOR_DEPLOYMENT",
    checks
  };
}
