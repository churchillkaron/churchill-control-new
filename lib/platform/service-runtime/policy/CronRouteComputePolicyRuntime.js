import { runWithScheduledExecutionComputePolicy } from "./ScheduledExecutionComputePolicyRuntime";

export function runCronRouteLocalFirst(fn, { source = "VERCEL_CRON" } = {}) {
  return runWithScheduledExecutionComputePolicy(fn, {
    source,
    local_intelligence_required: true,
    external_intelligence_fallback_allowed: false,
  });
}
