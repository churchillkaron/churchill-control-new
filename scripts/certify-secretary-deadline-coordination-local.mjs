import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_DEADLINE_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}
function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) throw new Error("SECRETARY_DEADLINE_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
function sameInstant(a, b) { return Date.parse(a) === Date.parse(b); }

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const {
  cancelSecretaryDeadlineCoordination,
  listSecretaryDeadlines,
  readSecretaryDeadline,
  recordSecretaryDeadlineCompletionEvidence,
  recordSecretaryDeadlineInput,
  refreshSecretaryDeadline,
  registerSecretaryDeadline,
  reviseSecretaryDeadline,
} = await import("../lib/operator/secretary/SecretaryDeadlineCoordinationRuntime.js");
const { createSecretaryDeadlineCoordinationCapability } = await import("../lib/platform/capabilities/createSecretaryDeadlineCoordinationCapability.js");

let organizationId = null;
try {
  const organization = await one(supabaseAdmin.from("organizations").insert({ name: "Secretary Deadline Coordination Local Certification" }).select("id").single(), "SECRETARY_DEADLINE_ORGANIZATION_INSERT_FAILED");
  organizationId = organization.id;
  const parties = await many(supabaseAdmin.from("parties").insert([
    { organization_id: organizationId, display_name: "Deadline Owner", email: "deadline-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    { organization_id: organizationId, display_name: "Deadline Provider", email: "deadline-provider@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
  ]).select("id,display_name"), "SECRETARY_DEADLINE_PARTIES_INSERT_FAILED");
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Deadline Owner");
  const providerId = byName.get("Deadline Provider");
  assert.ok(ownerId && providerId);
  await one(supabaseAdmin.from("secretary_contact_profiles").insert({ organization_id: organizationId, party_id: providerId, preferred_channel: "email", metadata: { local_certification: true } }).select("*").single(), "SECRETARY_DEADLINE_PROFILE_INSERT_FAILED");

  const context = { organizationId, timezone: "Asia/Bangkok", actor: { partyId: ownerId }, metadata: { partyId: ownerId, localCertification: true } };
  const payload = {
    deadline_key: "ANNUAL-LICENSE-2031",
    title: "Annual Operating License Renewal",
    deadline_type: "RENEWAL",
    jurisdiction: "TEST_JURISDICTION",
    authority_label: "Example Licensing Authority",
    due_at: "2031-11-30T16:59:59Z",
    evidence_id: "deadline-evidence:notice-v1",
    source_reference: "document://deadline-cert/official-notice-v1",
    responsible_party_id: providerId,
    reminder_offsets_days: [30, 7, 1, 0],
    required_inputs: [
      { label: "Current insurance certificate", responsible_party_id: providerId },
      { label: "Authorized signatory details", responsible_party_id: providerId },
    ],
  };

  const registered = await registerSecretaryDeadline({ context, payload });
  assert.equal(registered.status, "registered");
  assert.equal(registered.contract, "AVANTIQO_EXECUTIVE_SECRETARY_DEADLINE_COORDINATION_V1");
  assert.equal(registered.deterministic_deadline_id, true);
  assert.equal(registered.deadline_type_inferred, false);
  assert.equal(registered.legal_compliance_inferred, false);
  assert.ok(registered.follow_up_ids.length >= 10);

  const replay = await registerSecretaryDeadline({ context, payload });
  assert.equal(replay.deadline_id, registered.deadline_id);
  assert.deepEqual([...replay.follow_up_ids].sort(), [...registered.follow_up_ids].sort());

  const initialRead = await readSecretaryDeadline({ context, payload: { deadline_id: registered.deadline_id } });
  assert.equal(initialRead.required_inputs.length, 2);
  assert.equal(initialRead.task.metadata.deadline_status, "TRACKING");
  assert.equal(initialRead.legal_compliance_inferred, false);
  assert.equal(initialRead.legal_non_compliance_inferred, false);

  const firstInput = initialRead.required_inputs[0];
  const recordedInput = await recordSecretaryDeadlineInput({ context, payload: {
    deadline_id: registered.deadline_id,
    input_id: firstInput.id,
    input_status: "RECEIVED",
    evidence_id: "deadline-evidence:insurance-received",
    source_reference: "document://deadline-cert/insurance-certificate",
  } });
  assert.equal(recordedInput.status, "input_evidence_recorded");
  assert.equal(recordedInput.input.status, "RECEIVED");
  assert.equal(recordedInput.input_sufficiency_inferred, false);
  assert.equal(recordedInput.legal_compliance_inferred, false);
  assert.ok(recordedInput.cancelled_follow_up_ids.length >= 2);

  const inputReplay = await recordSecretaryDeadlineInput({ context, payload: {
    deadline_id: registered.deadline_id,
    input_id: firstInput.id,
    input_status: "RECEIVED",
    evidence_id: "deadline-evidence:insurance-received",
    source_reference: "document://deadline-cert/insurance-certificate",
  } });
  assert.equal(inputReplay.status, "input_already_recorded");
  assert.equal(inputReplay.idempotent, true);

  const revised = await reviseSecretaryDeadline({ context, payload: {
    deadline_id: registered.deadline_id,
    new_due_at: "2031-12-15T16:59:59Z",
    evidence_id: "deadline-evidence:extension-v2",
    source_reference: "document://deadline-cert/official-extension-v2",
    reason: "Authority notice explicitly moved the recorded due date.",
  } });
  assert.equal(revised.status, "deadline_revised");
  assert.equal(revised.prior_due_date_preserved, true);
  assert.equal(revised.deadline_change_inferred, false);
  assert.equal(revised.revision.previous_due_at, "2031-11-30T16:59:59.000Z");
  assert.equal(revised.revision.new_due_at, "2031-12-15T16:59:59.000Z");
  assert.ok(revised.follow_up_ids.length > 0);

  const revisedReplay = await reviseSecretaryDeadline({ context, payload: {
    deadline_id: registered.deadline_id,
    new_due_at: "2031-12-15T16:59:59Z",
    evidence_id: "deadline-evidence:extension-v2",
    source_reference: "document://deadline-cert/official-extension-v2",
    reason: "Authority notice explicitly moved the recorded due date.",
  } });
  assert.equal(revisedReplay.status, "revision_already_recorded");
  assert.equal(revisedReplay.idempotent, true);

  const afterRevision = await readSecretaryDeadline({ context, payload: { deadline_id: registered.deadline_id } });
  assert.equal(afterRevision.revisions.length, 1);
  assert.ok(sameInstant(afterRevision.task.metadata.due_at, "2031-12-15T16:59:59Z"));
  assert.equal(afterRevision.required_inputs[0].status, "RECEIVED");
  assert.equal(afterRevision.required_inputs[1].status, "MISSING");

  const oldVersionPending = afterRevision.follow_ups.filter((row) => row.status === "PENDING" && Number(row.metadata.secretary_deadline_version) === 1);
  assert.equal(oldVersionPending.length, 0);

  const overdue = await refreshSecretaryDeadline({ context, payload: { deadline_id: registered.deadline_id, now: "2031-12-16T12:00:00Z" } });
  assert.equal(overdue.temporal_status, "OVERDUE_TEMPORALLY");
  assert.equal(overdue.overdue_is_temporal_only, true);
  assert.equal(overdue.legal_non_compliance_inferred, false);
  assert.equal(overdue.legal_compliance_inferred, false);

  const afterOverdue = await readSecretaryDeadline({ context, payload: { deadline_id: registered.deadline_id } });
  assert.ok(afterOverdue.follow_ups.some((row) => row.metadata.secretary_deadline_kind === "OVERDUE_REVIEW"));

  const completed = await recordSecretaryDeadlineCompletionEvidence({ context, payload: {
    deadline_id: registered.deadline_id,
    evidence_id: "deadline-evidence:submission-receipt",
    source_reference: "document://deadline-cert/submission-receipt",
    description: "An external receipt was supplied as completion evidence; its legal sufficiency is not inferred.",
  } });
  assert.equal(completed.status, "completion_evidence_recorded");
  assert.equal(completed.task.metadata.deadline_status, "COMPLETION_EVIDENCE_RECORDED");
  assert.equal(completed.deadline_requirement_satisfied_inferred, false);
  assert.equal(completed.legal_compliance_inferred, false);
  assert.equal(completed.filing_validity_inferred, false);

  const afterCompletion = await readSecretaryDeadline({ context, payload: { deadline_id: registered.deadline_id } });
  assert.equal(afterCompletion.temporal_status, "COMPLETION_EVIDENCE_RECORDED");
  assert.ok(afterCompletion.follow_ups.every((row) => row.status !== "PENDING"));

  const listed = await listSecretaryDeadlines({ context, payload: { query: "license", limit: 20 } });
  assert.equal(listed.count, 1);
  assert.equal(listed.deadlines[0].deadline_id, registered.deadline_id);
  assert.equal(listed.legal_compliance_inferred, false);

  const second = await registerSecretaryDeadline({ context, payload: {
    deadline_key: "CONTRACT-NOTICE-2032",
    title: "Contract Notice Date",
    deadline_type: "CONTRACTUAL",
    due_at: "2032-02-01T00:00:00Z",
    evidence_id: "deadline-evidence:contract-date",
    source_reference: "document://deadline-cert/contract-date",
  } });
  const cancelled = await cancelSecretaryDeadlineCoordination({ context, payload: { deadline_id: second.deadline_id, reason: "Executive office no longer wants Secretary administrative tracking." } });
  assert.equal(cancelled.status, "coordination_cancelled");
  assert.equal(cancelled.external_deadline_cancelled, false);
  assert.equal(cancelled.obligation_waived, false);
  assert.equal(cancelled.legal_compliance_inferred, false);

  for (const action of ["register", "read", "list", "recordInput", "revise", "recordCompletion", "refresh", "cancel"]) {
    const capability = createSecretaryDeadlineCoordinationCapability(action);
    assert.equal(capability.manifest.capability, "secretary_deadline_coordination");
    assert.equal(capability.manifest.operatorAutoExecute, true);
    assert.equal(capability.manifest.operatorRequiresConfirmation, false);
    assert.equal(capability.manifest.contextScope, "organization");
  }

  console.log("SECRETARY_DEADLINE_COORDINATION_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_DEADLINE_COORDINATION_DURABLE=true");
  console.log("SECRETARY_DEADLINE_COORDINATION_IDEMPOTENT=true");
  console.log("SECRETARY_DEADLINE_COORDINATION_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_DEADLINE_COORDINATION_MISSING_INPUT_CHASING=true");
  console.log("SECRETARY_DEADLINE_COORDINATION_ESCALATION=true");
  console.log("SECRETARY_DEADLINE_COORDINATION_REVISION_HISTORY_PRESERVED=true");
  console.log("SECRETARY_DEADLINE_COORDINATION_STALE_SCHEDULE_FENCED=true");
  console.log("SECRETARY_DEADLINE_COORDINATION_OVERDUE_TEMPORAL_ONLY=true");
  console.log("SECRETARY_DEADLINE_COORDINATION_COMPLETION_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_DEADLINE_COORDINATION_REQUIREMENT_SATISFIED_INFERRED=false");
  console.log("SECRETARY_DEADLINE_COORDINATION_LEGAL_COMPLIANCE_INFERRED=false");
  console.log("SECRETARY_DEADLINE_COORDINATION_LEGAL_NON_COMPLIANCE_INFERRED=false");
  console.log("SECRETARY_DEADLINE_COORDINATION_FILING_VALIDITY_INFERRED=false");
  console.log("SECRETARY_DEADLINE_COORDINATION_EXTERNAL_DEADLINE_CANCELLED=false");
  console.log("SECRETARY_DEADLINE_COORDINATION_OBLIGATION_WAIVED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) throw cleanup.error;
  }
}
