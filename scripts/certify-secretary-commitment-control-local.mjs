import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_COMMITMENT_CONTROL_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_COMMITMENT_CONTROL_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
const { readSecretaryCommitmentControl } = await import("../lib/operator/secretary/SecretaryCommitmentControlRuntime.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Commitment Control Local Certification" }).select("id").single(),
    "SECRETARY_COMMITMENT_CONTROL_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Commitment Executive", email: "commitment-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Commitment Delegate", email: "commitment-delegate@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Commitment Contact", email: "commitment-contact@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_COMMITMENT_CONTROL_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Commitment Executive");
  const delegateId = byName.get("Commitment Delegate");
  const contactId = byName.get("Commitment Contact");
  assert.ok(ownerId && delegateId && contactId);

  const fixedNow = "2035-04-10T12:00:00.000Z";

  const parentTask = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      contact_party_id: contactId,
      title: "Meeting commitment requiring executive decision",
      details: "Close the explicit meeting action without crossing approval authority.",
      status: "OPEN",
      priority: "HIGH",
      due_at: "2035-04-09T12:00:00.000Z",
      source: "secretary_meeting",
      created_by_party_id: ownerId,
      metadata: {
        canonical_owner_party_id: ownerId,
        operational_assignee_party_id: delegateId,
        local_certification: true,
      },
    }).select("*").single(),
    "SECRETARY_COMMITMENT_CONTROL_PARENT_TASK_INSERT_FAILED",
  );

  const linkedJob = await one(
    supabaseAdmin.from("secretary_jobs").insert({
      organization_id: organizationId,
      requested_by_party_id: ownerId,
      source_kind: "MEETING",
      objective: "Complete the governed meeting commitment after executive review.",
      success_criteria: ["Commitment resolved with evidence."],
      status: "REVIEW_REQUIRED",
      autonomy_level: "EXECUTE_WITH_GATES",
      approval_policy: {},
      execution_plan: [],
      next_action_at: null,
      max_attempts: 20,
      metadata: {
        source_task_id: parentTask.id,
        canonical_owner_party_id: ownerId,
        operational_assignee_party_id: delegateId,
        local_certification: true,
      },
    }).select("*").single(),
    "SECRETARY_COMMITMENT_CONTROL_LINKED_JOB_INSERT_FAILED",
  );

  const linkedFollowUp = await one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      contact_party_id: contactId,
      task_id: parentTask.id,
      action_type: "REVIEW",
      reason: "Review the meeting commitment decision boundary.",
      status: "PENDING",
      due_at: "2035-04-10T10:00:00.000Z",
      created_by_party_id: ownerId,
      metadata: {
        execution_owner: "SECRETARY",
        execution_ready: true,
        secretary_job_id: linkedJob.id,
        canonical_owner_party_id: ownerId,
        operational_assignee_party_id: delegateId,
        local_certification: true,
      },
    }).select("*").single(),
    "SECRETARY_COMMITMENT_CONTROL_LINKED_FOLLOW_UP_INSERT_FAILED",
  );

  const standaloneJob = await one(
    supabaseAdmin.from("secretary_jobs").insert({
      organization_id: organizationId,
      requested_by_party_id: ownerId,
      source_kind: "MANUAL",
      objective: "Wait for an external factual response.",
      success_criteria: ["External response collected."],
      status: "WAITING",
      autonomy_level: "EXECUTE_WITH_GATES",
      approval_policy: {},
      execution_plan: [],
      next_action_at: "2035-04-11T12:00:00.000Z",
      max_attempts: 20,
      metadata: {
        job_kind: "CORRESPONDENCE_TRIAGE",
        awaiting_external_responses: true,
        canonical_owner_party_id: ownerId,
        operational_assignee_party_id: delegateId,
        local_certification: true,
      },
    }).select("*").single(),
    "SECRETARY_COMMITMENT_CONTROL_STANDALONE_JOB_INSERT_FAILED",
  );

  const explicitFollowUp = await one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      contact_party_id: contactId,
      action_type: "CALL",
      reason: "Secretary explicitly promised to call the contact tomorrow.",
      status: "PENDING",
      due_at: "2035-04-11T15:00:00.000Z",
      created_by_party_id: ownerId,
      metadata: {
        commitment_extraction_item_key: "local-cert-explicit-commitment-1",
        explicit_commitment: true,
        execution_owner: "SECRETARY",
        execution_ready: true,
        execution_instruction: "Call the contact tomorrow.",
        canonical_owner_party_id: ownerId,
        operational_assignee_party_id: delegateId,
        local_certification: true,
      },
    }).select("*").single(),
    "SECRETARY_COMMITMENT_CONTROL_EXPLICIT_FOLLOW_UP_INSERT_FAILED",
  );

  const terminalTask = await one(
    supabaseAdmin.from("secretary_tasks").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      title: "Completed commitment must stay closed",
      status: "DONE",
      priority: "NORMAL",
      due_at: "2035-04-01T12:00:00.000Z",
      completed_at: "2035-04-02T12:00:00.000Z",
      source: "secretary",
      created_by_party_id: ownerId,
      metadata: { local_certification: true },
    }).select("*").single(),
    "SECRETARY_COMMITMENT_CONTROL_TERMINAL_TASK_INSERT_FAILED",
  );

  const terminalJob = await one(
    supabaseAdmin.from("secretary_jobs").insert({
      organization_id: organizationId,
      requested_by_party_id: ownerId,
      source_kind: "MANUAL",
      objective: "Completed delegated job must stay closed.",
      success_criteria: [],
      status: "COMPLETED",
      autonomy_level: "EXECUTE_WITH_GATES",
      approval_policy: {},
      execution_plan: [],
      max_attempts: 20,
      completed_at: "2035-04-02T12:00:00.000Z",
      metadata: { local_certification: true },
    }).select("*").single(),
    "SECRETARY_COMMITMENT_CONTROL_TERMINAL_JOB_INSERT_FAILED",
  );

  const terminalFollowUp = await one(
    supabaseAdmin.from("secretary_follow_ups").insert({
      organization_id: organizationId,
      owner_party_id: ownerId,
      contact_party_id: contactId,
      action_type: "MESSAGE",
      reason: "Completed follow-up must stay closed.",
      status: "COMPLETED",
      due_at: "2035-04-02T12:00:00.000Z",
      completed_at: "2035-04-02T13:00:00.000Z",
      created_by_party_id: ownerId,
      metadata: { local_certification: true },
    }).select("*").single(),
    "SECRETARY_COMMITMENT_CONTROL_TERMINAL_FOLLOW_UP_INSERT_FAILED",
  );

  const result = await readSecretaryCommitmentControl({
    context: {
      organizationId,
      actor: { partyId: ownerId },
      metadata: { partyId: ownerId },
    },
    payload: { now: fixedNow, limit: 100 },
  });

  assert.equal(result.contract, "AVANTIQO_EXECUTIVE_SECRETARY_COMMITMENT_CONTROL_V1");
  assert.equal(result.summary.active_commitment_count, 3);
  assert.equal(result.summary.linked_jobs_absorbed, 1);
  assert.equal(result.summary.linked_follow_ups_absorbed, 1);
  assert.equal(result.summary.explicit_commitment_count, 1);

  const parent = result.commitments.find((item) => item.source_id === parentTask.id);
  assert.ok(parent);
  assert.equal(parent.category, "MEETING_ACTION");
  assert.equal(parent.linked_job_count, 1);
  assert.equal(parent.next_action_count, 1);
  assert.equal(parent.linked_jobs[0].id, linkedJob.id);
  assert.equal(parent.next_actions[0].id, linkedFollowUp.id);
  assert.equal(parent.temporal_status, "OVERDUE_TEMPORALLY");
  assert.equal(parent.control_state, "EXECUTIVE_DECISION_REQUIRED");
  assert.equal(parent.executive_attention_required, true);
  assert.equal(parent.canonical_owner_party_id, ownerId);
  assert.equal(parent.operational_assignee_party_id, delegateId);

  const waiting = result.commitments.find((item) => item.source_id === standaloneJob.id);
  assert.ok(waiting);
  assert.equal(waiting.source_type, "JOB");
  assert.equal(waiting.control_state, "WAITING_EXTERNAL");

  const explicit = result.commitments.find((item) => item.source_id === explicitFollowUp.id);
  assert.ok(explicit);
  assert.equal(explicit.source_type, "FOLLOW_UP");
  assert.equal(explicit.category, "EXPLICIT_COMMITMENT");
  assert.equal(explicit.explicit_commitment, true);
  assert.equal(explicit.control_state, "SCHEDULED_NEXT_ACTION");

  const ids = new Set(result.commitments.map((item) => item.source_id));
  assert.equal(ids.has(terminalTask.id), false);
  assert.equal(ids.has(terminalJob.id), false);
  assert.equal(ids.has(terminalFollowUp.id), false);
  assert.equal(ids.has(linkedJob.id), false);
  assert.equal(ids.has(linkedFollowUp.id), false);

  assert.equal(result.durable_records_only, true);
  assert.equal(result.explicit_commitments_preserved, true);
  assert.equal(result.commitment_inferred, false);
  assert.equal(result.urgency_inferred, false);
  assert.equal(result.legal_breach_inferred, false);
  assert.equal(result.legal_compliance_inferred, false);
  assert.equal(result.approval_extends_authority, false);
  assert.equal(result.platform_permissions_mutated, false);
  assert.equal(result.binding_authority_delegated, false);
  assert.equal(result.approval_authority_delegated, false);
  assert.equal(result.external_authority_used, false);

  console.log("SECRETARY_COMMITMENT_CONTROL_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_COMMITMENT_CONTROL_DURABLE_RECORDS_ONLY=true");
  console.log("SECRETARY_COMMITMENT_CONTROL_LINKED_JOB_DEDUP=true");
  console.log("SECRETARY_COMMITMENT_CONTROL_LINKED_FOLLOW_UP_DEDUP=true");
  console.log("SECRETARY_COMMITMENT_CONTROL_EXPLICIT_CAPTURE_COMPATIBLE=true");
  console.log("SECRETARY_COMMITMENT_CONTROL_EXECUTIVE_DECISION_BOUNDARY=true");
  console.log("SECRETARY_COMMITMENT_CONTROL_TEMPORAL_OVERDUE_ONLY=true");
  console.log("SECRETARY_COMMITMENT_CONTROL_TERMINAL_EXCLUDED=true");
  console.log("SECRETARY_COMMITMENT_CONTROL_COMMITMENT_INFERRED=false");
  console.log("SECRETARY_COMMITMENT_CONTROL_URGENCY_INFERRED=false");
  console.log("SECRETARY_COMMITMENT_CONTROL_LEGAL_BREACH_INFERRED=false");
  console.log("SECRETARY_COMMITMENT_CONTROL_PLATFORM_PERMISSIONS_MUTATED=false");
  console.log("SECRETARY_COMMITMENT_CONTROL_BINDING_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_COMMITMENT_CONTROL_APPROVAL_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) console.error(`SECRETARY_COMMITMENT_CONTROL_LOCAL_CLEANUP_WARNING=${cleanup.error.code || "UNKNOWN"}`);
  }
}
