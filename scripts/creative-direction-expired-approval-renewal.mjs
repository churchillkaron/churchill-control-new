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
const RENEWAL_CONTRACT = "CREATIVE_DIRECTION_UNUSED_APPROVAL_RENEWAL_V1";
const RENEWAL_MINUTES = 90;

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

function remainingPrice(approval = {}) {
  const explicit = Number(approval.remaining_customer_price);
  if (Number.isFinite(explicit)) return Math.max(0, explicit);
  const maximum = Number(approval.maximum_customer_price || 0);
  const spent = Number(approval.spent_customer_price || 0);
  return Math.max(0, maximum - spent);
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
const expiresAt = Date.parse(text(approval.expires_at));
const remaining = remainingPrice(approval);
const callCount = Number(approval.call_count || 0);
const maximumCalls = Number(approval.maximum_calls || 0);
const expired = !Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60_000;

const eligible =
  approval.contract === APPROVAL_CONTRACT &&
  text(approval.command_identity) === identity &&
  approval.approved === true &&
  ["APPROVED", "IN_PROGRESS"].includes(status) &&
  text(approval.id) &&
  text(approval.provider) &&
  text(approval.pricing_id) &&
  text(approval.currency) &&
  Number(approval.maximum_customer_price) > 0 &&
  Number(approval.maximum_per_call_customer_price) > 0 &&
  maximumCalls > 0 &&
  callCount < maximumCalls &&
  remaining > 0 &&
  expired &&
  !text(approval.completed_at);

if (!eligible) process.exit(0);

const renewedAt = new Date();
const previousExpiresAt = approval.expires_at || null;
const renewedApproval = {
  ...approval,
  approved: true,
  status: "APPROVED",
  expires_at: new Date(
    renewedAt.getTime() + RENEWAL_MINUTES * 60 * 1000,
  ).toISOString(),
  retry_required: false,
  execution_error: null,
  renewed_without_new_authorization_at: renewedAt.toISOString(),
  renewal_contract: RENEWAL_CONTRACT,
};

await CreativeProjectRuntime.update(project.id, {
  metadata: {
    ...metadata,
    paid_direction_approval: renewedApproval,
    paid_direction_approval_renewals: [
      ...list(metadata.paid_direction_approval_renewals),
      {
        contract: RENEWAL_CONTRACT,
        approval_id: approval.id,
        command_identity: identity,
        previous_expires_at: previousExpiresAt,
        renewed_expires_at: renewedApproval.expires_at,
        maximum_calls: maximumCalls,
        call_count: callCount,
        maximum_customer_price: Number(approval.maximum_customer_price),
        spent_customer_price: Number(approval.spent_customer_price || 0),
        remaining_customer_price: remaining,
        currency: approval.currency,
        provider: approval.provider,
        pricing_id: approval.pricing_id,
        amount_increased: false,
        call_capacity_increased: false,
        operation_scope_increased: false,
        provider_changed: false,
        pricing_changed: false,
        new_customer_authorization_required: false,
        renewed_at: renewedAt.toISOString(),
      },
    ],
    completed_direction_budget_requires_new_approval: false,
  },
});

console.log("DIRECTION_APPROVAL_RENEWED_WITHOUT_NEW_AUTHORIZATION=YES");
console.log(`DIRECTION_APPROVAL_ID=${approval.id}`);
console.log(`DIRECTION_APPROVAL_SCOPE=${approval.scope || ""}`);
console.log(`DIRECTION_CALL_COUNT=${callCount}`);
console.log(`DIRECTION_MAXIMUM_CALLS=${maximumCalls}`);
console.log(`DIRECTION_REMAINING_CUSTOMER_PRICE=${remaining}`);
console.log(`DIRECTION_CURRENCY=${approval.currency}`);
console.log(`DIRECTION_PREVIOUS_EXPIRES_AT=${previousExpiresAt || ""}`);
console.log(`DIRECTION_RENEWED_EXPIRES_AT=${renewedApproval.expires_at}`);
console.log("DIRECTION_AMOUNT_INCREASED=NO");
console.log("DIRECTION_CALL_CAPACITY_INCREASED=NO");
console.log("DIRECTION_OPERATION_SCOPE_INCREASED=NO");
console.log("NEW_CUSTOMER_AUTHORIZATION_REQUIRED=NO");
console.log("PAID_MEDIA_EXECUTION_AUTHORIZED=NO");
console.log("PUBLICATION_AUTHORIZED=NO");
