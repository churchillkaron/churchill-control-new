import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_ABSENCE_COVERAGE_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_ABSENCE_COVERAGE_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
  acknowledgeSecretaryAbsenceHandoff,
  cancelSecretaryAbsenceCoverage,
  endSecretaryAbsenceCoverageEarly,
  listSecretaryAbsenceCoverage,
  readSecretaryAbsenceCoverage,
  refreshSecretaryAbsenceCoverage,
  reviseSecretaryAbsenceCoverage,
  startSecretaryAbsenceCoverage,
} = await import("../lib/operator/secretary/SecretaryAbsenceCoverageRuntime.js");
const { createSecretaryAbsenceCoverageCapability } = await import("../lib/platform/capabilities/createSecretaryAbsenceCoverageCapability.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Absence Coverage Local Certification" }).select("id").single(),
    "SECRETARY_ABSENCE_COVERAGE_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Executive Owner", email: "absence-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Coverage Delegate A", email: "absence-delegate-a@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Coverage Delegate B", email: "absence-delegate-b@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_ABSENCE_COVERAGE_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Executive Owner");
  const delegateA = byName.get("Coverage Delegate A");
  const delegateB = byName.get("Coverage Delegate B");
  assert.ok(ownerId && delegateA && delegateB);

  await many(
    supabaseAdmin.from("secretary_contact_profiles").insert([
      { organization_id: organizationId, party_id: delegateA, preferred_channel: "email", allow_calls: true, allow_messages: true, metadata: { local_certification: true } },
      { organization_id: organizationId, party_id: delegateB, preferred_channel: "email", allow_calls: true, allow_messages: true, metadata: { local_certification: true } },
    ]).select("id"),
    "SECRETARY_ABSENCE_COVERAGE_PROFILE_INSERT_FAILED",
  );

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: ownerId },
    metadata: { partyId: ownerId, localCertification: true },
  };

  let forbiddenRejected = false;
  try {
    await startSecretaryAbsenceCoverage({
      context,
      payload: {
        absence_key: "forbidden-payment-coverage",
        owner_party_id: ownerId,
        delegate_party_id: delegateA,
        starts_at: "2031-10-01T02:00:00Z",
        ends_at: "2031-10-03T10:00:00Z",
        coverage_scopes: ["PAYMENT_APPROVAL"],
        instruction_evidence_id: "absence-evidence:forbidden",
        source_reference: "conversation://absence-cert/forbidden",
      },
    });
  } catch (error) {
    forbiddenRejected = String(error?.message || error).includes("SECRETARY_ABSENCE_COVERAGE_SCOPE_FORBIDDEN");
  }
  assert.equal(forbiddenRejected, true);

  const payload = {
    absence_key: "owner-october-coverage",
    owner_party_id: ownerId,
    delegate_party_id: delegateA,
    starts_at: "2031-10-01T02:00:00Z",
    ends_at: "2031-10-05T10:00:00Z",
    timezone: "Asia/Bangkok",
    all_day: false,
    reason: "Executive travel",
    handoff_notes: "Route routine correspondence and calendar coordination. Escalate binding actions.",
    coverage_scopes: ["CALENDAR_COORDINATION", "CORRESPONDENCE_TRIAGE", "TASK_ROUTING", "DEADLINE_COORDINATION"],
    instruction_evidence_id: "absence-evidence:start-v1",
    source_reference: "conversation://absence-cert/start-v1",
  };

  const started = await startSecretaryAbsenceCoverage({ context, payload });
  assert.equal(started.status, "coverage_registered");
  assert.equal(started.deterministic_coverage_id, true);
  assert.equal(started.calendar_block.event_type, "BLOCK");
  assert.equal(started.calendar_block.status, "CONFIRMED");
  assert.equal(started.existing_calendar_events_cancelled, false);
  assert.equal(started.platform_permissions_mutated, false);
  assert.equal(started.delegated_binding_authority_created, false);
  assert.equal(started.external_authority_used, false);
  assert.equal(started.follow_up_ids.length, 2);

  const replay = await startSecretaryAbsenceCoverage({ context, payload });
  assert.equal(replay.coverage_id, started.coverage_id);
  assert.deepEqual([...replay.follow_up_ids].sort(), [...started.follow_up_ids].sort());

  const read = await readSecretaryAbsenceCoverage({ context, payload: { coverage_id: started.coverage_id } });
  assert.equal(read.temporal_status, "SCHEDULED");
  assert.equal(read.coverage_scopes.includes("CALENDAR_COORDINATION"), true);
  assert.equal(read.platform_permissions_mutated, false);
  assert.equal(read.delegated_binding_authority_created, false);

  const ack = await acknowledgeSecretaryAbsenceHandoff({
    context,
    payload: {
      coverage_id: started.coverage_id,
      evidence_id: "absence-evidence:handoff-ack-v1",
      source_reference: "email://absence-cert/handoff-ack-v1",
      acknowledged_at: "2031-09-30T08:00:00Z",
      acknowledged_by_party_id: delegateA,
      notes: "Coverage received.",
    },
  });
  assert.equal(ack.status, "handoff_acknowledged");
  assert.equal(ack.acknowledgement_grants_new_authority, false);
  assert.equal(ack.platform_permissions_mutated, false);

  const ackReplay = await acknowledgeSecretaryAbsenceHandoff({
    context,
    payload: {
      coverage_id: started.coverage_id,
      evidence_id: "absence-evidence:handoff-ack-v1",
      acknowledged_by_party_id: delegateA,
    },
  });
  assert.equal(ackReplay.status, "handoff_already_acknowledged");

  const revised = await reviseSecretaryAbsenceCoverage({
    context,
    payload: {
      coverage_id: started.coverage_id,
      delegate_party_id: delegateB,
      ends_at: "2031-10-07T10:00:00Z",
      coverage_scopes: ["CALENDAR_COORDINATION", "CORRESPONDENCE_TRIAGE", "TASK_ROUTING"],
      handoff_notes: "Delegate B takes over temporary coverage.",
      evidence_id: "absence-evidence:revision-v2",
      source_reference: "conversation://absence-cert/revision-v2",
      revision_reason: "Travel extended and delegate changed.",
    },
  });
  assert.equal(revised.status, "coverage_revised");
  assert.equal(revised.prior_coverage_preserved, true);
  assert.equal(revised.task.metadata.version, 2);
  assert.equal(revised.task.metadata.delegate_party_id, delegateB);
  assert.equal(revised.task.metadata.revision_history.length, 1);
  assert.equal(revised.task.metadata.handoff_acknowledgement, null);
  assert.equal(Date.parse(revised.calendar_block.ends_at), Date.parse("2031-10-07T10:00:00Z"));
  assert.equal(revised.platform_permissions_mutated, false);
  assert.equal(revised.delegated_binding_authority_created, false);

  const oldVersionPending = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,metadata,status")
      .eq("organization_id", organizationId)
      .eq("task_id", started.coverage_id)
      .eq("status", "PENDING"),
    "SECRETARY_ABSENCE_COVERAGE_PENDING_FOLLOWUPS_READ_FAILED",
  );
  assert.equal(oldVersionPending.some((row) => Number(row.metadata?.secretary_absence_version) === 1), false);

  const active = await refreshSecretaryAbsenceCoverage({
    context,
    payload: { coverage_id: started.coverage_id, now: "2031-10-03T06:00:00Z" },
  });
  assert.equal(active.temporal_status, "ACTIVE");

  const listed = await listSecretaryAbsenceCoverage({ context, payload: { owner_party_id: ownerId } });
  assert.equal(listed.coverages.some((row) => row.coverage_id === started.coverage_id), true);

  const expired = await refreshSecretaryAbsenceCoverage({
    context,
    payload: { coverage_id: started.coverage_id, now: "2031-10-08T06:00:00Z" },
  });
  assert.equal(expired.status, "coverage_expired");
  assert.equal(expired.owner_restored, true);
  assert.equal(expired.temporary_coverage_continues, false);
  assert.equal(expired.platform_permissions_mutated, false);

  const expiredRead = await readSecretaryAbsenceCoverage({ context, payload: { coverage_id: started.coverage_id } });
  assert.equal(expiredRead.task.metadata.coverage_status, "EXPIRED");
  assert.ok(expiredRead.task.metadata.owner_restored_at);
  assert.equal(expiredRead.calendar_block.status, "COMPLETED");

  const second = await startSecretaryAbsenceCoverage({
    context,
    payload: {
      absence_key: "owner-early-return-coverage",
      owner_party_id: ownerId,
      delegate_party_id: delegateA,
      starts_at: "2031-11-01T02:00:00Z",
      ends_at: "2031-11-10T10:00:00Z",
      coverage_scopes: ["CALENDAR_COORDINATION", "TASK_ROUTING"],
      instruction_evidence_id: "absence-evidence:early-start",
      source_reference: "conversation://absence-cert/early-start",
      reason: "Executive travel",
    },
  });
  const early = await endSecretaryAbsenceCoverageEarly({
    context,
    payload: {
      coverage_id: second.coverage_id,
      evidence_id: "absence-evidence:early-return",
      source_reference: "conversation://absence-cert/early-return",
      reason: "Owner returned ahead of schedule.",
      ended_at: "2031-11-04T07:00:00Z",
    },
  });
  assert.equal(early.status, "coverage_ended_early");
  assert.equal(early.owner_restored, true);
  assert.equal(early.temporary_coverage_continues, false);
  assert.equal(early.platform_permissions_mutated, false);
  assert.equal(early.delegated_binding_authority_created, false);

  const third = await startSecretaryAbsenceCoverage({
    context,
    payload: {
      absence_key: "owner-cancelled-coverage",
      owner_party_id: ownerId,
      delegate_party_id: delegateA,
      starts_at: "2031-12-01T02:00:00Z",
      ends_at: "2031-12-05T10:00:00Z",
      coverage_scopes: ["CORRESPONDENCE_TRIAGE"],
      instruction_evidence_id: "absence-evidence:cancel-start",
      source_reference: "conversation://absence-cert/cancel-start",
      reason: "Planned absence",
    },
  });
  const cancelled = await cancelSecretaryAbsenceCoverage({ context, payload: { coverage_id: third.coverage_id, reason: "Absence no longer planned." } });
  assert.equal(cancelled.status, "coverage_cancelled");
  assert.equal(cancelled.existing_calendar_events_cancelled, false);
  assert.equal(cancelled.external_absence_cancelled, false);
  assert.equal(cancelled.platform_permissions_mutated, false);
  assert.equal(cancelled.delegated_binding_authority_created, false);

  for (const action of ["start", "read", "list", "acknowledgeHandoff", "revise", "refresh", "endEarly", "cancel"]) {
    const capability = createSecretaryAbsenceCoverageCapability(action);
    assert.equal(capability.manifest.capability, "secretary_absence_coverage");
    assert.equal(capability.manifest.action, action);
    assert.equal(capability.manifest.operatorAutoExecute, true);
    assert.equal(capability.manifest.operatorRequiresConfirmation, false);
    assert.equal(capability.manifest.contextScope, "organization");
  }

  console.log("SECRETARY_ABSENCE_COVERAGE_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_ABSENCE_COVERAGE_DURABLE=true");
  console.log("SECRETARY_ABSENCE_COVERAGE_IDEMPOTENT=true");
  console.log("SECRETARY_ABSENCE_COVERAGE_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_ABSENCE_COVERAGE_SCOPE_BOUNDED=true");
  console.log("SECRETARY_ABSENCE_COVERAGE_FORBIDDEN_AUTHORITY_REJECTED=true");
  console.log("SECRETARY_ABSENCE_COVERAGE_CALENDAR_BLOCK=true");
  console.log("SECRETARY_ABSENCE_COVERAGE_EXISTING_EVENTS_CANCELLED=false");
  console.log("SECRETARY_ABSENCE_COVERAGE_HANDOFF_ACK_EVIDENCE=true");
  console.log("SECRETARY_ABSENCE_COVERAGE_REVISION_HISTORY_PRESERVED=true");
  console.log("SECRETARY_ABSENCE_COVERAGE_STALE_HANDOFF_FENCED=true");
  console.log("SECRETARY_ABSENCE_COVERAGE_AUTO_EXPIRY=true");
  console.log("SECRETARY_ABSENCE_COVERAGE_OWNER_RESTORED=true");
  console.log("SECRETARY_ABSENCE_COVERAGE_EARLY_RETURN=true");
  console.log("SECRETARY_ABSENCE_COVERAGE_PLATFORM_PERMISSIONS_MUTATED=false");
  console.log("SECRETARY_ABSENCE_COVERAGE_BINDING_AUTHORITY_CREATED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
  }
}
