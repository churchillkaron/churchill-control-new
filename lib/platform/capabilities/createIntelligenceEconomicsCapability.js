import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { assessIntelligenceOperatingHealth, readOrganizationIntelligenceEconomics } from "@/lib/operator/runtime/IntelligenceUsageEconomicsRuntime";
import { readIntelligenceMemoryObservability } from "@/lib/operator/runtime/IntelligenceMemoryObservabilityRuntime";

function text(value, limit = 120) { return String(value ?? "").trim().slice(0, limit); }

function currentMonthRange(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start_at: start.toISOString(), end_at: end.toISOString() };
}

function previousEquivalentRange(startAt, endAt) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const duration = Math.max(1, end.getTime() - start.getTime());
  return {
    start_at: new Date(start.getTime() - duration).toISOString(),
    end_at: start.toISOString(),
  };
}

export function createIntelligenceEconomicsCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "intelligence_economics",
    action: "read",
    name: "Intelligence Economics",
    document: "intelligence_usage_economics",    description: "Read organization-scoped Intelligence usage economics and operating health from the canonical service-usage and memory telemetry. Reports Fast/Deep mix, token usage, bounded-context footprint, supplier cost, customer price, period-over-period drift and memory health. Read-only; it never mutates wallet, pricing, subscription, memory or billing state.",
    permissions: [], events: [],
    tags: ["platform", "intelligence", "usage", "cost", "economics", "health", "memory", "read"],
    operatorAliases: ["show intelligence usage", "show AI usage", "show intelligence cost", "show AI cost", "how much intelligence have we used", "show this month intelligence usage", "show this month AI cost", "is intelligence getting heavier", "is AI getting more expensive", "show intelligence operating health", "show AI operating health"],
    operatorExamples: ["Show this month's Intelligence usage and cost.", "Is Intelligence getting heavier or more expensive over time?", "Show Intelligence operating health."],
    transactional: false, aiEnabled: true, operatorEnabled: true, operatorMode: "read", operatorAutoExecute: true, operatorRequiresConfirmation: false,
    contextScope: "organization", risk: "low", reversible: true,
    inputSchema: { type: "object", properties: { start_at: { type: "string" }, end_at: { type: "string" } }, additionalProperties: false },
    outputSchema: { type: "object", additionalProperties: true },
  });
  function authorize({ context }) { return Boolean(text(context?.organizationId)); }
  async function execute({ context, payload = {} }) {
    const fallback = currentMonthRange();
    const startAt = text(payload.start_at) || fallback.start_at;
    const endAt = text(payload.end_at) || fallback.end_at;
    const previousRange = previousEquivalentRange(startAt, endAt);
    const [current, previous, memory] = await Promise.all([
      readOrganizationIntelligenceEconomics({ organizationId: context.organizationId, startAt, endAt }),
      readOrganizationIntelligenceEconomics({ organizationId: context.organizationId, startAt: previousRange.start_at, endAt: previousRange.end_at }),
      readIntelligenceMemoryObservability({ organizationId: context.organizationId }),
    ]);    return {
      ...current,
      comparison_period: previous,
      memory,
      operating_health: assessIntelligenceOperatingHealth(current, previous, memory),
      comparison: { previous_start_at: previousRange.start_at, previous_end_at: previousRange.end_at },
    };
  }
  return { manifest, authorize, execute };
}
export default createIntelligenceEconomicsCapability;
