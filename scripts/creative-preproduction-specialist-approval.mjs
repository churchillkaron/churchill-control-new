#!/usr/bin/env node
import crypto from "node:crypto";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const projectId = String(process.argv[2] || process.env.CREATIVE_PROJECT_ID || "").trim();
if (!projectId) throw new Error("CREATIVE_PROJECT_ID_REQUIRED");

const [
  { CreativeProjectRuntime },
  { OrganizationServiceRuntime },
  { resolveProvider },
  { PricingRuntime },
  { resolveServiceCapabilities },
  { resolvePrimaryExecutionCapability },
] = await Promise.all([
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
  import("@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime"),
  import("@/lib/platform/service-runtime/providers/ProviderResolver"),
  import("@/lib/platform/service-runtime/pricing/PricingRuntime"),
  import("@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver"),
  import("@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver"),
]);

const CONTRACT = "CREATIVE_PREPRODUCTION_SPECIALIST_BUDGET_APPROVAL_V1";
const APPROVAL_KEY = "paid_preproduction_specialist_approval";
const SERVICE_ID = "ai.reasoning.execute";
const MAXIMUM_CALLS = 28;
const APPROVAL_MINUTES = 180;
const MAXIMUM_INPUT_TOKENS_PER_CALL = 60000;
const MAXIMUM_OUTPUT_TOKENS_PER_CALL = 16000;
const ALLOWED_OPERATIONS = ["PREPRODUCTION_CREATIVE_REPAIR_V1", "PRODUCTION_WORKSTREAM_*"];

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function amount(value) { return Number(value || 0).toFixed(6).replace(/\.?0+$/, ""); }
function normalized(value) { return text(value).toUpperCase().replace(/\s+/g, " "); }

const project = await CreativeProjectRuntime.get(projectId);
if (!project) throw new Error("Creative project not found");
const organizationId = text(project.organization_id);
const commandIdentity = text(project.metadata?.command_identity);
if (!commandIdentity) throw new Error("CREATIVE_PREPRODUCTION_COMMAND_IDENTITY_REQUIRED");

const existing = object(project.metadata?.[APPROVAL_KEY]);
if (
  existing.contract === CONTRACT &&
  existing.approved === true &&
  ["APPROVED", "IN_PROGRESS"].includes(text(existing.status).toUpperCase()) &&
  Number(existing.remaining_customer_price || 0) > 0 &&
  Number(existing.call_count || 0) < Number(existing.maximum_calls || 0)
) {
  console.log("PREPRODUCTION_APPROVAL_MODE=REUSED_EXISTING_BUDGET");
  console.log(`PREPRODUCTION_APPROVAL_ID=${existing.id}`);
  console.log(`PREPRODUCTION_CALL_COUNT=${existing.call_count || 0}`);
  console.log(`PREPRODUCTION_MAXIMUM_CALLS=${existing.maximum_calls}`);
  console.log(`PREPRODUCTION_REMAINING_CUSTOMER_PRICE=${amount(existing.remaining_customer_price)}`);
  console.log(`PREPRODUCTION_CURRENCY=${existing.currency}`);
  process.exit(0);
}

const organizationService = await OrganizationServiceRuntime.get({ organization_id: organizationId, service_id: SERVICE_ID });
if (!organizationService) throw new Error(`Service ${SERVICE_ID} is not enabled for organization`);
const service = resolveServiceCapabilities(SERVICE_ID);
const capability = resolvePrimaryExecutionCapability(service?.capabilities || []);
if (!capability) throw new Error(`No execution capability found for ${SERVICE_ID}`);
const selected = await resolveProvider({
  organization_id: organizationId,
  capability,
  preferredProvider: "avantiqo-intelligence",
  country: null,
  currency: null,
  policy: organizationService.provider_policy || {},
});
if (!selected?.pricing_id) throw new Error("CREATIVE_PREPRODUCTION_SPECIALIST_PRICING_ID_REQUIRED");
if (text(selected.provider) !== "avantiqo-intelligence") {
  throw new Error(`CREATIVE_PREPRODUCTION_SPECIALIST_OWNED_PROVIDER_REQUIRED:${selected.provider}`);
}
const perCall = await PricingRuntime.resolveById({
  pricing_id: selected.pricing_id,
  currency: selected.currency || null,
  usage: {
    quantity: 1,
    input_tokens: MAXIMUM_INPUT_TOKENS_PER_CALL,
    output_tokens: MAXIMUM_OUTPUT_TOKENS_PER_CALL,
  },
});
const maximumPerCall = Number(Number(perCall.customer_price || 0).toFixed(6));
const maximumCustomerPrice = Number((maximumPerCall * MAXIMUM_CALLS).toFixed(6));
const currency = text(perCall.currency || selected.currency).toUpperCase();
if (!(maximumPerCall > 0) || !(maximumCustomerPrice > 0) || !currency) {
  throw new Error("CREATIVE_PREPRODUCTION_SPECIALIST_ESTIMATE_INVALID");
}
const phrase = `APPROVE PREPRODUCTION ${amount(maximumCustomerPrice)} ${currency}`;

console.log("============================================================");
console.log("AVANTIQO CREATIVE REPAIR + PREPRODUCTION SPECIALIST APPROVAL");
console.log("============================================================");
console.log(`CREATIVE_PROJECT_ID=${project.id}`);
console.log(`PREPRODUCTION_PROVIDER=${selected.provider}`);
console.log(`PREPRODUCTION_MODEL=${selected.model || ""}`);
console.log(`PREPRODUCTION_PRICING_ID=${selected.pricing_id}`);
console.log(`PREPRODUCTION_MAXIMUM_CALLS=${MAXIMUM_CALLS}`);
console.log(`PREPRODUCTION_MAXIMUM_PER_CALL_CUSTOMER_PRICE=${amount(maximumPerCall)}`);
console.log(`PREPRODUCTION_MAXIMUM_CUSTOMER_PRICE=${amount(maximumCustomerPrice)}`);
console.log(`PREPRODUCTION_CURRENCY=${currency}`);
console.log(`PREPRODUCTION_ALLOWED_OPERATIONS=${ALLOWED_OPERATIONS.join(",")}`);
console.log("MEDIA_GENERATION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
console.log(`PREPRODUCTION_APPROVAL_PHRASE=${phrase}`);
console.log("============================================================");

const supplied = text(process.env.CREATIVE_PREPRODUCTION_APPROVAL_RESPONSE);
let approved = normalized(supplied) === normalized(phrase);
if (!approved && process.stdin.isTTY && process.stdout.isTTY) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await terminal.question(`Type ${phrase} to continue, or press Enter to stop: `);
    approved = normalized(answer) === normalized(phrase);
  } finally {
    terminal.close();
  }
}
if (!approved) {
  console.log("PREPRODUCTION_BUDGET_APPROVED=NO");
  process.exit(0);
}

const approvedAt = new Date();
const approval = {
  contract: CONTRACT,
  id: crypto.randomUUID(),
  approved: true,
  status: "APPROVED",
  scope: "CREATIVE_REPAIR_AND_PREPRODUCTION_SPECIALIST_REASONING",
  command_identity: commandIdentity,
  provider: selected.provider,
  model: selected.model || perCall.model || null,
  capability,
  pricing_id: selected.pricing_id,
  maximum_calls: MAXIMUM_CALLS,
  call_count: 0,
  maximum_per_call_customer_price: maximumPerCall,
  maximum_customer_price: maximumCustomerPrice,
  spent_customer_price: 0,
  remaining_customer_price: maximumCustomerPrice,
  currency,
  allowed_operations: ALLOWED_OPERATIONS,
  allowed_models: [selected.model || perCall.model].filter(Boolean),
  allowed_pricing_ids: [selected.pricing_id],
  operations: [],
  approved_at: approvedAt.toISOString(),
  expires_at: new Date(approvedAt.getTime() + APPROVAL_MINUTES * 60 * 1000).toISOString(),
  media_generation_authorized: false,
  publication_authorized: false,
  external_fallback_allowed: false,
};
await CreativeProjectRuntime.update(project.id, {
  metadata: { ...(project.metadata || {}), [APPROVAL_KEY]: approval },
});
console.log("PREPRODUCTION_BUDGET_APPROVED=YES");
console.log(`PREPRODUCTION_APPROVAL_ID=${approval.id}`);
console.log(`PREPRODUCTION_MAXIMUM_CUSTOMER_PRICE=${amount(approval.maximum_customer_price)}`);
console.log(`PREPRODUCTION_CURRENCY=${approval.currency}`);
console.log("MEDIA_GENERATION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
