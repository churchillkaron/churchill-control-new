import { validateUBTEBoot } from "@/lib/shared/ubte/bootstrap";
import { getUBTEHealth } from "@/lib/shared/ubte/health";

/**
 * UBTE STARTUP ENGINE
 * Single entry point for system initialization
 */

export function startUBTE() {
  const boot = validateUBTEBoot();
  const health = getUBTEHealth();

  if (!boot.ok) {
    throw new Error("UBTE FAILED TO START");
  }

  console.log("🟢 UBTE STARTED");
  console.log("Mode:", boot.mode);
  console.log("State:", health.state);

  return {
    status: "RUNNING",
    mode: boot.mode,
    state: health.state
  };
}
