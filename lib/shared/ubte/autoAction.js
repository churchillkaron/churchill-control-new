import { generateUBTERecommendations } from "@/lib/shared/ubte/ai";
import { isAutoActionAllowed } from "@/lib/shared/ubte/environment";

/**
 * UBTE AUTO ACTION ENGINE (HARDENED)
 */

export async function runUBTEAutoActions({
  mode = "SAFE",
  execute
}) {
  const data = generateUBTERecommendations();

  const actions = [];

  const autoEnabled = isAutoActionAllowed() && mode === "AUTO";

  for (const rec of data.recommendations) {
    if (rec.type === "CRITICAL") {
      actions.push({
        action: "ALERT_ADMIN",
        message: rec.message
      });

      // 🚨 ONLY RUN IN EXPLICIT AUTO MODE + ALLOWED ENV
      if (autoEnabled && execute) {
        await execute({
          type: "critical_fix",
          payload: rec
        });
      }
    }

    if (rec.type === "WARNING") {
      actions.push({
        action: "OPTIMIZATION_SUGGESTION",
        message: rec.message
      });
    }

    if (rec.type === "INFO") {
      actions.push({
        action: "MONITOR",
        message: rec.message
      });
    }
  }

  return {
    mode,
    autoEnabled,
    health: data.health,
    actions
  };
}
