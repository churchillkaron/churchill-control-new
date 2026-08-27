import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_MEETING_MINUTES_REVISION_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_MEETING_MINUTES_REVISION_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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

async function rejectsMarker(fn, marker) {
  let thrown = null;
  try {
    await fn();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, `Expected rejection containing ${marker}`);
  assert.match(String(thrown.message || thrown), new RegExp(marker));
}

const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
required("SUPABASE_SERVICE_ROLE_KEY");
assertLocalSupabase(supabaseUrl);

const { supabaseAdmin } = await import("../lib/shared/supabase/admin.js");
const {
  startSecretaryMeetingCloseout,
  recordSecretaryMeetingCloseoutResponse,
} = await import("../lib/operator/secretary/SecretaryMeetingCloseoutRuntime.js");
const { reviseSecretaryMeetingMinutesGoverned } = await import("../lib/operator/secretary/SecretaryMeetingMinutesRevisionGovernedRuntime.js");
const { secretaryExactFollowUpMessageBody } = await import("../lib/operator/secretary/SecretaryFollowUpExecutionRuntime.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations")
      .insert({ name: "Secretary Meeting Minutes Revision Local Certification" })
      .select("id")
      .single(),
    "SECRETARY_MEETING_MINUTES_REVISION_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Minutes Revision Executive", email: "minutes-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Minutes Revision Recipient A", email: "minutes-a@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Minutes Revision Recipient B", email: "minutes-b@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_MEETING_MINUTES_REVISION_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Minutes Revision Executive");
  const recipientA = byName.get("Minutes Revision Recipient A");
  const recipientB = byName.get("Minutes Revision Recipient B");
  assert.ok(ownerId && recipientA && recipientB);

  await one(
    supabaseAdmin.from("secretary_settings").insert({
      organization_id: organizationId,
      default_timezone: "UTC",
      booking_policy: { owner_party_id: ownerId },
      metadata: { owner_party_id: ownerId, local_certification: true },
    }).select("organization_id").single(),
    "SECRETARY_MEETING_MINUTES_REVISION_SETTINGS_INSERT_FAILED",
  );

  await many(
    supabaseAdmin.from("secretary_contact_profiles").insert([
      { organization_id: organizationId, party_id: recipientA, preferred_channel: "email", allow_messages: true, metadata: { local_certification: true } },
      { organization_id: organizationId, party_id: recipientB, preferred_channel: "message", allow_messages: true, metadata: { local_certification: true } },
    ]).select("party_id"),
    "SECRETARY_MEETING_MINUTES_REVISION_PROFILES_INSERT_FAILED",
  );

  const originalProtocol = "Original minutes: Recipient B was recorded as Operations Lead. The team will prepare the factual variance table. No purchase, payment, signature, acceptance, or legal commitment was authorized.";
  const revisedProtocol = "Revised minutes: Recipient B was the Operations Observer, not Operations Lead. The team will prepare the factual variance table. No purchase, payment, signature, acceptance, or legal commitment was authorized.";

  const meeting = await one(
    supabaseAdmin.from("secretary_meetings").insert({
      organization_id: organizationId,
      title: "Minutes Revision Certification Meeting",
      status: "COMPLETED",
      started_at: "2035-05-01T09:00:00.000Z",
      ended_at: "2035-05-01T10:00:00.000Z",
      timezone: "UTC",
      capture_authorized: true,
      executive_summary: "Reviewed a factual variance table and participant roles.",
      protocol: originalProtocol,
      decisions: ["Use the existing reporting format."],
      unresolved_questions: [],
      processed_at: "2035-05-01T10:05:00.000Z",
      metadata: { created_by_party_id: ownerId, evidence_id: "meeting-capture-evidence-v1", local_certification: true },
    }).select("*").single(),
    "SECRETARY_MEETING_MINUTES_REVISION_MEETING_INSERT_FAILED",
  );

  await many(
    supabaseAdmin.from("secretary_meeting_participants").insert([
      { organization_id: organizationId, meeting_id: meeting.id, party_id: recipientA, display_name: "Minutes Revision Recipient A", participant_role: "Finance", metadata: { local_certification: true } },
      { organization_id: organizationId, meeting_id: meeting.id, party_id: recipientB, display_name: "Minutes Revision Recipient B", participant_role: "Operations", metadata: { local_certification: true } },
    ]).select("party_id"),
    "SECRETARY_MEETING_MINUTES_REVISION_PARTICIPANTS_INSERT_FAILED",
  );

  const context = {
    organizationId,
    actor: { partyId: ownerId },
    metadata: { partyId: ownerId },
  };

  const started = await startSecretaryMeetingCloseout({
    context,
    payload: {
      meeting_id: meeting.id,
      acknowledgement_required: true,
      acknowledgement_due_at: "2035-05-02T12:00:00.000Z",
    },
  });
  assert.equal(started.recipients.length, 2);
  assert.equal(started.distribution_follow_up_ids.length, 2);

  const originalDistributions = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("task_id", started.task.id)
      .contains("metadata", { secretary_meeting_closeout_kind: "MINUTES_DISTRIBUTION" }),
    "SECRETARY_MEETING_MINUTES_REVISION_ORIGINAL_DISTRIBUTIONS_READ_FAILED",
  );
  assert.equal(originalDistributions.length, 2);
  const completedAt = "2035-05-01T10:15:00.000Z";
  const complete = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "COMPLETED", result: "Original minutes sent in local certification", completed_at: completedAt, updated_at: completedAt })
    .eq("organization_id", organizationId)
    .in("id", originalDistributions.map((row) => row.id));
  if (complete.error) throw complete.error;

  await recordSecretaryMeetingCloseoutResponse({
    context,
    payload: {
      meeting_id: meeting.id,
      recipient_party_id: recipientA,
      evidence_id: "minutes-ack-a-v1",
      response_kind: "ACKNOWLEDGED",
    },
  });

  const correctionEvidenceId = "minutes-correction-b-v1";
  const correctionText = "The role label is factually incorrect: Recipient B was Operations Observer, not Operations Lead.";
  const correction = await recordSecretaryMeetingCloseoutResponse({
    context,
    payload: {
      meeting_id: meeting.id,
      recipient_party_id: recipientB,
      evidence_id: correctionEvidenceId,
      response_kind: "CORRECTION_REQUESTED",
      correction_text: correctionText,
    },
  });
  assert.equal(correction.status, "correction_recorded");
  assert.ok(correction.correction_review_follow_up_id);

  await rejectsMarker(
    () => reviseSecretaryMeetingMinutesGoverned({
      context,
      payload: {
        meeting_id: meeting.id,
        supersedes_version: 1,
        evidence_id: "forged-unrecorded-correction-evidence",
        correction_reason: "Forged evidence must fail closed",
        revised_minutes_body: revisedProtocol,
        acknowledgement_due_at: "2035-05-03T12:00:00.000Z",
      },
    }),
    "SECRETARY_MEETING_MINUTES_REVISION_CORRECTION_EVIDENCE_NOT_RECORDED",
  );

  const revised = await reviseSecretaryMeetingMinutesGoverned({
    context,
    payload: {
      meeting_id: meeting.id,
      supersedes_version: 1,
      evidence_id: correctionEvidenceId,
      correction_reason: "Apply the recorded factual role-label correction only.",
      revised_minutes_body: revisedProtocol,
      acknowledgement_due_at: "2035-05-03T12:00:00.000Z",
    },
  });
  assert.equal(revised.status, "revised");
  assert.equal(revised.current_minutes_version, 2);
  assert.equal(revised.supersedes_version, 1);
  assert.equal(revised.correction_evidence_verified, true);
  assert.equal(revised.correction_request_party_id, recipientB);
  assert.equal(revised.history_preserved, true);
  assert.equal(revised.stale_revision_fenced, true);
  assert.equal(revised.stale_distribution_fenced, true);
  assert.equal(revised.original_meeting_protocol_mutated, false);
  assert.equal(revised.attendance_inferred, false);
  assert.equal(revised.acknowledgement_not_approval, true);
  assert.equal(revised.binding_authority_delegated, false);
  assert.equal(revised.approval_authority_delegated, false);
  assert.equal(revised.platform_permissions_mutated, false);
  assert.equal(revised.external_authority_used, false);

  const taskAfterRevision = await one(
    supabaseAdmin.from("secretary_tasks")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", started.task.id)
      .single(),
    "SECRETARY_MEETING_MINUTES_REVISION_TASK_RELOAD_FAILED",
  );
  assert.equal(taskAfterRevision.metadata.current_minutes_version, 2);
  assert.equal(taskAfterRevision.metadata.current_minutes_body, revisedProtocol);
  assert.equal(taskAfterRevision.metadata.closeout_state, "REVISION_DISTRIBUTION_QUEUED");
  assert.equal(taskAfterRevision.metadata.minutes_revision_history.length, 2);
  assert.equal(taskAfterRevision.metadata.minutes_revision_history[0].version, 1);
  assert.equal(taskAfterRevision.metadata.minutes_revision_history[0].event, "ORIGINAL_RECORDED_MINUTES");
  assert.equal(taskAfterRevision.metadata.minutes_revision_history[1].version, 2);
  assert.equal(taskAfterRevision.metadata.minutes_revision_history[1].event, "EVIDENCE_BACKED_FACTUAL_REVISION");
  assert.equal(taskAfterRevision.metadata.minutes_revision_history[1].evidence_id, correctionEvidenceId);
  assert.ok(taskAfterRevision.metadata.recipients.every((row) => row.acknowledgement_status === "PENDING"));
  assert.ok(taskAfterRevision.metadata.recipients.every((row) => row.acknowledgement_evidence_id === null));

  const meetingAfterRevision = await one(
    supabaseAdmin.from("secretary_meetings")
      .select("protocol")
      .eq("organization_id", organizationId)
      .eq("id", meeting.id)
      .single(),
    "SECRETARY_MEETING_MINUTES_REVISION_MEETING_RELOAD_FAILED",
  );
  assert.equal(meetingAfterRevision.protocol, originalProtocol);

  const correctionReview = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id,status")
      .eq("organization_id", organizationId)
      .eq("id", correction.correction_review_follow_up_id)
      .single(),
    "SECRETARY_MEETING_MINUTES_REVISION_CORRECTION_REVIEW_RELOAD_FAILED",
  );
  assert.equal(correctionReview.status, "CANCELLED");

  const revisionDistributions = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("task_id", started.task.id)
      .contains("metadata", { secretary_meeting_closeout_kind: "MINUTES_REVISION_DISTRIBUTION" })
      .order("contact_party_id", { ascending: true }),
    "SECRETARY_MEETING_MINUTES_REVISION_DISTRIBUTIONS_READ_FAILED",
  );
  assert.equal(revisionDistributions.length, 2);
  assert.deepEqual(
    [...revisionDistributions.map((row) => row.id)].sort(),
    [...revised.distribution_follow_up_ids].sort(),
  );
  for (const row of revisionDistributions) {
    assert.equal(row.metadata.secretary_meeting_closeout_version, 2);
    assert.equal(row.metadata.secretary_meeting_closeout_kind, "MINUTES_REVISION_DISTRIBUTION");
    assert.equal(row.metadata.secretary_exact_message_body_source, "MEETING_CLOSEOUT_V1");
    assert.equal(row.metadata.attendance_inferred, false);
    assert.equal(row.metadata.acknowledgement_not_approval, true);
    assert.match(row.metadata.secretary_exact_message_body, /Operations Observer, not Operations Lead/);
    const exact = secretaryExactFollowUpMessageBody(row, { action_type: row.action_type });
    assert.ok(exact);
    assert.match(exact, /Revised meeting closeout v2/);
  }

  const replay = await reviseSecretaryMeetingMinutesGoverned({
    context,
    payload: {
      meeting_id: meeting.id,
      supersedes_version: 1,
      evidence_id: correctionEvidenceId,
      correction_reason: "Apply the recorded factual role-label correction only.",
      revised_minutes_body: revisedProtocol,
      acknowledgement_due_at: "2035-05-03T12:00:00.000Z",
    },
  });
  assert.equal(replay.replay_safe, true);
  assert.deepEqual(
    [...replay.distribution_follow_up_ids].sort(),
    [...revised.distribution_follow_up_ids].sort(),
  );

  await rejectsMarker(
    () => reviseSecretaryMeetingMinutesGoverned({
      context,
      payload: {
        meeting_id: meeting.id,
        supersedes_version: 1,
        evidence_id: correctionEvidenceId,
        correction_reason: "Conflicting stale rewrite must fail",
        revised_minutes_body: `${revisedProtocol} Conflicting stale addition.`,
        acknowledgement_due_at: "2035-05-03T12:00:00.000Z",
      },
    }),
    "SECRETARY_MEETING_MINUTES_REVISION_STALE_REVISION_REJECTED",
  );

  console.log("SECRETARY_MEETING_MINUTES_REVISION_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_CORRECTION_EVIDENCE_VERIFIED=true");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_HISTORY_PRESERVED=true");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_REPLAY_SAFE=true");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_STALE_REVISION_FENCED=true");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_STALE_DISTRIBUTION_FENCED=true");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_ACKNOWLEDGEMENTS_RESET=true");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_REDISTRIBUTION_DETERMINISTIC=true");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_ORIGINAL_CAPTURE_MUTATED=false");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_ATTENDANCE_INFERRED=false");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_ACKNOWLEDGEMENT_NOT_APPROVAL=true");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_PLATFORM_PERMISSIONS_MUTATED=false");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_BINDING_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_MEETING_MINUTES_REVISION_APPROVAL_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
  }
}
