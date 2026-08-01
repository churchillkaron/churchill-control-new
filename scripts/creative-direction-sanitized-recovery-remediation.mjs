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
  { WalletRuntime },
] = await Promise.all([
  import("@/lib/shared/supabase/admin"),
  import("@/lib/creative/missions/runtime/CreativeMissionRuntime"),
  import("@/lib/creative/projects/repositories/CreativeProjectRepository"),
  import("@/lib/creative/projects/runtime/CreativeProjectRuntime"),
  import("@/lib/platform/service-runtime/wallet/runtime/WalletRuntime"),
]);

const REMEDIATION_CONTRACT =
  "CREATIVE_DIRECTION_SANITIZED_ASSET_RECOVERY_REMEDIATION_V1";
const APPROVAL_MINUTES = 90;

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
if (
  object(metadata.direction_sanitized_recovery_remediation).contract ===
  REMEDIATION_CONTRACT
) {
  console.log("DIRECTION_SANITIZED_RECOVERY_REMEDIATION_REUSED=YES");
  process.exit(0);
}

const approval = object(metadata.paid_direction_approval);
const source = text(metadata.selected_assets_source).toUpperCase();
const eligible =
  source.endsWith("_V5") &&
  text(approval.scope).toUpperCase() ===
    "CREATIVE_DIRECTION_CONTINUATION_BUDGET" &&
  text(approval.status).toUpperCase() === "COMPLETED" &&
  Number(approval.maximum_calls || 0) === 3 &&
  Number(approval.call_count || 0) === 3;

if (!eligible) process.exit(0);

const operations = list(approval.operations);
if (operations.length !== 3) {
  throw new Error(
    `CREATIVE_DIRECTION_DUPLICATE_CONTINUATION_EVIDENCE_INVALID:${operations.length}`,
  );
}

const refunded = [];
for (const operation of operations) {
  const usageId = text(operation.usage_id);
  const amount = Number(operation.customer_price || 0);
  if (!usageId || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("CREATIVE_DIRECTION_DUPLICATE_USAGE_REFUND_EVIDENCE_REQUIRED");
  }

  const transaction = await WalletRuntime.refund({
    organization_id: organization.id,
    amount,
    currency: approval.currency,
    usage_id: usageId,
    provider: approval.provider,
    reference: `creative-direction-sanitized-recovery:${approval.id}:${usageId}`,
    metadata: {
      refund_contract: REMEDIATION_CONTRACT,
      creative_project_id: project.id,
      creative_mission_id: mission.id,
      direction_approval_id: approval.id,
      operation: operation.operation || null,
      reason:
        "DUPLICATE_DIRECTION_EXECUTION_AFTER_GENERIC_NON_FILE_CONTAINER_SANITIZATION",
      original_charge_retained_in_usage_ledger: true,
      corrective_wallet_credit: true,
      media_generation_authorized: false,
      publication_authorized: false,
    },
  });

  refunded.push({
    usage_id: usageId,
    operation: operation.operation || null,
    customer_price: amount,
    refund_transaction_id: transaction?.id || null,
  });
}

const refundedAmount = Number(
  refunded.reduce((sum, item) => sum + item.customer_price, 0).toFixed(6),
);
const approvedAt = new Date();
const replacement = {
  ...approval,
  id: crypto.randomUUID(),
  approved: true,
  status: "APPROVED",
  call_count: 0,
  spent_customer_price: 0,
  remaining_customer_price: Number(approval.maximum_customer_price),
  operations: [],
  approved_at: approvedAt.toISOString(),
  expires_at: new Date(
    approvedAt.getTime() + APPROVAL_MINUTES * 60 * 1000,
  ).toISOString(),
  completed_at: null,
  retry_required: false,
  execution_error: null,
  remediation_contract: REMEDIATION_CONTRACT,
  remediation_of_approval_id: approval.id,
  duplicate_usage_refunded_amount: refundedAmount,
  media_generation_authorized: false,
  publication_authorized: false,
};

await CreativeProjectRuntime.update(project.id, {
  metadata: {
    ...metadata,
    paid_direction_approval_history: [
      ...list(metadata.paid_direction_approval_history),
      {
        ...approval,
        approved: false,
        status: "COMPLETED_REFUNDED_DUPLICATE",
        refunded_customer_price: refundedAmount,
        refunded_at: approvedAt.toISOString(),
        remediation_contract: REMEDIATION_CONTRACT,
      },
    ],
    paid_direction_approval: replacement,
    creative_reasoning_budget: {
      contract: "CREATIVE_REASONING_BUDGET_V2",
      id: replacement.id,
      maximum_calls: replacement.maximum_calls,
      maximum_requested_output_tokens:
        replacement.maximum_calls * 20000,
      maximum_single_call_output_tokens: 20000,
      maximum_prompt_characters: 1000000,
      maximum_total_prompt_characters:
        replacement.maximum_calls * 1000000,
      maximum_customer_price: replacement.maximum_customer_price,
      currency: replacement.currency,
    },
    direction_sanitized_recovery_remediation: {
      contract: REMEDIATION_CONTRACT,
      remediated_at: approvedAt.toISOString(),
      previous_approval_id: approval.id,
      replacement_approval_id: replacement.id,
      refunded_customer_price: refundedAmount,
      refunded_usages: refunded,
      recovery_mode: "ORIGINAL_FULL_APPROVAL_USAGE_SEQUENCE",
      media_generation_authorized: false,
      publication_authorized: false,
    },
  },
});

console.log("DIRECTION_DUPLICATE_CONTINUATION_REFUNDED=YES");
console.log(`DIRECTION_REFUNDED_CUSTOMER_PRICE=${refundedAmount}`);
console.log(`DIRECTION_REFUND_CURRENCY=${approval.currency}`);
console.log(`DIRECTION_REPLACEMENT_APPROVAL_ID=${replacement.id}`);
console.log(`DIRECTION_RESTORED_MAXIMUM_CALLS=${replacement.maximum_calls}`);
console.log("PREVIOUS_SUCCESSFUL_DIRECTION_USAGE_WILL_BE_RECOVERED=YES");
console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
