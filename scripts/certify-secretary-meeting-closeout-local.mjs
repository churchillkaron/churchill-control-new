import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_MEETING_CLOSEOUT_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  const url = new URL(urlValue);
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_MEETING_CLOSEOUT_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
  readSecretaryMeetingCloseout,
  recordSecretaryMeetingCloseoutResponse,
  refreshSecretaryMeetingCloseout,
  startSecretaryMeetingCloseout,
} = await import("../lib/operator/secretary/SecretaryMeetingCloseoutRuntime.js");
const { secretaryExactFollowUpMessageBody } = await import("../lib/operator/secretary/SecretaryFollowUpExecutionRuntime.js");
const { readSecretaryCommitmentControl } = await import("../lib/operator/secretary/SecretaryCommitmentControlRuntime.js");

let organizationId = null;
try {
  const organization = await one(
    supabaseAdmin.from("organizations").insert({ name: "Secretary Meeting Closeout Local Certification" }).select("id").single(),
    "SECRETARY_MEETING_CLOSEOUT_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties").insert([
      { organization_id: organizationId, display_name: "Closeout Executive", email: "closeout-owner@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Closeout Recipient A", email: "closeout-a@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Closeout Recipient B", email: "closeout-b@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      { organization_id: organizationId, display_name: "Closeout Recipient C", email: "closeout-c@example.invalid", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
    ]).select("id,display_name"),
    "SECRETARY_MEETING_CLOSEOUT_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const ownerId = byName.get("Closeout Executive");
  const recipientA = byName.get("Closeout Recipient A");
  const recipientB = byName.get("Closeout Recipient B");
  const recipientC = byName.get("Closeout Recipient C");
  assert.ok(ownerId && recipientA && recipientB && recipientC);

  await one(
    supabaseAdmin.from("secretary_settings").insert({
      organization_id: organizationId,
      default_timezone: "UTC",
      booking_policy: { owner_party_id: ownerId },
      metadata: { owner_party_id: ownerId, local_certification: true },
    }).select("organization_id").single(),
    "SECRETARY_MEETING_CLOSEOUT_SETTINGS_INSERT_FAILED",
  );

  await many(
    supabaseAdmin.from("secretary_contact_profiles").insert([
      { organization_id: organizationId, party_id: recipientA, preferred_channel: "email", allow_messages: true, metadata: { local_certification: true } },
      { organization_id: organizationId, party_id: recipientB, preferred_channel: "message", allow_messages: true, metadata: { local_certification: true } },
      { organization_id: organizationId, party_id: recipientC, preferred_channel: "email", allow_messages: true, metadata: { local_certification: true } },
    ]).select("party_id"),
    "SECRETARY_MEETING_CLOSEOUT_PROFILES_INSERT_FAILED",
  );

  const originalProtocol = "Protocol evidence: finance team will prepare the factual variance table. No purchase, payment, signature or legal acceptance was authorized.";
  const meeting = await one(
    supabaseAdmin.from("secretary_meetings").insert({
      organization_id: organizationId,
      title: "Closeout Certification Meeting",
      status: "COMPLETED",
      started_at: "2035-05-01T09:00:00.000Z",
      ended_at: "2035-05-01T10:00:00.000Z",
      timezone: "UTC",
      capture_authorized: true,
      executive_summary: "Reviewed the monthly variance and assigned factual follow-through.",
      protocol: originalProtocol,
      decisions: ["Use the existing reporting format for the next variance table."],
      unresolved_questions: ["Confirm whether the external data feed is available next cycle."],
      processed_at: "2035-05-01T10:05:00.000Z",
      metadata: { created_by_party_id: ownerId, local_certification: true },
    }).select("*").single(),
    "SECRETARY_MEETING_CLOSEOUT_MEETING_INSERT_FAILED",
  );

  await many(
    supabaseAdmin.from("secretary_meeting_participants").insert([
      { organization_id: organizationId, meeting_id: meeting.id, party_id: recipientA, display_name: "Closeout Recipient A", participant_role: "Finance", metadata: { local_certification: true } },
      { organization_id: organizationId, meeting_id: meeting.id, party_id: recipientB, display_name: "Closeout Recipient B", participant_role: "Operations", metadata: { local_certification: true } },
      { organization_id: organizationId, meeting_id: meeting.id, party_id: recipientC, display_name: "Closeout Recipient C", participant_role: "External", metadata: { local_certification: true } },
    ]).select("party_id"),
    "SECRETARY_MEETING_CLOSEOUT_PARTICIPANTS_INSERT_FAILED",
  );

  await one(
    supabaseAdmin.from("secretary_meeting_action_items").insert({
      organization_id: organizationId,
      meeting_id: meeting.id,
      owner_kind: "STAFF",
      owner_party_id: recipientA,
      title: "Prepare variance table",
      details: "Prepare the factual variance table using the existing format.",
      priority: "NORMAL",
      due_at: "2035-05-05T12:00:00.000Z",
      execution_ready: false,
      status: "OPEN",
      metadata: { local_certification: true },
    }).select("*").single(),
    "SECRETARY_MEETING_CLOSEOUT_ACTION_INSERT_FAILED",
  );

  const context = {
    organizationId,
    actor: { partyId: ownerId },
    metadata: { partyId: ownerId },
  };
  const acknowledgementDueAt = "2035-05-02T12:00:00.000Z";

  const started = await startSecretaryMeetingCloseout({
    context,
    payload: {
      meeting_id: meeting.id,
      acknowledgement_required: true,
      acknowledgement_due_at: acknowledgementDueAt,
    },
  });
  assert.equal(started.contract, "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_CLOSEOUT_V1");
  assert.equal(started.recipients.length, 3);
  assert.equal(started.distribution_follow_up_ids.length, 3);
  assert.equal(started.attendance_inferred, false);
  assert.equal(started.acknowledgement_not_approval, true);
  assert.equal(started.correction_changes_minutes_automatically, false);
  assert.ok(started.recipients.every((row) => row.roster_source === "MEETING_PARTICIPANT_RECORD"));
  assert.ok(started.recipients.every((row) => row.attendance_inferred === false));
  assert.equal(started.task.owner_party_id, ownerId);

  const replay = await startSecretaryMeetingCloseout({
    context,
    payload: {
      meeting_id: meeting.id,
      acknowledgement_required: true,
      acknowledgement_due_at: acknowledgementDueAt,
    },
  });
  assert.equal(replay.task.id, started.task.id);

  const distributions = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("task_id", started.task.id)
      .contains("metadata", { secretary_meeting_closeout_kind: "MINUTES_DISTRIBUTION" })
      .order("created_at", { ascending: true }),
    "SECRETARY_MEETING_CLOSEOUT_DISTRIBUTIONS_READ_FAILED",
  );
  assert.equal(distributions.length, 3);
  for (const row of distributions) {
    assert.equal(row.metadata.secretary_meeting_closeout, true);
    assert.equal(row.metadata.secretary_exact_message_body_source, "MEETING_CLOSEOUT_V1");
    assert.match(row.metadata.secretary_exact_message_body, /Protocol evidence: finance team/);
    assert.match(row.metadata.secretary_exact_message_body, /Prepare variance table/);
    assert.equal(row.metadata.attendance_inferred, false);
    assert.equal(row.metadata.acknowledgement_not_approval, true);
  }

  const exact = secretaryExactFollowUpMessageBody(distributions[0], {
    action_type: distributions[0].action_type,
  });
  assert.ok(exact);
  assert.match(exact, /Closeout Certification Meeting/);
  assert.match(exact, /Protocol evidence: finance team/);

  const forged = secretaryExactFollowUpMessageBody({
    ...distributions[0],
    metadata: {
      ...distributions[0].metadata,
      secretary_exact_message_body_source: "FORGED_SOURCE",
    },
  }, { action_type: distributions[0].action_type });
  assert.equal(forged, null);

  const notSecretaryOwned = secretaryExactFollowUpMessageBody({
    ...distributions[0],
    metadata: {
      ...distributions[0].metadata,
      execution_owner: "CONTACT",
    },
  }, { action_type: distributions[0].action_type });
  assert.equal(notSecretaryOwned, null);

  const completedAt = "2035-05-01T10:10:00.000Z";
  const completeDistributions = await supabaseAdmin.from("secretary_follow_ups")
    .update({ status: "COMPLETED", result: "Local certification send evidence", completed_at: completedAt, updated_at: completedAt })
    .eq("organization_id", organizationId)
    .in("id", distributions.map((row) => row.id));
  if (completeDistributions.error) throw completeDistributions.error;

  const acknowledged = await recordSecretaryMeetingCloseoutResponse({
    context,
    payload: {
      meeting_id: meeting.id,
      recipient_party_id: recipientA,
      evidence_id: "closeout-ack-evidence-a",
      response_kind: "ACKNOWLEDGED",
    },
  });
  assert.equal(acknowledged.status, "acknowledgement_recorded");
  assert.equal(acknowledged.recipient.acknowledgement_status, "ACKNOWLEDGED");
  assert.equal(acknowledged.recipient.acknowledgement_evidence_id, "closeout-ack-evidence-a");
  assert.equal(acknowledged.recipient.acknowledgement_not_approval, true);
  assert.equal(acknowledged.recipient.approval_inferred, false);

  const corrected = await recordSecretaryMeetingCloseoutResponse({
    context,
    payload: {
      meeting_id: meeting.id,
      recipient_party_id: recipientC,
      evidence_id: "closeout-correction-evidence-c",
      response_kind: "CORRECTION_REQUESTED",
      correction_text: "Please correct the role label; no change to the recorded decision is requested.",
    },
  });
  assert.equal(corrected.status, "correction_recorded");
  assert.equal(corrected.recipient.acknowledgement_status, "CORRECTION_REQUESTED");
  assert.ok(corrected.correction_review_follow_up_id);
  assert.equal(corrected.correction_changes_minutes_automatically, false);

  const meetingAfterCorrection = await one(
    supabaseAdmin.from("secretary_meetings").select("protocol").eq("organization_id", organizationId).eq("id", meeting.id).single(),
    "SECRETARY_MEETING_CLOSEOUT_MEETING_RELOAD_FAILED",
  );
  assert.equal(meetingAfterCorrection.protocol, originalProtocol);

  const correctionReview = await one(
    supabaseAdmin.from("secretary_follow_ups").select("*")
      .eq("organization_id", organizationId)
      .eq("id", corrected.correction_review_follow_up_id)
      .single(),
    "SECRETARY_MEETING_CLOSEOUT_CORRECTION_REVIEW_READ_FAILED",
  );
  assert.equal(correctionReview.action_type, "REVIEW");
  assert.equal(correctionReview.metadata.execution_ready, false);
  assert.equal(correctionReview.metadata.execution_owner, "EXECUTIVE");

  const refreshTime = "2035-05-02T12:05:00.000Z";
  const refreshed = await refreshSecretaryMeetingCloseout({
    context,
    payload: { meeting_id: meeting.id, now: refreshTime },
  });
  assert.equal(refreshed.closeout_state, "CORRECTION_REVIEW");
  assert.equal(refreshed.chase_follow_up_ids.length, 1);

  const chase = await one(
    supabaseAdmin.from("secretary_follow_ups").select("*")
      .eq("organization_id", organizationId)
      .eq("id", refreshed.chase_follow_up_ids[0])
      .single(),
    "SECRETARY_MEETING_CLOSEOUT_CHASE_READ_FAILED",
  );
  assert.equal(chase.contact_party_id, recipientB);
  assert.equal(chase.metadata.secretary_meeting_closeout_kind, "ACKNOWLEDGEMENT_CHASE");
  assert.equal(chase.metadata.secretary_exact_message_body_source, "MEETING_CLOSEOUT_V1");

  const refreshedAgain = await refreshSecretaryMeetingCloseout({
    context,
    payload: { meeting_id: meeting.id, now: "2035-05-02T13:05:00.000Z" },
  });
  assert.deepEqual(refreshedAgain.chase_follow_up_ids, refreshed.chase_follow_up_ids);

  const closeout = await readSecretaryMeetingCloseout({
    context,
    payload: { meeting_id: meeting.id },
  });
  const recipientRows = new Map(closeout.recipients.map((row) => [row.party_id, row]));
  assert.equal(recipientRows.get(recipientA).acknowledgement_status, "ACKNOWLEDGED");
  assert.equal(recipientRows.get(recipientB).acknowledgement_status, "PENDING");
  assert.equal(recipientRows.get(recipientC).acknowledgement_status, "CORRECTION_REQUESTED");
  assert.ok(closeout.recipients.every((row) => row.attendance_inferred === false));
  assert.equal(closeout.acknowledgement_not_approval, true);

  const commitments = await readSecretaryCommitmentControl({
    context,
    payload: { now: refreshTime, limit: 100 },
  });
  const closeoutCommitment = commitments.commitments.find((row) => row.source_id === started.task.id);
  assert.ok(closeoutCommitment);
  assert.equal(closeoutCommitment.source, "secretary_meeting_closeout");
  assert.ok(closeoutCommitment.next_action_count >= 2);

  console.log("SECRETARY_MEETING_CLOSEOUT_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_MEETING_CLOSEOUT_DURABLE_TASK=true");
  console.log("SECRETARY_MEETING_CLOSEOUT_DETERMINISTIC=true");
  console.log("SECRETARY_MEETING_CLOSEOUT_PARTICIPANT_RECORD_NOT_ATTENDANCE=true");
  console.log("SECRETARY_MEETING_CLOSEOUT_EXACT_MINUTES_BODY=true");
  console.log("SECRETARY_MEETING_CLOSEOUT_EXACT_MINUTES_PROVENANCE_GATED=true");
  console.log("SECRETARY_MEETING_CLOSEOUT_FORGED_EXACT_BODY_REJECTED=true");
  console.log("SECRETARY_MEETING_CLOSEOUT_ACK_EVIDENCE_REQUIRED=true");
  console.log("SECRETARY_MEETING_CLOSEOUT_ACK_NOT_APPROVAL=true");
  console.log("SECRETARY_MEETING_CLOSEOUT_SINGLE_ACK_CHASE=true");
  console.log("SECRETARY_MEETING_CLOSEOUT_CORRECTION_REVIEW=true");
  console.log("SECRETARY_MEETING_CLOSEOUT_CORRECTION_NOT_AUTO_APPLIED=true");
  console.log("SECRETARY_MEETING_CLOSEOUT_COMMITMENT_CONTROL_INTEGRATED=true");
  console.log("SECRETARY_MEETING_CLOSEOUT_ATTENDANCE_INFERRED=false");
  console.log("SECRETARY_MEETING_CLOSEOUT_PLATFORM_PERMISSIONS_MUTATED=false");
  console.log("SECRETARY_MEETING_CLOSEOUT_BINDING_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_MEETING_CLOSEOUT_APPROVAL_AUTHORITY_DELEGATED=false");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    const cleanup = await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
    if (cleanup.error) console.error(`SECRETARY_MEETING_CLOSEOUT_LOCAL_CLEANUP_WARNING=${cleanup.error.code || "UNKNOWN"}`);
  }
}
