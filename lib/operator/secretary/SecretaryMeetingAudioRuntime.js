import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { appendSecretaryMeetingSegment } from "@/lib/operator/secretary/SecretaryMeetingRuntime";

const CHUNK_STALE_MS = 10 * 60 * 1000;

function text(value, limit = 20000) {
  return String(value ?? "").trim().slice(0, limit);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function organizationId(context = {}) {
  const id = text(context.organizationId || context.organization_id, 120);
  if (!id) throw new Error("SECRETARY_ORGANIZATION_REQUIRED");
  return id;
}

async function one(result) {
  if (result.error) throw result.error;
  return result.data || null;
}

async function many(result) {
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

function audioFile(audio, mimeType) {
  if (audio && typeof audio.arrayBuffer === "function") return audio;
  if (!audio) throw new Error("SECRETARY_MEETING_AUDIO_REQUIRED");
  const bytes = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
  if (!bytes.length) throw new Error("SECRETARY_MEETING_AUDIO_EMPTY");
  return new Blob([bytes], { type: text(mimeType, 120) || "audio/webm" });
}

function findFirst(value, keys, depth = 0, seen = new Set()) {
  if (depth > 8 || value === null || value === undefined || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null && value[key] !== "") return value[key];
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirst(item, keys, depth + 1, seen);
      if (found !== null) return found;
    }
    return null;
  }
  for (const child of Object.values(value)) {
    const found = findFirst(child, keys, depth + 1, seen);
    if (found !== null) return found;
  }
  return null;
}

function findSegmentArray(value, depth = 0, seen = new Set()) {
  if (depth > 8 || value === null || value === undefined || typeof value !== "object" || seen.has(value)) return null;
  seen.add(value);
  if (!Array.isArray(value)) {
    for (const key of ["utterances", "segments", "speaker_segments", "speakerSegments"]) {
      const candidate = value[key];
      if (Array.isArray(candidate) && candidate.length && candidate.some((item) => typeof item === "object" && text(item?.text || item?.transcript))) {
        return candidate;
      }
    }
  }
  const values = Array.isArray(value) ? value : Object.values(value);
  for (const child of values) {
    const found = findSegmentArray(child, depth + 1, seen);
    if (found) return found;
  }
  return null;
}

function milliseconds(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed > 100000 ? Math.round(parsed) : Math.round(parsed * 1000);
}

function normalizeProviderSegments(execution) {
  const rawSegments = findSegmentArray(execution);
  if (!rawSegments) return [];
  return rawSegments
    .map((item) => {
      const row = object(item);
      const transcript = text(row.text || row.transcript || row.content, 20000);
      if (!transcript) return null;
      const speaker = text(row.speaker || row.speaker_label || row.speakerLabel || row.speaker_id || row.speakerId, 300) || null;
      const start = milliseconds(row.start_ms ?? row.startMs ?? row.start ?? row.start_time ?? row.startTime);
      const end = milliseconds(row.end_ms ?? row.endMs ?? row.end ?? row.end_time ?? row.endTime);
      return {
        transcript,
        speaker_label: speaker,
        language: text(row.language || row.detected_language, 80) || null,
        started_offset_ms: start,
        ended_offset_ms: end,
      };
    })
    .filter(Boolean);
}

async function requireCapturingMeeting(organization, meetingId) {
  const id = text(meetingId, 120);
  if (!id) throw new Error("SECRETARY_MEETING_REQUIRED");
  const meeting = await one(
    supabaseAdmin
      .from("secretary_meetings")
      .select("id,organization_id,status,capture_authorized,primary_language,raw_audio_persisted")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!meeting) throw new Error("SECRETARY_MEETING_NOT_FOUND");
  if (meeting.status !== "CAPTURING") throw new Error("SECRETARY_MEETING_NOT_CAPTURING");
  if (meeting.capture_authorized !== true) throw new Error("SECRETARY_MEETING_CAPTURE_AUTHORIZATION_REQUIRED");
  return meeting;
}

async function participantSpeakerMap(organization, meetingId) {
  const result = await supabaseAdmin
    .from("secretary_meeting_participants")
    .select("party_id,display_name,speaker_key")
    .eq("organization_id", organization)
    .eq("meeting_id", meetingId);
  if (result.error) throw result.error;
  const byKey = new Map();
  for (const row of result.data || []) {
    const key = text(row.speaker_key, 300);
    if (key) byKey.set(key, row);
  }
  return byKey;
}

async function existingSegmentsForChunk(organization, meetingId, chunkNumber) {
  if (!Number.isInteger(chunkNumber) || chunkNumber < 1) return [];
  return many(
    supabaseAdmin
      .from("secretary_meeting_segments")
      .select("*")
      .eq("organization_id", organization)
      .eq("meeting_id", meetingId)
      .contains("metadata", { chunk_number: chunkNumber })
      .order("sequence_number", { ascending: true }),
  );
}

function replayResult(meeting, chunk, segments) {
  return {
    status: "capturing",
    contract: "AVANTIQO_SECRETARY_MEETING_AUDIO_INGEST_V1",
    meeting_id: meeting.id,
    chunk_number: chunk.chunk_number,
    detected_language: chunk.detected_language || null,
    provider_diarization_observed: segments.some((segment) => Boolean(object(segment.metadata).provider_speaker_label)),
    silent_chunk: chunk.silent_chunk === true,
    segments_created: segments.length,
    segments,
    idempotent_replay: true,
    raw_audio_persisted: false,
    speaker_identity_invented: false,
    external_authority_used: false,
  };
}

async function claimAudioChunk({ organization, meeting, chunkNumber, startedOffsetMs, mimeType, fileName }) {
  if (!Number.isInteger(chunkNumber) || chunkNumber < 1) {
    throw new Error("SECRETARY_MEETING_AUDIO_CHUNK_NUMBER_REQUIRED");
  }

  const insert = await supabaseAdmin
    .from("secretary_meeting_audio_chunks")
    .insert({
      organization_id: organization,
      meeting_id: meeting.id,
      chunk_number: chunkNumber,
      status: "PROCESSING",
      started_offset_ms: Math.max(0, Number(startedOffsetMs) || 0),
      mime_type: text(mimeType, 120) || null,
      file_name: text(fileName, 500) || null,
      metadata: { raw_audio_persisted: false, external_authority_used: false },
    })
    .select("*")
    .single();

  if (!insert.error) return { chunk: insert.data, replay: null };
  if (insert.error.code !== "23505") throw insert.error;

  const existing = await one(
    supabaseAdmin
      .from("secretary_meeting_audio_chunks")
      .select("*")
      .eq("organization_id", organization)
      .eq("meeting_id", meeting.id)
      .eq("chunk_number", chunkNumber)
      .maybeSingle(),
  );
  if (!existing) throw new Error("SECRETARY_MEETING_AUDIO_CHUNK_CONFLICT");

  const alreadyCreated = await existingSegmentsForChunk(organization, meeting.id, chunkNumber);
  if (existing.status === "COMPLETED" || alreadyCreated.length) {
    if (existing.status !== "COMPLETED" && alreadyCreated.length) {
      await supabaseAdmin
        .from("secretary_meeting_audio_chunks")
        .update({
          status: "COMPLETED",
          silent_chunk: false,
          segment_ids: alreadyCreated.map((segment) => segment.id),
          completed_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    }
    return { chunk: { ...existing, status: "COMPLETED", segment_ids: alreadyCreated.map((segment) => segment.id) }, replay: replayResult(meeting, existing, alreadyCreated) };
  }

  const updatedAt = Date.parse(existing.updated_at || existing.created_at || "");
  const stale = Number.isFinite(updatedAt) && Date.now() - updatedAt >= CHUNK_STALE_MS;
  if (existing.status === "PROCESSING" && !stale) {
    throw new Error("SECRETARY_MEETING_AUDIO_CHUNK_IN_PROGRESS");
  }

  const reclaimed = await one(
    supabaseAdmin
      .from("secretary_meeting_audio_chunks")
      .update({
        status: "PROCESSING",
        started_offset_ms: Math.max(0, Number(startedOffsetMs) || 0),
        mime_type: text(mimeType, 120) || existing.mime_type || null,
        file_name: text(fileName, 500) || existing.file_name || null,
        silent_chunk: false,
        segment_ids: [],
        last_error: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("updated_at", existing.updated_at)
      .select("*")
      .maybeSingle(),
  );
  if (!reclaimed) throw new Error("SECRETARY_MEETING_AUDIO_CHUNK_IN_PROGRESS");
  return { chunk: reclaimed, replay: null };
}

async function completeAudioChunk(chunkId, { silent, detectedLanguage, segments }) {
  const result = await supabaseAdmin
    .from("secretary_meeting_audio_chunks")
    .update({
      status: "COMPLETED",
      silent_chunk: silent === true,
      detected_language: detectedLanguage || null,
      segment_ids: segments.map((segment) => segment.id),
      completed_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", chunkId);
  if (result.error) throw result.error;
}

async function failAudioChunk(chunkId, error) {
  if (!chunkId) return;
  await supabaseAdmin
    .from("secretary_meeting_audio_chunks")
    .update({
      status: "FAILED",
      last_error: text(error?.message || error, 2000) || "SECRETARY_MEETING_AUDIO_CHUNK_FAILED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", chunkId)
    .catch(() => null);
}

export async function ingestSecretaryMeetingAudio({
  context,
  meetingId,
  audio,
  mimeType = "audio/webm",
  fileName = "meeting-chunk.webm",
  language = null,
  chunkNumber = null,
  chunkStartedOffsetMs = 0,
} = {}) {
  const organization = organizationId(context);
  const meeting = await requireCapturingMeeting(organization, meetingId);
  const normalizedChunkNumber = Number(chunkNumber);
  const claim = await claimAudioChunk({
    organization,
    meeting,
    chunkNumber: normalizedChunkNumber,
    startedOffsetMs: chunkStartedOffsetMs,
    mimeType,
    fileName,
  });
  if (claim.replay) return claim.replay;

  try {
    const upload = audioFile(audio, mimeType);
    const requestedLanguage = text(language, 80) || text(meeting.primary_language, 80) || null;

    const execution = await ServiceExecutionRuntime.execute({
      organization_id: organization,
      party_id: text(context?.actor?.partyId || context?.actor?.party_id, 120) || null,
      entity_id: text(context?.entityId || context?.entity_id, 120) || null,
      service_id: "ai.speech.to.text",
      input: {
        upload_file: upload,
        file_name: text(fileName, 500) || "meeting-chunk.webm",
        mime_type: text(mimeType, 120) || upload.type || "audio/webm",
        language: requestedLanguage || undefined,
        quantity: 1,
      },
      metadata: {
        module: "SECRETARY",
        operation: "MEETING_STT",
        meeting_id: meeting.id,
        chunk_number: normalizedChunkNumber,
        capture_authorized: true,
        raw_audio_persisted: false,
        external_authority_used: false,
      },
      category: "AI",
    });

    const providerSegments = normalizeProviderSegments(execution);
    const fullTranscript = text(findFirst(execution, ["transcript", "text", "output_text"]), 50000);
    const detectedLanguage = text(findFirst(execution, ["detected_language", "language"]), 80) || requestedLanguage || null;
    const baseOffset = Math.max(0, Number(chunkStartedOffsetMs) || 0);

    const normalized = providerSegments.length
      ? providerSegments
      : fullTranscript
        ? [{ transcript: fullTranscript, speaker_label: null, language: detectedLanguage, started_offset_ms: null, ended_offset_ms: null }]
        : [];

    if (!normalized.length) {
      await completeAudioChunk(claim.chunk.id, { silent: true, detectedLanguage, segments: [] });
      return {
        status: "capturing",
        contract: "AVANTIQO_SECRETARY_MEETING_AUDIO_INGEST_V1",
        meeting_id: meeting.id,
        chunk_number: normalizedChunkNumber,
        detected_language: detectedLanguage,
        provider_diarization_observed: false,
        silent_chunk: true,
        segments_created: 0,
        segments: [],
        idempotent_replay: false,
        raw_audio_persisted: false,
        speaker_identity_invented: false,
        external_authority_used: false,
      };
    }

    const speakerMap = await participantSpeakerMap(organization, meeting.id);
    const created = [];
    for (const segment of normalized) {
      const providerSpeaker = text(segment.speaker_label, 300) || null;
      const participant = providerSpeaker ? speakerMap.get(providerSpeaker) || null : null;
      const appended = await appendSecretaryMeetingSegment({
        context: {
          organizationId: organization,
          entityId: context?.entityId || context?.entity_id || null,
          actor: context?.actor || null,
        },
        payload: {
          meeting_id: meeting.id,
          speaker_party_id: participant?.party_id || null,
          speaker_label: participant?.display_name || providerSpeaker || null,
          transcript: segment.transcript,
          language: segment.language || detectedLanguage,
          started_offset_ms: segment.started_offset_ms === null ? null : baseOffset + segment.started_offset_ms,
          ended_offset_ms: segment.ended_offset_ms === null ? null : baseOffset + segment.ended_offset_ms,
          source_kind: "AUDIO",
          metadata: {
            chunk_number: normalizedChunkNumber,
            provider_speaker_label: providerSpeaker,
            speaker_identity_verified: Boolean(participant?.party_id),
            speaker_identity_invented: false,
            raw_audio_persisted: false,
            external_authority_used: false,
          },
        },
      });
      created.push(appended.segment);
    }

    await completeAudioChunk(claim.chunk.id, { silent: false, detectedLanguage, segments: created });
    return {
      status: "capturing",
      contract: "AVANTIQO_SECRETARY_MEETING_AUDIO_INGEST_V1",
      meeting_id: meeting.id,
      chunk_number: normalizedChunkNumber,
      detected_language: detectedLanguage,
      provider_diarization_observed: providerSegments.some((segment) => Boolean(segment.speaker_label)),
      silent_chunk: false,
      segments_created: created.length,
      segments: created,
      idempotent_replay: false,
      raw_audio_persisted: false,
      speaker_identity_invented: false,
      external_authority_used: false,
    };
  } catch (error) {
    await failAudioChunk(claim.chunk?.id, error);
    throw error;
  }
}

export default ingestSecretaryMeetingAudio;
