import { defineCapability } from "@/lib/ubte/runtime/contracts/CapabilityManifest";
import { readOrganizationIntelligenceEconomics } from "@/lib/operator/runtime/IntelligenceUsageEconomicsRuntime";

function text(value, limit = 120) { return String(value ?? "").trim().slice(0, limit); }

function currentMonthRange(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start_at: start.toISOString(), end_at: end.toISOString() };
}

export function createIntelligenceEconomicsCapability() {
  const manifest = defineCapability({
    domain: "platform",
    capability: "intelligence_economics",
    action: "read",
    name: "Intelligence Economics",
    document: "intelligence_usage_economics",
    description: "Read organization-scoped Intelligence usage economics from the canonical platform service usage ledger. Reports Fast/Deep mix, token usage, bounded-context footprint, supplier cost and customer price. Read-only; it never mutates wallet, pricing, subscription or billing state.",
    permissions: [], events: [],
    tags: ["platform", "intelligence", "usage", "cost", "economics", "subscription", "read"],
    operatorAliases: ["show intelligence usage", "show AI usage", "show intelligence cost", "show AI cost", "how much intelligence have we used", "show this month intelligence usage", "show this month AI cost"],
    operatorExamples: ["Show this month's Intelligence usage and cost.", "How much Fast versus Deep Intelligence have we used this month?"],
    transactional: false, aiEnabled: true, operatorEnabled: true, operatorMode: "read", operatorAutoExecute: true, operatorRequiresConfirmation: false,
    contextScope: "organization", risk: "low", reversible: true,
    inputSchema: { type: "object", properties: { start_at: { type: "string" }, end_at: { type: "string" } }, additionalProperties: false },
    outputSchema: { type: "object", additionalProperties: true },
  });
  function authorize({ context }) { return Boolean(text(context?.organizationId)); }
  async function execute({ context, payload = {} }) {
    const fallback = currentMonthRange();
    return readOrganizationIntelligenceEconomics({ organizationId: context.organizationId, startAt: text(payload.start_at) || fallback.start_at, endAt: text(payload.end_at) || fallback.end_at });
  }
  return { manifest, authorize, execute };
}
export default createIntelligenceEconomicsCapability;
