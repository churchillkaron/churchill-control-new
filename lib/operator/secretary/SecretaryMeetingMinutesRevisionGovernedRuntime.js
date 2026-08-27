import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { reviseSecretaryMeetingMinutes } from "@/lib/operator/secretary/SecretaryMeetingMinutesRevisionRuntime";

const CONTRACT = "AVANTIQO_EXECUTIVE_SECRETARY_MEETING_MINUTES_REVISION_GOVERNED_V1";
const CLOSEOUT_SOURCE = "secretary_meeting_closeout";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  const id = text(context.organizationId, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

async function closeoutTask(organization, meetingId) {
  const id = text(meetingId, 120);
  if (!id) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_MEETING_REQUIRED");
  const rows = await many(
    supabaseAdmin.from("secretary_tasks")
      .select("id,metadata")
      .eq("organization_id", organization)
      .eq("source", CLOSEOUT_SOURCE)
      .contains("metadata", { meeting_id: id })
      .limit(2),
  );
  if (!rows.length) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_CLOSEOUT_NOT_FOUND");
  if (rows.length !== 1) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_CLOSEOUT_AMBIGUOUS");
  return rows[0];
}

function recordedCorrectionEvidence(metadata, evidenceId) {
  const matches = [];
  for (const recipient of list(metadata.recipients)) {
    for (const correction of list(recipient.correction_requests)) {
      if (text(correction.evidence_id, 500) !== evidenceId) continue;
      matches.push({
        party_id: text(recipient.party_id, 120) || null,
        evidence_id: evidenceId,
        correction_text: text(correction.correction_text, 5000) || null,
        recorded_at: text(correction.recorded_at, 180) || null,
      });
    }
  }
  if (!matches.length) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_CORRECTION_EVIDENCE_NOT_RECORDED");
  if (matches.length !== 1) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_CORRECTION_EVIDENCE_AMBIGUOUS");
  return matches[0];
}

export async function reviseSecretaryMeetingMinutesGoverned({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const evidenceId = text(payload.evidence_id || payload.evidenceId, 500);
  if (!evidenceId) throw new Error("SECRETARY_MEETING_MINUTES_REVISION_EVIDENCE_REQUIRED");
  const task = await closeoutTask(organization, payload.meeting_id || payload.meetingId);
  const correction = recordedCorrectionEvidence(object(task.metadata), evidenceId);
  const result = await reviseSecretaryMeetingMinutes({ context, payload });
  return {
    ...result,
    governed_contract: CONTRACT,
    correction_evidence_verified: true,
    correction_request_party_id: correction.party_id,
    correction_request_text: correction.correction_text,
    correction_request_recorded_at: correction.recorded_at,
    correction_inferred: false,
    attendance_inferred: false,
    acknowledgement_not_approval: true,
    approval_authority_delegated: false,
    binding_authority_delegated: false,
    platform_permissions_mutated: false,
    external_authority_used: false,
  };
}

export default reviseSecretaryMeetingMinutesGoverned;
