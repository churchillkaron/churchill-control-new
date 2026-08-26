import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_COVERAGE_ROUTING_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_COVERAGE_ROUTING_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
  }
}

async function one(result, label) {
  const resolved = await result;
  if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  return resolved.data || null;
}

async function many(result, label) {
  const resolved = await result;
  if (resolved.error) throw new Error(`${label}:${resolved.error.code || "UNKNOWN"}:${resolved.error.message || "ERROR"}`);
  return Array.isArray(resolved.data) ? resolved.data : [];
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const {
  resolveSecretaryActiveCoverage,
  secretaryCoverageRoutingMetadata,
} = await import("../lib/operator/secretary/SecretaryCoverageRoutingRuntime.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Coverage Routing Local Certification" }).select("id").single(),
    "SECRETARY_COVERAGE_ROUTING_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Coverage Owner", email: "coverage-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Coverage Delegate", email: "coverage-delegate@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Second Delegate", email: "coverage-delegate-2@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_COVERAGE_ROUTING_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Coverage Owner");
  const delegateId = byName.get("Coverage Delegate");
  const secondDelegateId = byName.get("Second Delegate");
  assert.ok(ownerId && delegateId && secondDelegateId);

  const context = { organizationId, actor: { partyId: ownerId }, metadata: { partyId: ownerId, localCertification: true } };
  const at = "2034-04-10T10:00:00Z";

  const unacknowledged = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      contact_party_id: delegateId,
      title: "Unacknowledged temporary coverage",
      status: "IN_PROGRESS",
      priority: "NORMAL",
      due_at: "2034-04-12T00:00:00Z",
      source: "secretary_absence_coverage",
      created_by_party_id: ownerId,
      metadata: {
        version: 1,
        owner_party_id: ownerId,
        delegate_party_id: delegateId,
        starts_at: "2034-04-10T00:00:00Z",
        ends_at: "2034-04-12T00:00:00Z",
        coverage_status: "ACTIVE",
        coverage_scopes: ["FOLLOW_UP_COORDINATION"],
        platform_permissions_mutated: false,
        delegated_binding_authority_created: false,
        external_authority_used: false,
      },
    }).select("id").single(),
    "SECRETARY_COVERAGE_ROUTING_UNACKNOWLEDGED_INSERT_FAILED",
  );

  const beforeAck = await resolveSecretaryActiveCoverage({ context, ownerPartyId: ownerId, scope: "FOLLOW_UP_COORDINATION", at });
  assert.equal(beforeAck.coverage_applied, false);
  assert.equal(beforeAck.operational_assignee_party_id, ownerId);
  assert.equal(beforeAck.routing_reason, "ACTIVE_COVERAGE_HANDOFF_NOT_ACKNOWLEDGED");
  assert.equal(beforeAck.coverage_id, unacknowledged.id);

  const ackUpdate = await supabaseAdmin.from("secretary_tasks").update({
    metadata: {
      version: 1,
      owner_party_id: ownerId,
      delegate_party_id: delegateId,
      starts_at: "2034-04-10T00:00:00Z",
      ends_at: "2034-04-12T00:00:00Z",
      coverage_status: "ACTIVE",
      coverage_scopes: ["FOLLOW_UP_COORDINATION"],
      handoff_acknowledgement: {
        evidence_id: "coverage-routing-ack-v1",
        acknowledged_by_party_id: delegateId,
        acknowledged_at: "2034-04-10T00:05:00Z",
      },
      platform_permissions_mutated: false,
      delegated_binding_authority_created: false,
      external_authority_used: false,
    },
  }).eq("organization_id", organizationId).eq("id", unacknowledged.id);
  if (ackUpdate.error) throw ackUpdate.error;

  const active = await resolveSecretaryActiveCoverage({ context, ownerPartyId: ownerId, scope: "FOLLOW_UP_COORDINATION", at });
  assert.equal(active.coverage_applied, true);
  assert.equal(active.canonical_owner_party_id, ownerId);
  assert.equal(active.operational_assignee_party_id, delegateId);
  assert.equal(active.handoff_evidence_id, "coverage-routing-ack-v1");
  assert.equal(active.binding_authority_delegated, false);
  assert.equal(active.approval_authority_delegated, false);
  assert.equal(active.platform_permissions_mutated, false);

  const routingMetadata = secretaryCoverageRoutingMetadata(active);
  assert.equal(routingMetadata.canonical_owner_party_id, ownerId);
  assert.equal(routingMetadata.operational_assignee_party_id, delegateId);
  assert.equal(routingMetadata.secretary_coverage_applied, true);
  assert.equal(routingMetadata.binding_authority_delegated, false);

  const authorityRequired = await resolveSecretaryActiveCoverage({
    context,
    ownerPartyId: ownerId,
    scope: "FOLLOW_UP_COORDINATION",
    at,
    requiresOwnerAuthority: true,
  });
  assert.equal(authorityRequired.coverage_applied, false);
  assert.equal(authorityRequired.operational_assignee_party_id, ownerId);
  assert.equal(authorityRequired.routing_reason, "OWNER_AUTHORITY_REQUIRED");

  const expired = await resolveSecretaryActiveCoverage({
    context,
    ownerPartyId: ownerId,
    scope: "FOLLOW_UP_COORDINATION",
    at: "2034-04-13T00:00:00Z",
  });
  assert.equal(expired.coverage_applied, false);
  assert.equal(expired.operational_assignee_party_id, ownerId);
  assert.equal(expired.routing_reason, "NO_ACTIVE_COVERAGE");

  await one(
    supabaseAdmin.from("secretary_tasks").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      contact_party_id: secondDelegateId,
      title: "Second overlapping coverage",
      status: "IN_PROGRESS",
      priority: "NORMAL",
      due_at: "2034-04-11T00:00:00Z",
      source: "secretary_absence_coverage",
      created_by_party_id: ownerId,
      metadata: {
        version: 1,
        owner_party_id: ownerId,
        delegate_party_id: secondDelegateId,
        starts_at: "2034-04-10T06:00:00Z",
        ends_at: "2034-04-11T12:00:00Z",
        coverage_status: "ACTIVE",
        coverage_scopes: ["FOLLOW_UP_COORDINATION"],
        handoff_acknowledgement: {
          evidence_id: "coverage-routing-ack-v2",
          acknowledged_by_party_id: secondDelegateId,
          acknowledged_at: "2034-04-10T06:05:00Z",
        },
        platform_permissions_mutated: false,
        delegated_binding_authority_created: false,
        external_authority_used: false,
      },
    }).select("id").single(),
    "SECRETARY_COVERAGE_ROUTING_OVERLAP_INSERT_FAILED",
  );

  await assert.rejects(
    () => resolveSecretaryActiveCoverage({ context, ownerPartyId: ownerId, scope: "FOLLOW_UP_COORDINATION", at }),
    /SECRETARY_ACTIVE_COVERAGE_AMBIGUOUS/,
  );

  await assert.rejects(
    () => resolveSecretaryActiveCoverage({ context, ownerPartyId: ownerId, scope: "PAYMENT", at }),
    /SECRETARY_COVERAGE_ROUTING_SCOPE_FORBIDDEN:PAYMENT/,
  );

  console.log("SECRETARY_COVERAGE_ROUTING_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_COVERAGE_ROUTING_ACKNOWLEDGEMENT_REQUIRED=true");
  console.log("SECRETARY_COVERAGE_ROUTING_ACTIVE_DELEGATE=true");
  console.log("SECRETARY_COVERAGE_ROUTING_CANONICAL_OWNER_PRESERVED=true");
  console.log("SECRETARY_COVERAGE_ROUTING_EXPIRED_OWNER_RESTORED=true");
  console.log("SECRETARY_COVERAGE_ROUTING_OWNER_AUTHORITY_PRESERVED=true");
  console.log("SECRETARY_COVERAGE_ROUTING_AMBIGUITY_FAILS_CLOSED=true");
  console.log("SECRETARY_COVERAGE_ROUTING_FORBIDDEN_AUTHORITY_SCOPE_REJECTED=true");
  console.log("SECRETARY_COVERAGE_ROUTING_PLATFORM_PERMISSIONS_MUTATED=false");
  console.log("SECRETARY_COVERAGE_ROUTING_BINDING_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_COVERAGE_ROUTING_APPROVAL_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) console.error(`SECRETARY_COVERAGE_ROUTING_LOCAL_CLEANUP_WARNING=${cleanup.error.code || "UNKNOWN"}`);
  }
}
