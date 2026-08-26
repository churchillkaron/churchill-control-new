import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value, limit = 4000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function one(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return resolved.data || null;
}

async function many(result) {
  const resolved = await result;
  if (resolved.error) throw resolved.error;
  return Array.isArray(resolved.data) ? resolved.data : [];
}

function organizationId(context = {}) {
  const id = text(context.organizationId || context.organization_id, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

export async function mapSecretaryMeetingSpeaker({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const meetingId = text(payload.meeting_id || payload.meetingId, 120);
  const speakerKey = text(payload.speaker_key || payload.speakerKey, 300);
  const participantId = text(payload.participant_id || payload.participantId, 120);
  const partyId = text(payload.party_id || payload.partyId, 120);

  if (!meetingId) throw new Error("SECRETARY_MEETING_REQUIRED");
  if (!speakerKey) throw new Error("SECRETARY_MEETING_SPEAKER_KEY_REQUIRED");
  if (!participantId && !partyId) throw new Error("SECRETARY_MEETING_PARTICIPANT_REQUIRED");

  const meeting = await one(
    supabaseAdmin
      .from("secretary_meetings")
      .select("id,status")
      .eq("organization_id", organization)
      .eq("id", meetingId)
      .maybeSingle(),
  );
  if (!meeting) throw new Error("SECRETARY_MEETING_NOT_FOUND");
  if (meeting.status !== "CAPTURING") throw new Error("SECRETARY_MEETING_NOT_CAPTURING");

  let participantQuery = supabaseAdmin
    .from("secretary_meeting_participants")
    .select("*")
    .eq("organization_id", organization)
    .eq("meeting_id", meetingId);
  participantQuery = participantId
    ? participantQuery.eq("id", participantId)
    : participantQuery.eq("party_id", partyId);
  const participant = await one(participantQuery.limit(1).maybeSingle());
  if (!participant) throw new Error("SECRETARY_MEETING_PARTICIPANT_NOT_FOUND");

  const existing = await one(
    supabaseAdmin
      .from("secretary_meeting_participants")
      .select("id,party_id,display_name,speaker_key")
      .eq("organization_id", organization)
      .eq("meeting_id", meetingId)
      .eq("speaker_key", speakerKey)
      .maybeSingle(),
  );
  if (existing && existing.id !== participant.id) {
    throw new Error("SECRETARY_MEETING_SPEAKER_ALREADY_MAPPED");
  }

  const updatedParticipant = await one(
    supabaseAdmin
      .from("secretary_meeting_participants")
      .update({
        speaker_key: speakerKey,
        metadata: {
          ...object(participant.metadata),
          speaker_mapping_source: "AUTHENTICATED_ORGANIZATION_USER",
          speaker_mapping_invented: false,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organization)
      .eq("meeting_id", meetingId)
      .eq("id", participant.id)
      .select("*")
      .single(),
  );

  const matchingSegments = await many(
    supabaseAdmin
      .from("secretary_meeting_segments")
      .select("id,metadata")
      .eq("organization_id", organization)
      .eq("meeting_id", meetingId)
      .contains("metadata", { provider_speaker_label: speakerKey }),
  );

  for (const segment of matchingSegments) {
    const update = await supabaseAdmin
      .from("secretary_meeting_segments")
      .update({
        speaker_party_id: updatedParticipant.party_id || null,
        speaker_label: updatedParticipant.display_name,
        metadata: {
          ...object(segment.metadata),
          speaker_identity_verified: Boolean(updatedParticipant.party_id),
          speaker_identity_mapped_by_user: true,
          speaker_identity_invented: false,
        },
      })
      .eq("organization_id", organization)
      .eq("meeting_id", meetingId)
      .eq("id", segment.id);
    if (update.error) throw update.error;
  }

  return {
    status: "completed",
    contract: "AVANTIQO_SECRETARY_MEETING_SPEAKER_MAPPING_V1",
    meeting_id: meetingId,
    speaker_key: speakerKey,
    participant: updatedParticipant,
    segments_updated: matchingSegments.length,
    speaker_identity_invented: false,
    external_authority_used: false,
  };
}

export default mapSecretaryMeetingSpeaker;
