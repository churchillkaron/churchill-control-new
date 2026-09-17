import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage();

export async function runWithScheduledExecutionComputePolicy(fn, policy = {}) {
  return storage.run({
    scheduled_execution: true,
    local_intelligence_required: policy.local_intelligence_required !== false,
    external_intelligence_fallback_allowed: policy.external_intelligence_fallback_allowed === true,
    source: String(policy.source || "VERCEL_CRON").trim() || "VERCEL_CRON",
  }, fn);
}

export function scheduledExecutionComputePolicy() {
  return storage.getStore() || null;
}

export function scheduledExecutionRequiresLocalIntelligence() {
  const policy = scheduledExecutionComputePolicy();
  return policy?.scheduled_execution === true && policy?.local_intelligence_required === true;
}

export function scheduledExecutionAllowsExternalIntelligenceFallback() {
  const policy = scheduledExecutionComputePolicy();
  return policy?.external_intelligence_fallback_allowed === true;
}
