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
const APPROVAL_MINUTES = 30;

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

async function directionEstimate(organizationId) {
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

  return {
    capability,
    provider: selected.provider,
    model: selected.model || null,
    pricing_id: selected.pricing_id,
    maximum_customer_price: pricing.customer_price,
    supplier_cost: pricing.supplier_cost,
    currency: pricing.currency,
    estimated_input_tokens: pricing.input_tokens,
    estimated_output_tokens: pricing.output_tokens,
  };
}

function existingApproval(project, identity) {
  const approval = object(project.metadata?.paid_direction_approval);
  const status = text(approval.status).toUpperCase();
  if (
    status === "COMPLETED" &&
    text(approval.usage_id) &&
    text(approval.command_identity) === identity
  ) return approval;

  const approvedAt = Date.parse(text(approval.approved_at));
  const expiresAt = Date.parse(text(approval.expires_at));
  if (
    approval.approved === true &&
    status === "APPROVED" &&
    text(approval.command_identity) === identity &&
    Number.isFinite(approvedAt) &&
    Number.isFinite(expiresAt) &&
    approvedAt <= Date.now() &&
    expiresAt > Date.now()
  ) return approval;

  return null;
}

async function requestApproval(estimate) {
  const amount = amountText(estimate.maximum_customer_price);
  const currency = text(estimate.currency).toUpperCase();
  const phrase = `APPROVE DIRECTION ${amount} ${currency}`;

  console.log("============================================================");
  console.log("AVANTIQO CREATIVE DIRECTION APPROVAL");
  console.log("============================================================");
  console.log(`DIRECTION_PROVIDER=${estimate.provider}`);
  console.log(`DIRECTION_MODEL=${estimate.model || ""}`);
  console.log(`DIRECTION_PRICING_ID=${estimate.pricing_id}`);
  console.log(`DIRECTION_MAXIMUM_CUSTOMER_PRICE=${amount}`);
  console.log(`DIRECTION_CURRENCY=${currency}`);
  console.log(`DIRECTION_ESTIMATED_INPUT_TOKENS=${estimate.estimated_input_tokens || 0}`);
  console.log(`DIRECTION_ESTIMATED_OUTPUT_TOKENS=${estimate.estimated_output_tokens || 0}`);
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
      ? "RECOVER_COMPLETED_USAGE"
      : "REUSED_EXISTING_APPROVAL"
  }`);
  console.log(`DIRECTION_PROVIDER=${reusable.provider}`);
  console.log(`DIRECTION_MODEL=${reusable.model || ""}`);
  console.log(`DIRECTION_MAXIMUM_CUSTOMER_PRICE=${amountText(reusable.maximum_customer_price)}`);
  console.log(`DIRECTION_CURRENCY=${reusable.currency}`);
  process.exit(0);
}

const estimate = await directionEstimate(organization.id);
const approved = await requestApproval(estimate);
if (!approved) {
  console.log("DIRECTION_APPROVED=NO");
  console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
  console.log("PUBLICATION_AUTHORIZED=NO");
  process.exit(0);
}

const approvedAt = new Date();
const approval = {
  id: crypto.randomUUID(),
  approved: true,
  status: "APPROVED",
  scope: "CREATIVE_MASTER_PLAN_DIRECTION",
  command_identity: identity,
  provider: estimate.provider,
  model: estimate.model,
  capability: estimate.capability,
  pricing_id: estimate.pricing_id,
  maximum_customer_price: estimate.maximum_customer_price,
  supplier_cost_estimate: estimate.supplier_cost,
  currency: estimate.currency,
  estimated_input_tokens: estimate.estimated_input_tokens,
  estimated_output_tokens: estimate.estimated_output_tokens,
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
  },
});

console.log("DIRECTION_APPROVED=YES");
console.log(`DIRECTION_APPROVAL_ID=${approval.id}`);
console.log(`CREATIVE_MISSION_ID=${mission.id}`);
console.log(`CREATIVE_PROJECT_ID=${project.id}`);
console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
