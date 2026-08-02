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
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/missions/runtime/CreativeMissionRuntime"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
]);

const APPROVAL_CONTRACT = "CREATIVE_DIRECTION_BUDGET_APPROVAL_V2";
const APPROVAL_MINUTES = 90;
const REQUIRED_TEMPORAL_CALLS = 24;
const INVALID_COUNTED_STATUS_PARTS = Object.freeze([
  "REFUNDED",
  "REVOKED",
  "CANCELLED",
  "CANCELED",
  "REJECTED",
  "SETTLEMENT_MISMATCH",
]);

function text(value) {
  return String(value ?? "").trim();
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function normalized(value) {
  return text(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function commandIdentity(organizationId, value) {
  return crypto
    .createHash("sha256")
    .update(`${organizationId}\n${normalized(value)}`)
    .digest("hex");
}

function significantTokens(value) {
  const ignored = new Set([
    "and", "bar", "co", "company", "ltd", "limited", "restaurant", "the",
  ]);
  return normalized(value)
    .split(/\s+/)
    .filter((token) => token.length > 2 && !ignored.has(token));
}

function amountText(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toFixed(6).replace(/\.?0+$/, "");
}

function countedApproval(approval = {}, identity = "") {
  const status = text(approval.status).toUpperCase();
  return (
    approval.contract === APPROVAL_CONTRACT &&
    text(approval.id) &&
    text(approval.command_identity) === identity &&
    Number.isFinite(Number(approval.maximum_calls)) &&
    Number(approval.maximum_calls) > 0 &&
    !INVALID_COUNTED_STATUS_PARTS.some((part) => status.includes(part))
  );
}

function approvalChain(metadata = {}, identity = "") {
  const byId = new Map();
  for (const approval of [
    ...list(metadata.paid_direction_approval_history),
    object(metadata.paid_direction_approval),
  ]) {
    const id = text(approval?.id);
    if (id) byId.set(id, approval);
  }
  return [...byId.values()].filter((approval) =>
    countedApproval(approval, identity),
  );
}

function cumulativeCalls(approvals = []) {
  return approvals.reduce(
    (sum, approval) => sum + Number(approval.maximum_calls || 0),
    0,
  );
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

  const organizations = list(data).filter((item) => item?.id && item?.name);
  if (explicit) {
    return organizations.find((item) => text(item.id) === explicit) || null;
  }

  const command = normalized(intent);
  return organizations
    .map((organization) => {
      const name = normalized(organization.name);
      let score = name && command.includes(name) ? 1000 : 0;
      for (const token of significantTokens(organization.name)) {
        if (new RegExp(`\\b${token}\\b`, "i").test(command)) score += 150;
      }
      return { organization, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)[0]?.organization || null;
}

function reusableMission(missions, identity) {
  return list(missions)
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

async function requestApproval({ calls, amount, currency }) {
  const phrase = `APPROVE DIRECTION CONTINUATION ${amountText(amount)} ${currency}`;
  console.log("============================================================");
  console.log("AVANTIQO CREATIVE DIRECTION CONTINUATION APPROVAL");
  console.log("============================================================");
  console.log(`CONTINUATION_MAXIMUM_CALLS=${calls}`);
  console.log(`CONTINUATION_MAXIMUM_CUSTOMER_PRICE=${amountText(amount)}`);
  console.log(`CONTINUATION_CURRENCY=${currency}`);
  console.log("CONTINUATION_REASON=ORIGINAL_TEMPORAL_ESTIMATE_OMITTED_CONCEPT_REPAIR_RESERVE");
  console.log("PREVIOUS_SUCCESSFUL_DIRECTION_USAGE_WILL_BE_REUSED=YES");
  console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
  console.log("PUBLICATION_AUTHORIZED=NO");
  console.log("============================================================");

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("CREATIVE_INTERACTIVE_DIRECTION_CONTINUATION_APPROVAL_REQUIRED");
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

const project = await CreativeProjectRepository.getByMission({
  organization_id: organization.id,
  creative_mission_id: mission.id,
});
if (!project) process.exit(0);

const metadata = object(project.metadata);
const chain = approvalChain(metadata, identity);
const authorizedCalls = cumulativeCalls(chain);
const chainIds = chain.map((approval) => approval.id);

if (authorizedCalls >= REQUIRED_TEMPORAL_CALLS) {
  console.log("DIRECTION_CONTINUATION_PROMPT_BLOCKED=YES");
  console.log(`DIRECTION_CUMULATIVE_AUTHORIZED_CALLS=${authorizedCalls}`);
  console.log(`DIRECTION_REQUIRED_CALLS=${REQUIRED_TEMPORAL_CALLS}`);
  console.log(`DIRECTION_APPROVAL_CHAIN_IDS=${chainIds.join(",")}`);
  console.log("NEW_DIRECTION_AUTHORIZATION_REQUIRED=NO");
  console.log("NEW_PROVIDER_EXECUTION_AUTHORIZED=NO");
  console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
  console.log("PUBLICATION_AUTHORIZED=NO");
  process.exit(0);
}

const previous = object(metadata.paid_direction_approval);
const previousStatus = text(previous.status).toUpperCase();
const previousCalls = Number(previous.maximum_calls || 0);

if (
  previous.contract !== APPROVAL_CONTRACT ||
  text(previous.command_identity) !== identity ||
  !["COMPLETED", "COMPLETED_ARCHIVED"].includes(previousStatus) ||
  previousCalls <= 0
) {
  process.exit(0);
}

const additionalCalls = REQUIRED_TEMPORAL_CALLS - authorizedCalls;
if (additionalCalls <= 0) process.exit(0);

const perCall = Number(previous.maximum_per_call_customer_price || 0);
if (!Number.isFinite(perCall) || perCall <= 0) {
  throw new Error("CREATIVE_DIRECTION_CONTINUATION_PRICE_REQUIRED");
}

const maximumCustomerPrice = Number((perCall * additionalCalls).toFixed(6));
const currency = text(previous.currency).toUpperCase();
const approved = await requestApproval({
  calls: additionalCalls,
  amount: maximumCustomerPrice,
  currency,
});

if (!approved) {
  console.log("DIRECTION_CONTINUATION_APPROVED=NO");
  console.log("CREATIVE_COMMAND_STOP_REQUIRED=YES");
  process.exit(2);
}

const approvedAt = new Date();
const approval = {
  contract: APPROVAL_CONTRACT,
  id: crypto.randomUUID(),
  approved: true,
  status: "APPROVED",
  scope: "CREATIVE_DIRECTION_CONTINUATION_BUDGET",
  command_identity: identity,
  provider: previous.provider,
  model: previous.model || null,
  capability: previous.capability,
  pricing_id: previous.pricing_id,
  maximum_calls: additionalCalls,
  call_count: 0,
  maximum_per_call_customer_price: perCall,
  maximum_customer_price: maximumCustomerPrice,
  spent_customer_price: 0,
  remaining_customer_price: maximumCustomerPrice,
  supplier_cost_estimate: Number((
    Number(previous.supplier_cost_estimate || 0) *
    additionalCalls /
    Math.max(1, previousCalls)
  ).toFixed(6)),
  currency,
  estimated_input_tokens: 0,
  estimated_output_tokens: additionalCalls * 20000,
  allowed_operations: list(previous.allowed_operations),
  budget_calculation: "SUPPLEMENTAL_CONCEPT_REPAIR_RESERVE",
  continuation_of_approval_id: previous.id || null,
  previous_approved_call_count: authorizedCalls,
  required_total_call_capacity: REQUIRED_TEMPORAL_CALLS,
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
    ...metadata,
    paid_direction_approval_history: [
      ...list(metadata.paid_direction_approval_history),
      ...(list(metadata.paid_direction_approval_history).some((item) =>
        text(item?.id) === text(previous.id),
      ) ? [] : [previous]),
    ],
    paid_direction_approval: approval,
    creative_reasoning_budget: {
      contract: "CREATIVE_REASONING_BUDGET_V2",
      id: approval.id,
      maximum_calls: additionalCalls,
      maximum_requested_output_tokens: additionalCalls * 20000,
      maximum_single_call_output_tokens: 20000,
      maximum_prompt_characters: 1000000,
      maximum_total_prompt_characters: additionalCalls * 1000000,
      maximum_customer_price: maximumCustomerPrice,
      currency,
    },
    completed_direction_budget_requires_new_approval: false,
    direction_continuation_approved_at: approvedAt.toISOString(),
  },
});

console.log("DIRECTION_CONTINUATION_APPROVED=YES");
console.log(`DIRECTION_APPROVAL_ID=${approval.id}`);
console.log(`DIRECTION_MAXIMUM_CALLS=${approval.maximum_calls}`);
console.log(`DIRECTION_MAXIMUM_CUSTOMER_PRICE=${amountText(maximumCustomerPrice)}`);
console.log(`DIRECTION_CURRENCY=${currency}`);
console.log(`CREATIVE_MISSION_ID=${mission.id}`);
console.log(`CREATIVE_PROJECT_ID=${project.id}`);
console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
