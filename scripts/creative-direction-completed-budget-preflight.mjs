#!/usr/bin/env node

import crypto from "node:crypto";
import process from "node:process";
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

  const organizations = (data || []).filter((item) => item?.id && item?.name);
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
const approval = object(metadata.paid_direction_approval);
const status = text(approval.status).toUpperCase();
if (!["COMPLETED", "COMPLETED_ARCHIVED"].includes(status)) {
  process.exit(0);
}

const chain = approvalChain(metadata, identity);
const authorizedCalls = cumulativeCalls(chain);
const approvalIds = chain.map((item) => item.id);

if (authorizedCalls >= REQUIRED_TEMPORAL_CALLS) {
  const recoveryApproval = {
    ...approval,
    approved: false,
    status: "COMPLETED",
    recovery_only: true,
    cumulative_authorized_calls: authorizedCalls,
    required_total_call_capacity: REQUIRED_TEMPORAL_CALLS,
    new_provider_execution_authorized: false,
    media_generation_authorized: false,
    publication_authorized: false,
  };

  await CreativeProjectRuntime.update(project.id, {
    metadata: {
      ...metadata,
      paid_direction_approval: recoveryApproval,
      completed_direction_budget_requires_new_approval: false,
      direction_cumulative_authorization: {
        contract: "CREATIVE_DIRECTION_CUMULATIVE_AUTHORIZATION_V1",
        command_identity: identity,
        approval_ids: approvalIds,
        authorized_calls: authorizedCalls,
        required_calls: REQUIRED_TEMPORAL_CALLS,
        sufficient: true,
        recovery_only: true,
        new_provider_execution_authorized: false,
        media_generation_authorized: false,
        publication_authorized: false,
        evaluated_at: new Date().toISOString(),
      },
    },
  });

  console.log("COMPLETED_DIRECTION_BUDGET_RETAINED_FOR_RECOVERY=YES");
  console.log(`DIRECTION_CUMULATIVE_AUTHORIZED_CALLS=${authorizedCalls}`);
  console.log(`DIRECTION_REQUIRED_CALLS=${REQUIRED_TEMPORAL_CALLS}`);
  console.log(`DIRECTION_APPROVAL_CHAIN_IDS=${approvalIds.join(",")}`);
  console.log("NEW_DIRECTION_AUTHORIZATION_REQUIRED=NO");
  console.log("NEW_PROVIDER_EXECUTION_AUTHORIZED=NO");
  console.log(`CREATIVE_MISSION_ID=${mission.id}`);
  console.log(`CREATIVE_PROJECT_ID=${project.id}`);
  console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
  console.log("PUBLICATION_AUTHORIZED=NO");
  process.exit(0);
}

if (status === "COMPLETED_ARCHIVED") {
  console.log("COMPLETED_DIRECTION_BUDGET_ALREADY_ARCHIVED=YES");
  console.log(`DIRECTION_CUMULATIVE_AUTHORIZED_CALLS=${authorizedCalls}`);
  console.log(`DIRECTION_REQUIRED_CALLS=${REQUIRED_TEMPORAL_CALLS}`);
  process.exit(0);
}

const history = list(metadata.paid_direction_approval_history);
const approvalId = text(approval.id);
const alreadyArchived = approvalId && history.some((item) =>
  text(item?.id) === approvalId,
);
const archivedAt = new Date().toISOString();
const archivedApproval = {
  ...approval,
  approved: false,
  status: "COMPLETED_ARCHIVED",
  archived_at: archivedAt,
  archived_reason: "CUMULATIVE_DIRECTION_CAPACITY_BELOW_REQUIRED_TOTAL",
  cumulative_authorized_calls: authorizedCalls,
  required_total_call_capacity: REQUIRED_TEMPORAL_CALLS,
  media_generation_authorized: false,
  publication_authorized: false,
};

await CreativeProjectRuntime.update(project.id, {
  metadata: {
    ...metadata,
    paid_direction_approval_history: alreadyArchived
      ? history
      : [...history, archivedApproval],
    paid_direction_approval: archivedApproval,
    completed_direction_budget_requires_new_approval: true,
    completed_direction_budget_archived_at: archivedAt,
    direction_cumulative_authorization: {
      contract: "CREATIVE_DIRECTION_CUMULATIVE_AUTHORIZATION_V1",
      command_identity: identity,
      approval_ids: approvalIds,
      authorized_calls: authorizedCalls,
      required_calls: REQUIRED_TEMPORAL_CALLS,
      sufficient: false,
      recovery_only: false,
      media_generation_authorized: false,
      publication_authorized: false,
      evaluated_at: archivedAt,
    },
  },
});

console.log("COMPLETED_DIRECTION_BUDGET_ARCHIVED=YES");
console.log(`ARCHIVED_DIRECTION_APPROVAL_ID=${approvalId}`);
console.log(`DIRECTION_CUMULATIVE_AUTHORIZED_CALLS=${authorizedCalls}`);
console.log(`DIRECTION_REQUIRED_CALLS=${REQUIRED_TEMPORAL_CALLS}`);
console.log(`CREATIVE_MISSION_ID=${mission.id}`);
console.log(`CREATIVE_PROJECT_ID=${project.id}`);
console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
