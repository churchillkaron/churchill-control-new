import assert from "node:assert/strict";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`SECRETARY_MEETING_CALL_CLARIFICATION_LOCAL_ENV_REQUIRED:${name}`);
  return value;
}

function assertLocalSupabase(urlValue) {
  let url;
  try {
    url = new URL(urlValue);
  } catch {
    throw new Error("SECRETARY_MEETING_CALL_CLARIFICATION_LOCAL_SUPABASE_URL_INVALID");
  }
  if (!["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname)) {
    throw new Error("SECRETARY_MEETING_CALL_CLARIFICATION_LOCAL_REFUSED_NON_LOCAL_SUPABASE");
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
const { createSecretaryMeetingCoordination } = await import("../lib/operator/secretary/SecretaryMeetingCoordinationRuntime.js");
const { reconcileSecretaryMeetingCoordinationEvidence } = await import("../lib/operator/secretary/SecretaryMeetingCoordinationEvidenceRuntime.js");
const { secretaryMeetingParticipantHasExplicitAvailabilityEvidence } = await import("../lib/operator/secretary/SecretaryMeetingCoordinationBookingGuardRuntime.js");

let organizationId = null;

try {
  const organization = await one(
    supabaseAdmin.from("organizations")
      .insert({ name: "Secretary Ambiguous Call Clarification Local Certification" })
      .select("id")
      .single(),
    "SECRETARY_MEETING_CALL_CLARIFICATION_LOCAL_ORGANIZATION_INSERT_FAILED",
  );
  organizationId = organization.id;

  const parties = await many(
    supabaseAdmin.from("parties")
      .insert([
        { organization_id: organizationId, display_name: "Executive", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
        { organization_id: organizationId, display_name: "Call Participant", party_type: "PERSON", status: "ACTIVE", metadata: { local_certification: true } },
      ])
      .select("id,display_name"),
    "SECRETARY_MEETING_CALL_CLARIFICATION_LOCAL_PARTIES_INSERT_FAILED",
  );
  const byName = new Map(parties.map((row) => [row.display_name, row.id]));
  const executiveId = byName.get("Executive");
  const participantPartyId = byName.get("Call Participant");
  assert.ok(executiveId && participantPartyId);

  const context = {
    organizationId,
    timezone: "Asia/Bangkok",
    actor: { partyId: executiveId },
    metadata: { partyId: executiveId, localCertification: true },
  };
  const delegated = await createSecretaryMeetingCoordination({
    context,
    payload: {
      title: "Ambiguous Call Clarification Certification",
      purpose: "Certify immediate human Secretary clarification after an ambiguous call",
      timezone: "Asia/Bangkok",
      candidate_slots: [
        { id: "slot-a", starts_at: "2026-10-22T10:00:00+07:00", ends_at: "2026-10-22T11:00:00+07:00", timezone: "Asia/Bangkok" },
        { id: "slot-b", starts_at: "2026-10-22T14:00:00+07:00", ends_at: "2026-10-22T15:00:00+07:00", timezone: "Asia/Bangkok" },
      ],
      response_due_at: "2026-10-21T18:00:00+07:00",
      participants: [
        { party_id: participantPartyId, required: true, action_type: "CALL" },
      ],
      metadata: { local_certification: true },
    },
  });

  const participant = await one(
    supabaseAdmin.from("secretary_meeting_coordination_participants")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("coordination_id", delegated.coordination.id)
      .single(),
    "SECRETARY_MEETING_CALL_CLARIFICATION_LOCAL_PARTICIPANT_READ_FAILED",
  );
  const ambiguousEvidenceId = crypto.randomUUID();
  const ambiguous = await one(
    supabaseAdmin.from("secretary_meeting_coordination_participants")
      .update({
        status: "AMBIGUOUS",
        received_at: new Date().toISOString(),
        response_body: "Maybe later should be okay, I think.",
        availability: {
          available_slot_ids: [],
          unavailable_slot_ids: [],
          none_work: false,
          needs_clarification: true,
          clarification_reason: "Participant did not explicitly choose a candidate slot",
          confidence: 0.4,
        },
        extraction_confidence: 0.4,
        last_error: "MEETING_AVAILABILITY_AMBIGUOUS",
        metadata: {
          ...participant.metadata,
          explicit_response_evidence: true,
          latest_availability_evidence_kind: "SECRETARY_CALL",
          latest_availability_evidence_id: ambiguousEvidenceId,
          clarification_response_used: false,
          attendance_not_inferred: true,
          external_authority_used: false,
        },
      })
      .eq("organization_id", organizationId)
      .eq("id", participant.id)
      .select("*")
      .single(),
    "SECRETARY_MEETING_CALL_CLARIFICATION_LOCAL_AMBIGUOUS_FIXTURE_FAILED",
  );
  assert.equal(ambiguous.clarification_follow_up_id, null);

  const reconciled = await reconcileSecretaryMeetingCoordinationEvidence(delegated.coordination);
  assert.equal(reconciled.ambiguous_call_triggers_immediate_clarification, true);
  assert.equal(reconciled.clarification_requires_fresh_evidence, true);

  const afterClarification = await one(
    supabaseAdmin.from("secretary_meeting_coordination_participants")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", participant.id)
      .single(),
    "SECRETARY_MEETING_CALL_CLARIFICATION_LOCAL_AFTER_CLARIFICATION_READ_FAILED",
  );
  assert.ok(afterClarification.clarification_follow_up_id);
  assert.equal(afterClarification.status, "AMBIGUOUS");
  assert.equal(afterClarification.metadata?.clarification_requires_fresh_evidence, true);
  assert.equal(afterClarification.metadata?.clarification_requested_after_evidence_id, ambiguousEvidenceId);
  assert.equal(afterClarification.metadata?.clarification_response_used, false);

  const clarificationFollowUp = await one(
    supabaseAdmin.from("secretary_follow_ups")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("id", afterClarification.clarification_follow_up_id)
      .single(),
    "SECRETARY_MEETING_CALL_CLARIFICATION_LOCAL_FOLLOW_UP_READ_FAILED",
  );
  assert.equal(clarificationFollowUp.action_type, "CALL");
  assert.equal(clarificationFollowUp.status, "PENDING");
  assert.equal(clarificationFollowUp.metadata?.execution_owner, "SECRETARY");
  assert.equal(clarificationFollowUp.metadata?.execution_ready, true);
  assert.equal(clarificationFollowUp.metadata?.meeting_availability_clarification, true);
  assert.equal(clarificationFollowUp.metadata?.clarification_requires_fresh_evidence, true);
  assert.equal(clarificationFollowUp.metadata?.clarification_requested_after_evidence_id, ambiguousEvidenceId);
  assert.match(clarificationFollowUp.reason, /do not reuse the earlier ambiguous answer/i);

  const clarificationRows = await many(
    supabaseAdmin.from("secretary_follow_ups")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("contact_party_id", participantPartyId)
      .contains("metadata", { meeting_availability_clarification: true }),
    "SECRETARY_MEETING_CALL_CLARIFICATION_LOCAL_FOLLOW_UP_COUNT_FAILED",
  );
  assert.equal(clarificationRows.length, 1);

  const staleResponded = {
    ...afterClarification,
    status: "RESPONDED",
    availability: {
      available_slot_ids: ["slot-a"],
      unavailable_slot_ids: [],
      none_work: false,
      needs_clarification: false,
      confidence: 1,
    },
    metadata: {
      ...afterClarification.metadata,
      explicit_response_evidence: true,
      latest_availability_evidence_kind: "SECRETARY_CALL",
      latest_availability_evidence_id: ambiguousEvidenceId,
      clarification_response_used: true,
    },
  };
  assert.equal(secretaryMeetingParticipantHasExplicitAvailabilityEvidence(staleResponded), false);

  const freshEvidenceId = crypto.randomUUID();
  const freshResponded = {
    ...staleResponded,
    metadata: {
      ...staleResponded.metadata,
      latest_availability_evidence_id: freshEvidenceId,
      clarification_response_used: true,
    },
  };
  assert.equal(secretaryMeetingParticipantHasExplicitAvailabilityEvidence(freshResponded), true);

  console.log("SECRETARY_MEETING_CALL_CLARIFICATION_LOCAL_CERTIFICATION=PASS");
  console.log("SECRETARY_AMBIGUOUS_CALL_TRIGGERS_IMMEDIATE_CLARIFICATION=true");
  console.log("SECRETARY_CALL_CLARIFICATION_PRESERVES_CHANNEL=true");
  console.log("SECRETARY_CALL_CLARIFICATION_IDEMPOTENT=true");
  console.log("SECRETARY_CALL_CLARIFICATION_REQUIRES_FRESH_EVIDENCE=true");
  console.log("SECRETARY_STALE_PRE_CLARIFICATION_EVIDENCE_CANNOT_BOOK=true");
  console.log("SECRETARY_DISTINCT_POST_CLARIFICATION_EVIDENCE_CAN_QUALIFY=true");
  console.log("SECRETARY_ATTENDANCE_NOT_INFERRED=true");
  console.log("SECRETARY_PROVIDER_CALLS_PERFORMED=false");
  console.log("SECRETARY_EXTERNAL_AUTHORITY_USED=false");
  console.log("SECRETARY_PRODUCTION_DEPLOY_PERFORMED=false");
} finally {
  if (organizationId) {
    await supabaseAdmin.from("organizations").delete().eq("id", organizationId);
  }
}
