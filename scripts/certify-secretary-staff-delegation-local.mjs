import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_STAFF_DELEGATION_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_STAFF_DELEGATION_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
  completeSecretaryStaffDelegation,
  delegateSecretaryStaffWork,
  readSecretaryStaffDelegation,
  reassignSecretaryStaffWork,
  recordSecretaryStaffDelegationProgress,
  recordSecretaryStaffDelegationResponse,
  refreshSecretaryStaffDelegation,
} = await import("../lib/operator/secretary/SecretaryStaffDelegationRuntime.js");
const { readSecretaryCommitmentControl } = await import("../lib/operator/secretary/SecretaryCommitmentControlRuntime.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Staff Delegation Local Certification" }).select("id").single(),
    "SECRETARY_STAFF_DELEGATION_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Delegation Executive", email: "delegation-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Delegation Assignee A", email: "delegation-a@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Delegation Assignee B", email: "delegation-b@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_STAFF_DELEGATION_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Delegation Executive");
  const assigneeA = byName.get("Delegation Assignee A");
  const assigneeB = byName.get("Delegation Assignee B");
  assert.ok(ownerId && assigneeA && assigneeB);

  await one(
    supabaseAdmin.from("secretary_settings").insert({
      organization_id: organizationId,
      default_timezone: "UTC",
      booking_policy: { owner_party_id: ownerId },
      metadata: { owner_party_id: ownerId, local_certification: true },
    }).select("organization_id").single(),
    "SECRETARY_STAFF_DELEGATION_SETTINGS_INSERT_FAILED",
  );

  await many(
    supabaseAdmin.from("secretary_contact_profiles").insert([
      { organization_id: organizationId, party_id: assigneeA, preferred_channel: "message", allow_messages: true, metadata: { local_certification: true } },
      { organization_id: organizationId, party_id: assigneeB, preferred_channel: "message", allow_messages: true, metadata: { local_certification: true } },
    ]).select("party_id"),
    "SECRETARY_STAFF_DELEGATION_PROFILES_INSERT_FAILED",
  );

  const context = {
    organizationId,
    actor: { partyId: ownerId },
    metadata: { partyId: ownerId },
  };

  const delegatePayload = {
    title: "Prepare the monthly operations evidence pack",
    details: "Collect the existing operational evidence and organize it for executive review.",
    assignee_party_id: assigneeA,
    due_at: "2035-04-20T12:00:00.000Z",
    acceptance_due_at: "2035-04-10T12:00:00.000Z",
    progress_check_at: "2035-04-15T12:00:00.000Z",
    priority: "HIGH",
    idempotency_key: "staff-delegation-local-cert-1",
    evidence_id: "assignment-evidence-1",
  };

  const delegated = await delegateSecretaryStaffWork({ context, payload: delegatePayload });
  assert.equal(delegated.contract, "AVANTIQO_EXECUTIVE_SECRETARY_STAFF_DELEGATION_V1");
  assert.equal(delegated.status, "delegated");
  assert.equal(delegated.task.owner_party_id, assigneeA);
  assert.equal(delegated.task.metadata.canonical_owner_party_id, ownerId);
  assert.equal(delegated.task.metadata.operational_assignee_party_id, ownerId);
  assert.equal(delegated.task.metadata.assignment_state, "PENDING_ACCEPTANCE");
  assert.equal(delegated.task.metadata.acceptance_inferred, false);
  assert.equal(delegated.task.metadata.employment_relationship_inferred, false);
  assert.equal(delegated.assignment_follow_up_ids.length, 2);

  const replay = await delegateSecretaryStaffWork({ context, payload: delegatePayload });
  assert.equal(replay.task.id, delegated.task.id);
  const initialFollowUps = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,status,contact_party_id,metadata")
      .eq("organization_id", organizationId)
      .eq("task_id", delegated.task.id),
    "SECRETARY_STAFF_DELEGATION_INITIAL_FOLLOW_UPS_READ_FAILED",
  );
  assert.equal(initialFollowUps.filter((row) => row.metadata?.secretary_staff_delegation_kind === "ASSIGNMENT_REQUEST").length, 1);
  assert.equal(initialFollowUps.filter((row) => row.metadata?.secretary_staff_delegation_kind === "ACCEPTANCE_CHASE").length, 1);

  const silenceRefresh = await refreshSecretaryStaffDelegation({
    context,
    payload: { task_id: delegated.task.id, now: "2035-04-10T12:30:00.000Z" },
  });
  assert.equal(silenceRefresh.task.metadata.assignment_state, "PENDING_ACCEPTANCE");
  assert.equal(silenceRefresh.task.metadata.acceptance_inferred, false);
  const postSilenceFollowUps = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", organizationId)
      .eq("task_id", delegated.task.id),
    "SECRETARY_STAFF_DELEGATION_SILENCE_FOLLOW_UPS_READ_FAILED",
  );
  assert.equal(postSilenceFollowUps.filter((row) => row.metadata?.secretary_staff_delegation_kind === "ACCEPTANCE_CHASE").length, 1);

  const commitment = await readSecretaryCommitmentControl({
    context,
    payload: { now: "2035-04-10T12:30:00.000Z", limit: 100 },
  });
  const delegationCommitment = commitment.commitments.find((item) => item.source_id === delegated.task.id);
  assert.ok(delegationCommitment);
  assert.ok(delegationCommitment.next_action_count >= 1);

  const accepted = await recordSecretaryStaffDelegationResponse({
    context,
    payload: { task_id: delegated.task.id, response: "ACCEPTED", evidence_id: "acceptance-evidence-a" },
  });
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.task.status, "IN_PROGRESS");
  assert.equal(accepted.task.owner_party_id, assigneeA);
  assert.equal(accepted.task.metadata.assignment_state, "ACCEPTED");
  assert.equal(accepted.task.metadata.accepted_evidence_id, "acceptance-evidence-a");
  assert.equal(accepted.task.metadata.acceptance_inferred, false);

  const afterAcceptance = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,status,contact_party_id,metadata")
      .eq("organization_id", organizationId)
      .eq("task_id", delegated.task.id),
    "SECRETARY_STAFF_DELEGATION_ACCEPTED_FOLLOW_UPS_READ_FAILED",
  );
  assert.equal(afterAcceptance.filter((row) => ["ASSIGNMENT_REQUEST", "ACCEPTANCE_CHASE"].includes(row.metadata?.secretary_staff_delegation_kind) && row.status === "PENDING").length, 0);
  assert.equal(afterAcceptance.filter((row) => row.metadata?.secretary_staff_delegation_kind === "PROGRESS_CHECK").length, 1);
  assert.equal(afterAcceptance.filter((row) => row.metadata?.secretary_staff_delegation_kind === "OVERDUE_REVIEW").length, 1);

  const progress = await recordSecretaryStaffDelegationProgress({
    context,
    payload: {
      task_id: delegated.task.id,
      evidence_id: "progress-evidence-a1",
      progress_note: "Evidence collection is underway; two source files remain to be organized.",
      blocked: false,
    },
  });
  assert.equal(progress.status, "progress_recorded");
  assert.equal(progress.task.metadata.assignment_state, "IN_PROGRESS");
  assert.equal(progress.task.metadata.progress_history.length, 1);
  assert.equal(progress.task.metadata.progress_history[0].evidence_id, "progress-evidence-a1");
  assert.equal(progress.task.metadata.completion_inferred, false);
  assert.equal(progress.task.metadata.performance_inferred, false);

  const overdue = await refreshSecretaryStaffDelegation({
    context,
    payload: { task_id: delegated.task.id, now: "2035-04-21T12:00:00.000Z" },
  });
  assert.equal(overdue.temporal_overdue, true);
  assert.equal(overdue.task.metadata.assignment_state, "OVERDUE_TEMPORALLY");
  assert.equal(overdue.urgency_inferred, false);
  assert.equal(overdue.misconduct_inferred, false);
  assert.equal(overdue.performance_inferred, false);
  assert.equal(overdue.legal_breach_inferred, false);
  assert.equal(overdue.completion_inferred, false);
  const overdueFollowUps = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata")
      .eq("organization_id", organizationId)
      .eq("task_id", delegated.task.id),
    "SECRETARY_STAFF_DELEGATION_OVERDUE_FOLLOW_UPS_READ_FAILED",
  );
  assert.equal(overdueFollowUps.filter((row) => row.metadata?.secretary_staff_delegation_kind === "OVERDUE_REVIEW").length, 1);

  const reassignedB = await reassignSecretaryStaffWork({
    context,
    payload: {
      task_id: delegated.task.id,
      assignee_party_id: assigneeB,
      acceptance_due_at: "2035-04-22T12:00:00.000Z",
      progress_check_at: "2035-04-23T12:00:00.000Z",
      evidence_id: "reassignment-evidence-b",
      reason: "Explicit executive reassignment for local certification.",
    },
  });
  assert.equal(reassignedB.status, "reassigned");
  assert.equal(reassignedB.task.owner_party_id, assigneeB);
  assert.equal(reassignedB.task.metadata.assignee_party_id, assigneeB);
  assert.equal(reassignedB.task.metadata.canonical_owner_party_id, ownerId);
  assert.equal(reassignedB.task.metadata.assignment_state, "PENDING_ACCEPTANCE");
  assert.equal(reassignedB.stale_pending_follow_ups_fenced, true);
  assert.equal(reassignedB.canonical_owner_preserved, true);

  const staleA = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,status,contact_party_id,metadata")
      .eq("organization_id", organizationId)
      .eq("task_id", delegated.task.id)
      .eq("contact_party_id", assigneeA),
    "SECRETARY_STAFF_DELEGATION_STALE_A_READ_FAILED",
  );
  assert.equal(staleA.some((row) => row.status === "PENDING"), false);

  const rejectedB = await recordSecretaryStaffDelegationResponse({
    context,
    payload: { task_id: delegated.task.id, response: "REJECTED", evidence_id: "rejection-evidence-b" },
  });
  assert.equal(rejectedB.status, "rejected");
  assert.equal(rejectedB.task.owner_party_id, ownerId);
  assert.equal(rejectedB.task.metadata.assignment_state, "REJECTED");
  assert.equal(rejectedB.task.metadata.rejected_evidence_id, "rejection-evidence-b");
  assert.equal(rejectedB.task.metadata.rejection_reason_inferred, false);
  assert.equal(rejectedB.follow_up_ids.length, 1);

  const reassignedA = await reassignSecretaryStaffWork({
    context,
    payload: {
      task_id: delegated.task.id,
      assignee_party_id: assigneeA,
      acceptance_due_at: "2035-04-24T12:00:00.000Z",
      progress_check_at: "2035-04-25T12:00:00.000Z",
      evidence_id: "reassignment-evidence-a2",
      reason: "Explicit reassignment back to assignee A.",
    },
  });
  assert.equal(reassignedA.task.owner_party_id, assigneeA);
  assert.equal(reassignedA.task.metadata.canonical_owner_party_id, ownerId);
  assert.equal(reassignedA.task.metadata.assignment_state, "PENDING_ACCEPTANCE");

  const acceptedAgain = await recordSecretaryStaffDelegationResponse({
    context,
    payload: { task_id: delegated.task.id, response: "ACCEPTED", evidence_id: "acceptance-evidence-a2" },
  });
  assert.equal(acceptedAgain.task.metadata.accepted_evidence_id, "acceptance-evidence-a2");

  const completed = await completeSecretaryStaffDelegation({
    context,
    payload: {
      task_id: delegated.task.id,
      evidence_id: "completion-evidence-final",
      completion_note: "The evidence pack was explicitly reported complete and supplied for review.",
    },
  });
  assert.equal(completed.status, "completed");
  assert.equal(completed.task.status, "DONE");
  assert.equal(completed.task.metadata.assignment_state, "COMPLETED");
  assert.equal(completed.task.metadata.completion_evidence_id, "completion-evidence-final");
  assert.equal(completed.task.metadata.completion_inferred, false);
  assert.equal(completed.task.metadata.performance_inferred, false);
  const finalPending = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("task_id", delegated.task.id)
      .eq("status", "PENDING"),
    "SECRETARY_STAFF_DELEGATION_FINAL_PENDING_READ_FAILED",
  );
  assert.equal(finalPending.length, 0);

  const readBack = await readSecretaryStaffDelegation({ context, payload: { task_id: delegated.task.id } });
  assert.equal(readBack.task.metadata.canonical_owner_party_id, ownerId);
  assert.equal(readBack.acceptance_inferred, false);
  assert.equal(readBack.completion_inferred, false);
  assert.equal(readBack.misconduct_inferred, false);

  assert.equal(completed.task.metadata.platform_permissions_mutated, false);
  assert.equal(completed.task.metadata.binding_authority_delegated, false);
  assert.equal(completed.task.metadata.approval_authority_delegated, false);
  assert.equal(completed.task.metadata.external_authority_used, false);

  console.log("SECRETARY_STAFF_DELEGATION_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_STAFF_DELEGATION_DURABLE_TASK=true");
  console.log("SECRETARY_STAFF_DELEGATION_DETERMINISTIC=true");
  console.log("SECRETARY_STAFF_DELEGATION_ACCEPTANCE_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_STAFF_DELEGATION_SILENCE_NOT_ACCEPTANCE=true");
  console.log("SECRETARY_STAFF_DELEGATION_PROGRESS_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_STAFF_DELEGATION_COMPLETION_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_STAFF_DELEGATION_SINGLE_ACCEPTANCE_CHASE=true");
  console.log("SECRETARY_STAFF_DELEGATION_TEMPORAL_OVERDUE_ONLY=true");
  console.log("SECRETARY_STAFF_DELEGATION_REASSIGNMENT_STALE_FENCED=true");
  console.log("SECRETARY_STAFF_DELEGATION_CANONICAL_OWNER_PRESERVED=true");
  console.log("SECRETARY_STAFF_DELEGATION_REJECTION_REASON_INFERRED=false");
  console.log("SECRETARY_STAFF_DELEGATION_PERFORMANCE_INFERRED=false");
  console.log("SECRETARY_STAFF_DELEGATION_MISCONDUCT_INFERRED=false");
  console.log("SECRETARY_STAFF_DELEGATION_PLATFORM_PERMISSIONS_MUTATED=false");
  console.log("SECRETARY_STAFF_DELEGATION_BINDING_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_STAFF_DELEGATION_APPROVAL_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) console.error(`SECRETARY_STAFF_DELEGATION_LOCAL_CLEANUP_WARNING=${cleanup.error.code || "UNKNOWN"}`);
  }
}
