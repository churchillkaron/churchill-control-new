#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import nextEnv from "@next/env";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const intent = process.argv.slice(2).join(" ").trim();
if (!intent) process.exit(0);

const [
  { supabaseAdmin },
  { CreativeMissionRuntime },
  CreativeProjectRepository,
  { CreativeProjectRuntime },
  { OrganizationServiceRuntime },
  { resolveProvider },
  { PricingRuntime },
  { resolveServiceCapabilities },
  { resolvePrimaryExecutionCapability },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/missions/runtime/CreativeMissionRuntime"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
  import("@/lib/platform/service-runtime/services/runtime/OrganizationServiceRuntime"),
  import("@/lib/platform/service-runtime/providers/ProviderResolver"),
  import("@/lib/platform/service-runtime/pricing/PricingRuntime"),
  import("@/lib/platform/service-runtime/services/resolver/ServiceCapabilityResolver"),
  import("@/lib/platform/service-runtime/services/resolver/CapabilityExecutionResolver"),
]);

const DIRECTION_SERVICE_ID = "ai.reasoning.execute";
const APPROVAL_MINUTES = 90;
const APPROVAL_CONTRACT = "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2";
const PROVISIONAL_THB_CAP = 250;

const TEMPORAL_OPERATIONS = Object.freeze([
  "MASTER_PLAN_V3",
  "UNIVERSAL_MUSIC_WORLD_IDENTITY_SYNTHESIS_V1",
  "TEMPORAL_MASTER_PLAN_BASE_V1",
  "TEMPORAL_SCENE_ARCHITECTURE_V1",
  "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
  "CREATIVE_CONCEPT_DIRECTOR_*",
  "CREATIVE_CONCEPT_CRITIC_*",
  "CREATIVE_EXECUTIVE_CONCEPT_SELECTION_V1",
  "CREATIVE_SELECTED_CONCEPT_PLAN_REVISION_V1",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function significantTokens(value) {
  const ignored = new Set([
    "and", "bar", "co", "company", "ltd", "limited", "restaurant", "the",
  ]);
  return normalized(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !ignored.has(token));
}

function commandIdentity(organizationId, value) {
  return crypto
    .createHash("sha256")
    .update(`${organizationId}\n${normalized(value)}`)
    .digest("hex");
}

function amountText(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toFixed(6).replace(/\.?0+$/, "");
}

function inferDuration(value) {
  const match = normalized(value).match(
    /\b(\d+(?:\.\d+)?)\s*(?:second|seconds|sec|secs|s)\b/,
  );
  return match ? Number(match[1]) : 30;
}

function inferProductionType(value) {
  const source = normalized(value);
  if (/\b(video|film|reel|trailer|commercial|motion)\b/.test(source)) {
    return "TEMPORAL";
  }
  if (/\b(poster|image|photo|banner|graphic|social post)\b/.test(source)) {
    return "STILL";
  }
  if (/\b(menu|brochure|document|report|presentation|deck)\b/.test(source)) {
    return "DOCUMENT";
  }
  if (/\b(website|webpage|web page|landing page)\b/.test(source)) {
    return "INTERACTIVE";
  }
  if (/\b(audio|music|song|podcast|voice)\b/.test(source)) {
    return "AUDIO";
  }
  return "CAMPAIGN_SYSTEM";
}

function maximumTemporalSceneCalls(duration) {
  const preferred = Math.max(
    6,
    Math.min(20, Math.round(Number(duration || 30) / 14)),
  );
  return Math.min(24, preferred + 3);
}

function directionBudgetShape(productionType, duration) {
  if (productionType !== "TEMPORAL") {
    return {
      maximum_calls: 1,
      allowed_operations: ["MASTER_PLAN_V3"],
      calculation: "ONE_SHOT_NON_TEMPORAL_DIRECTION",
    };
  }

  const maximumSceneCalls = maximumTemporalSceneCalls(duration);
  return {
    // One synthesis + base plan + scene architecture + one call per maximum
    // scene + three independent directors + four independent critics +
    // executive selection + selected-plan revision.
    maximum_calls: 12 + maximumSceneCalls,
    maximum_scene_direction_calls: maximumSceneCalls,
    allowed_operations: [...TEMPORAL_OPERATIONS],
    calculation: "UNIVERSAL_TEMPORAL_COUNCIL_AND_SCENE_MAXIMUM",
  };
}

async function resolveOrganization() {
  const explicit = text(
    process.env.CREATIVE_ORGANIZATION_ID ||
    process.env.ACTIVE_ORGANIZATION_ID ||
    process.env.ORGANIZATION_ID,
  );
  const { data, error } = await supabaseAdmin
    .from("organizations")
    .select("id,name")
    .limit(1000);
  if (error) throw error;

  const organizations = (data || []).filter((item) => item?.id && item?.name);
  if (explicit) {
    return organizations.find((item) => text(item.id) === explicit) || null;
  }

  const command = normalized(intent);
  return organizations
    .map((organization) => {
      const name = normalized(organization.name);
      const tokens = significantTokens(organization.name);
      let score = name && command.includes(name) ? 1000 : 0;
      for (const token of tokens) {
        if (new RegExp(`\\b${token}\\b`, "i").test(command)) score += 150;
      }
      return { organization, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.organization || null;
}

function reusableMission(missions, identity) {
  return (missions || [])
    .filter((mission) => ![
      "completed", "archived", "cancelled", "canceled",
    ].includes(text(mission.status).toLowerCase()))
    .filter((mission) => {
      const metadata = object(mission.metadata);
      return text(metadata.command_identity) === identity ||
        normalized(metadata.original_intent) === normalized(intent) ||
        normalized(mission.title) === normalized(intent);
    })
    .sort((left, right) =>
      Date.parse(right.updated_at || right.created_at || 0) -
      Date.parse(left.updated_at || left.created_at || 0),
    )[0] || null;
}

async function renewCompletedResearch(project) {
  const { data: reports, error } = await supabaseAdmin
    .from("creative_research_reports")
    .select("id,metadata,created_at,updated_at")
    .eq("organization_id", project.organization_id)
    .eq("creative_project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;

  const report = (reports || []).find((item) =>
    item.metadata?.validation?.passed === true,
  );
  if (!report) return project;

  const approval = object(project.metadata?.paid_research_approval);
  if (
    !text(approval.provider) ||
    !text(approval.pricing_id) ||
    !text(approval.currency) ||
    Number(approval.maximum_customer_price) <= 0
  ) return project;

  const expiresAt = Date.parse(text(approval.expires_at));
  if (
    approval.approved === true &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now() + 60_000
  ) return project;

  const renewed = await CreativeProjectRuntime.update(project.id, {
    metadata: {
      ...(project.metadata || {}),
      paid_research_approval: {
        ...approval,
        approved: true,
        status: "COMPLETED_REUSABLE",
        research_report_id: report.id,
        retry_required: false,
        resumed_without_new_charge_at: new Date().toISOString(),
        expires_at: new Date(
          Date.now() + APPROVAL_MINUTES * 60 * 1000,
        ).toISOString(),
      },
    },
  });
  console.log("RESEARCH_APPROVAL_REUSED_FROM_VALIDATED_REPORT=YES");
  console.log(`RESEARCH_REPORT_ID=${report.id}`);
  return renewed;
}

async function directionEstimate(organizationId, shape) {
  const organizationService = await OrganizationServiceRuntime.get({
    organization_id: organizationId,
    service_id: DIRECTION_SERVICE_ID,
  });
  if (!organizationService) {
    throw new Error(`Service ${DIRECTION_SERVICE_ID} is not enabled for organization`);
  }

  const service = resolveServiceCapabilities(DIRECTION_SERVICE_ID);
  const capability = resolvePrimaryExecutionCapability(service?.capabilities || []);
  if (!capability) {
    throw new Error(`No execution capability found for ${DIRECTION_SERVICE_ID}`);
  }

  const selected = await resolveProvider({
    organization_id: organizationId,
    capability,
    preferredProvider: null,
    country: null,
    currency: null,
    policy: organizationService.provider_policy || {},
  });
  if (!selected?.pricing_id) {
    throw new Error("CREATIVE_DIRECTION_PRICING_ID_REQUIRED");
  }

  const pricing = await PricingRuntime.resolveById({
    pricing_id: selected.pricing_id,
    currency: selected.currency || null,
    usage: { quantity: 1 },
  });
  const maximumCalls = Number(shape.maximum_calls);
  const maximumCustomerPrice = Number((
    Number(pricing.customer_price) * maximumCalls
  ).toFixed(6));
  const supplierCost = Number((
    Number(pricing.supplier_cost || 0) * maximumCalls
  ).toFixed(6));

  if (
    text(pricing.currency).toUpperCase() === "THB" &&
    maximumCustomerPrice > PROVISIONAL_THB_CAP
  ) {
    throw new Error(
      `CREATIVE_DIRECTION_BUDGET_EXCEEDS_PROVISIONAL_CAP:${maximumCustomerPrice}:${PROVISIONAL_THB_CAP}:THB`,
    );
  }

  return {
    capability,
    provider: selected.provider,
    model: selected.model || null,
    pricing_id: selected.pricing_id,
    maximum_calls: maximumCalls,
    maximum_per_call_customer_price: pricing.customer_price,
    maximum_customer_price: maximumCustomerPrice,
    supplier_cost_estimate: supplierCost,
    currency: pricing.currency,
    estimated_input_tokens:
      Number(pricing.input_tokens || 0) * maximumCalls,
    estimated_output_tokens:
      Number(pricing.output_tokens || 0) * maximumCalls,
    allowed_operations: shape.allowed_operations,
    calculation: shape.calculation,
    maximum_scene_direction_calls:
      shape.maximum_scene_direction_calls || 0,
  };
}

function existingApproval(project, identity) {
  const approval = object(project.metadata?.paid_direction_approval);
  if (
    approval.contract !== APPROVAL_CONTRACT ||
    text(approval.command_identity) !== identity
  ) return null;

  const status = text(approval.status).toUpperCase();
  if (status === "COMPLETED") return approval;

  const approvedAt = Date.parse(text(approval.approved_at));
  const expiresAt = Date.parse(text(approval.expires_at));
  const remaining = Number(
    approval.remaining_customer_price ??
    Number(approval.maximum_customer_price || 0) -
      Number(approval.spent_customer_price || 0),
  );
  if (
    approval.approved === true &&
    ["APPROVED", "IN_PROGRESS"].includes(status) &&
    Number.isFinite(approvedAt) &&
    Number.isFinite(expiresAt) &&
    approvedAt <= Date.now() &&
    expiresAt > Date.now() &&
    remaining > 0
  ) return approval;

  return null;
}

async function requestApproval(estimate) {
  const amount = amountText(estimate.maximum_customer_price);
  const currency = text(estimate.currency).toUpperCase();
  const phrase = `APPROVE DIRECTION BUDGET ${amount} ${currency}`;

  console.log("============================================================");
  console.log("AVANTIQO CONSOLIDATED CREATIVE DIRECTION APPROVAL");
  console.log("============================================================");
  console.log(`DIRECTION_PROVIDER=${estimate.provider}`);
  console.log(`DIRECTION_MODEL=${estimate.model || ""}`);
  console.log(`DIRECTION_PRICING_ID=${estimate.pricing_id}`);
  console.log(`DIRECTION_MAXIMUM_CALLS=${estimate.maximum_calls}`);
  console.log(
    `DIRECTION_MAXIMUM_PER_CALL_CUSTOMER_PRICE=${amountText(estimate.maximum_per_call_customer_price)}`,
  );
  console.log(`DIRECTION_MAXIMUM_CUSTOMER_PRICE=${amount}`);
  console.log(`DIRECTION_CURRENCY=${currency}`);
  console.log(`DIRECTION_ESTIMATED_INPUT_TOKENS=${estimate.estimated_input_tokens || 0}`);
  console.log(`DIRECTION_ESTIMATED_OUTPUT_TOKENS=${estimate.estimated_output_tokens || 0}`);
  console.log(`DIRECTION_BUDGET_CALCULATION=${estimate.calculation}`);
  console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
  console.log("PUBLICATION_AUTHORIZED=NO");
  console.log("============================================================");

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("CREATIVE_INTERACTIVE_DIRECTION_APPROVAL_REQUIRED");
  }

  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    const answer = await terminal.question(
      `Type ${phrase} to continue, or press Enter to stop: `,
    );
    return normalized(answer) === normalized(phrase);
  } finally {
    terminal.close();
  }
}

const organization = await resolveOrganization();
if (!organization) process.exit(0);
const identity = commandIdentity(organization.id, intent);
const duration = inferDuration(intent);
const productionType = inferProductionType(intent);
const shape = directionBudgetShape(productionType, duration);
const missions = await CreativeMissionRuntime.list({
  organization_id: organization.id,
});
const mission = reusableMission(missions, identity);
if (!mission) process.exit(0);

let project = await CreativeProjectRepository.getByMission({
  organization_id: organization.id,
  creative_mission_id: mission.id,
});
if (!project) process.exit(0);
project = await renewCompletedResearch(project);

const reusable = existingApproval(project, identity);
if (reusable) {
  console.log(`DIRECTION_APPROVAL_MODE=${
    text(reusable.status).toUpperCase() === "COMPLETED"
      ? "RECOVER_COMPLETED_DIRECTION_BUDGET"
      : "REUSED_EXISTING_DIRECTION_BUDGET"
  }`);
  console.log(`DIRECTION_PROVIDER=${reusable.provider}`);
  console.log(`DIRECTION_MODEL=${reusable.model || ""}`);
  console.log(`DIRECTION_MAXIMUM_CALLS=${reusable.maximum_calls}`);
  console.log(`DIRECTION_CALL_COUNT=${reusable.call_count || 0}`);
  console.log(
    `DIRECTION_MAXIMUM_CUSTOMER_PRICE=${amountText(reusable.maximum_customer_price)}`,
  );
  console.log(
    `DIRECTION_SPENT_CUSTOMER_PRICE=${amountText(reusable.spent_customer_price || 0)}`,
  );
  console.log(`DIRECTION_CURRENCY=${reusable.currency}`);
  process.exit(0);
}

const estimate = await directionEstimate(organization.id, shape);
const approved = await requestApproval(estimate);
if (!approved) {
  console.log("DIRECTION_BUDGET_APPROVED=NO");
  console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
  console.log("PUBLICATION_AUTHORIZED=NO");
  process.exit(0);
}

const approvedAt = new Date();
const approval = {
  contract: APPROVAL_CONTRACT,
  id: crypto.randomUUID(),
  approved: true,
  status: "APPROVED",
  scope: "CREATIVE_DIRECTION_PIPELINE_BUDGET",
  command_identity: identity,
  provider: estimate.provider,
  model: estimate.model,
  capability: estimate.capability,
  pricing_id: estimate.pricing_id,
  maximum_calls: estimate.maximum_calls,
  call_count: 0,
  maximum_per_call_customer_price:
    estimate.maximum_per_call_customer_price,
  maximum_customer_price: estimate.maximum_customer_price,
  spent_customer_price: 0,
  remaining_customer_price: estimate.maximum_customer_price,
  supplier_cost_estimate: estimate.supplier_cost_estimate,
  currency: estimate.currency,
  estimated_input_tokens: estimate.estimated_input_tokens,
  estimated_output_tokens: estimate.estimated_output_tokens,
  allowed_operations: estimate.allowed_operations,
  budget_calculation: estimate.calculation,
  maximum_scene_direction_calls:
    estimate.maximum_scene_direction_calls,
  operations: [],
  approved_at: approvedAt.toISOString(),
  expires_at: new Date(
    approvedAt.getTime() + APPROVAL_MINUTES * 60 * 1000,
  ).toISOString(),
  media_generation_authorized: false,
  publication_authorized: false,
};

await CreativeProjectRuntime.update(project.id, {
  metadata: {
    ...(project.metadata || {}),
    paid_direction_approval: approval,
    creative_reasoning_budget: {
      contract: "CREATIVE_REASONING_BUDGET_V1",
      id: approval.id,
      maximum_calls: approval.maximum_calls,
      maximum_requested_output_tokens: 180000,
      maximum_single_call_output_tokens: 20000,
      maximum_prompt_characters: 500000,
      maximum_total_prompt_characters: 2000000,
      maximum_customer_price: approval.maximum_customer_price,
      currency: approval.currency,
    },
  },
});

console.log("DIRECTION_BUDGET_APPROVED=YES");
console.log(`DIRECTION_APPROVAL_ID=${approval.id}`);
console.log(`DIRECTION_MAXIMUM_CALLS=${approval.maximum_calls}`);
console.log(
  `DIRECTION_MAXIMUM_CUSTOMER_PRICE=${amountText(approval.maximum_customer_price)}`,
);
console.log(`DIRECTION_CURRENCY=${approval.currency}`);
console.log(`CREATIVE_MISSION_ID=${mission.id}`);
console.log(`CREATIVE_PROJECT_ID=${project.id}`);
console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
