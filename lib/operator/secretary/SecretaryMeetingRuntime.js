import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { AvantiqoStructuredIntelligenceSupervisorRuntime } from "@/lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime";

function text(value, limit = 12000) {
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

function actorPartyId(context = {}) {
  return text(context.actor?.partyId || context.actor?.party_id || context.metadata?.partyId, 120) || null;
}

function iso(value, field, { required = false } = {}) {
  const clean = text(value, 120);
  if (!clean) {
    if (required) throw new Error(`SECRETARY_${field.toUpperCase()}_REQUIRED`);
    return null;
  }
  const parsed = Date.parse(clean);
  if (!Number.isFinite(parsed)) throw new Error(`SECRETARY_${field.toUpperCase()}_INVALID`);
  return new Date(parsed).toISOString();
}

async function one(result) {
  if (result.error) throw result.error;
  return result.data || null;
}

async function many(result) {
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

async function requireMeeting(organization, meetingId) {
  const id = text(meetingId, 120);
  if (!id) throw new Error("SECRETARY_MEETING_REQUIRED");
  const meeting = await one(
    supabaseAdmin
      .from("secretary_meetings")
      .select("*")
      .eq("organization_id", organization)
      .eq("id", id)
      .maybeSingle(),
  );
  if (!meeting) throw new Error("SECRETARY_MEETING_NOT_FOUND");
  return meeting;
}

export async function startSecretaryMeeting({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  if (payload.capture_authorized !== true && payload.captureAuthorized !== true) {
    throw new Error("SECRETARY_MEETING_CAPTURE_AUTHORIZATION_REQUIRED");
  }
  const title = text(payload.title, 500);
  if (!title) throw new Error("SECRETARY_MEETING_TITLE_REQUIRED");

  const meeting = await one(
    supabaseAdmin
      .from("secretary_meetings")
      .insert({
        organization_id: organization,
        entity_id: text(payload.entity_id || payload.entityId, 120) || context.entityId || null,
        calendar_event_id: text(payload.calendar_event_id || payload.calendarEventId, 120) || null,
        title,
        status: "CAPTURING",
        started_at: iso(payload.started_at || payload.startedAt || new Date().toISOString(), "meeting_started_at", { required: true }),
        timezone: text(payload.timezone, 120) || text(context.timezone, 120) || "UTC",
        primary_language: text(payload.primary_language || payload.primaryLanguage, 80) || null,
        capture_authorized: true,
        raw_audio_persisted: false,
        metadata: {
          ...object(payload.metadata),
          created_by_party_id: actorPartyId(context),
          secretary_role: "EXECUTIVE_SECRETARY",
        },
      })
      .select("*")
      .single(),
  );

  const participants = list(payload.participants).slice(0, 100);
  for (const participant of participants) {
    const item = object(participant);
    const displayName = text(item.display_name || item.displayName, 300);
    if (!displayName) continue;
    await one(
      supabaseAdmin
        .from("secretary_meeting_participants")
        .insert({
          organization_id: organization,
          meeting_id: meeting.id,
          party_id: text(item.party_id || item.partyId, 120) || null,
          display_name: displayName,
          participant_role: text(item.participant_role || item.participantRole, 160) || null,
          speaker_key: text(item.speaker_key || item.speakerKey, 160) || null,
          metadata: object(item.metadata),
        })
        .select("id")
        .single(),
    );
  }

  return { status: "capturing", meeting, external_authority_used: false };
}

export async function appendSecretaryMeetingSegment({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const meeting = await requireMeeting(organization, payload.meeting_id || payload.meetingId);
  if (meeting.status !== "CAPTURING") throw new Error("SECRETARY_MEETING_NOT_CAPTURING");

  const transcript = text(payload.transcript, 20000);
  if (!transcript) throw new Error("SECRETARY_MEETING_TRANSCRIPT_REQUIRED");

  let sequenceNumber = Number(payload.sequence_number || payload.sequenceNumber);
  if (!Number.isInteger(sequenceNumber) || sequenceNumber < 1) {
    const latest = await many(
      supabaseAdmin
        .from("secretary_meeting_segments")
        .select("sequence_number")
        .eq("organization_id", organization)
        .eq("meeting_id", meeting.id)
        .order("sequence_number", { ascending: false })
        .limit(1),
    );
    sequenceNumber = Number(latest[0]?.sequence_number || 0) + 1;
  }

  const segment = await one(
    supabaseAdmin
      .from("secretary_meeting_segments")
      .insert({
        organization_id: organization,
        meeting_id: meeting.id,
        sequence_number: sequenceNumber,
        speaker_party_id: text(payload.speaker_party_id || payload.speakerPartyId, 120) || null,
        speaker_label: text(payload.speaker_label || payload.speakerLabel, 300) || null,
        transcript,
        language: text(payload.language, 80) || null,
        started_offset_ms: Number.isInteger(Number(payload.started_offset_ms || payload.startedOffsetMs))
          ? Number(payload.started_offset_ms || payload.startedOffsetMs)
          : null,
        ended_offset_ms: Number.isInteger(Number(payload.ended_offset_ms || payload.endedOffsetMs))
          ? Number(payload.ended_offset_ms || payload.endedOffsetMs)
          : null,
        source_kind: text(payload.source_kind || payload.sourceKind, 40).toUpperCase() || "AUDIO",
        metadata: object(payload.metadata),
      })
      .select("*")
      .single(),
  );

  return { status: "capturing", segment };
}

function meetingAnalysisSystem() {
  return [
    "You are Avantiqo Executive Secretary finalizing an internal company meeting.",
    "Produce a precise professional meeting protocol grounded only in the supplied transcript evidence.",
    "Separate explicit decisions from discussion, suggestions, questions, and rejected ideas.",
    "Identify concrete action items only when the meeting clearly creates an obligation or assignment.",
    "For each action item classify owner_kind as SECRETARY, STAFF, CONTACT, or UNKNOWN.",
    "SECRETARY means Avantiqo Secretary itself was instructed to execute the work or clearly accepted responsibility.",
    "STAFF means an internal human owns it. CONTACT means an outside person or company owns it. UNKNOWN means ownership is not clear.",
    "If a named owner can be matched to one supplied participant, use that participant party_id. Otherwise owner_party_id must be null.",
    "execution_ready may be true for SECRETARY work only when the objective is clear enough to start without inventing business facts or committing money/contractual terms.",
    "Research, requesting quotations, scheduling, calling, messaging, emailing, collecting information, and comparison work may be execution_ready when clearly requested.",
    "Purchases, contracts, irreversible financial commitments, legal commitments, hiring/firing, or policy changes must not be execution_ready unless approval_policy explicitly permits them.",
    "Due dates must be ISO timestamps only when clearly resolvable from the meeting and time_context. Otherwise null.",
    "Return exactly one JSON object with keys executive_summary, protocol, decisions, unresolved_questions, attendee_summary, action_items.",
    "action_items must contain title, details, owner_kind, owner_party_id, priority, due_at, execution_ready, evidence_sequence_numbers, and success_criteria.",
    "Keep protocol comprehensive but concise enough for executives to read quickly.",
  ].join("\n");
}

async function analyzeMeeting(meeting, participants, segments) {
  const result = await AvantiqoStructuredIntelligenceSupervisorRuntime.run({
    organization_id: meeting.organization_id,
    party_id: null,
    system: meetingAnalysisSystem(),
    messages: [{
      role: "user",
      content: JSON.stringify({
        time_context: { now: new Date().toISOString(), timezone: meeting.timezone },
        meeting: { id: meeting.id, title: meeting.title, started_at: meeting.started_at, ended_at: meeting.ended_at },
        participants: participants.map((p) => ({
          party_id: p.party_id,
          display_name: p.display_name,
          participant_role: p.participant_role,
          speaker_key: p.speaker_key,
        })),
        transcript: segments.map((s) => ({
          sequence_number: s.sequence_number,
          speaker_party_id: s.speaker_party_id,
          speaker_label: s.speaker_label,
          transcript: s.transcript,
          language: s.language,
        })),
        approval_policy: object(meeting.metadata?.approval_policy),
      }),
    }],
    tools: [],
    authorization: { allow_mutating_tools: false },
    metadata: {
      module: "SECRETARY",
      operation: "FINALIZE_MEETING_PROTOCOL",
      raw_reasoning_persisted: false,
      external_authority_used: false,
    },
    mode: "fast",
    max_output_tokens: 5000,
  });
  return object(result?.parsed);
}

function normalizePriority(value) {
  const priority = text(value, 40).toUpperCase();
  return ["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority) ? priority : "NORMAL";
}

function normalizeOwnerKind(value) {
  const owner = text(value, 40).toUpperCase();
  return ["SECRETARY", "STAFF", "CONTACT", "UNKNOWN"].includes(owner) ? owner : "UNKNOWN";
}

async function materializeActionItem(meeting, raw) {
  const item = object(raw);
  const title = text(item.title, 500);
  if (!title) return null;
  const ownerKind = normalizeOwnerKind(item.owner_kind);
  const ownerPartyId = text(item.owner_party_id, 120) || null;
  const dueAt = iso(item.due_at, "meeting_action_due_at");
  const executionReady = ownerKind === "SECRETARY" && item.execution_ready === true;
  const successCriteria = list(item.success_criteria).map((value) => text(value, 1000)).filter(Boolean).slice(0, 20);

  const task = await one(
    supabaseAdmin
      .from("secretary_tasks")
      .insert({
        organization_id: meeting.organization_id,
        entity_id: meeting.entity_id || null,
        owner_party_id: ownerPartyId,
        calendar_event_id: meeting.calendar_event_id || null,
        title,
        details: text(item.details, 4000) || null,
        status: "OPEN",
        priority: normalizePriority(item.priority),
        due_at: dueAt,
        source: "secretary_meeting",
        metadata: {
          meeting_id: meeting.id,
          meeting_action_owner_kind: ownerKind,
          execution_ready: executionReady,
          evidence_sequence_numbers: list(item.evidence_sequence_numbers).slice(0, 100),
          success_criteria: successCriteria,
        },
      })
      .select("*")
      .single(),
  );

  let job = null;
  if (executionReady) {
    job = await one(
      supabaseAdmin
        .from("secretary_jobs")
        .insert({
          organization_id: meeting.organization_id,
          entity_id: meeting.entity_id || null,
          source_kind: "MEETING",
          source_id: meeting.id,
          source_meeting_id: meeting.id,
          objective: text(item.details, 4000) || title,
          success_criteria: successCriteria,
          status: "QUEUED",
          autonomy_level: "EXECUTE_WITH_GATES",
          approval_policy: object(meeting.metadata?.approval_policy),
          metadata: {
            meeting_id: meeting.id,
            source_task_id: task.id,
            requested_by_meeting: true,
          },
        })
        .select("*")
        .single(),
    );
  }

  const actionItem = await one(
    supabaseAdmin
      .from("secretary_meeting_action_items")
      .insert({
        organization_id: meeting.organization_id,
        meeting_id: meeting.id,
        owner_kind: ownerKind,
        owner_party_id: ownerPartyId,
        title,
        details: text(item.details, 4000) || null,
        priority: normalizePriority(item.priority),
        due_at: dueAt,
        execution_ready: executionReady,
        task_id: task.id,
        job_id: job?.id || null,
        evidence_segment_ids: list(item.evidence_sequence_numbers).slice(0, 100),
        metadata: { success_criteria: successCriteria },
      })
      .select("*")
      .single(),
  );

  return { action_item: actionItem, task, job };
}

export async function finalizeSecretaryMeeting({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const meeting = await requireMeeting(organization, payload.meeting_id || payload.meetingId);
  if (!["CAPTURING", "PROCESSING"].includes(meeting.status)) throw new Error("SECRETARY_MEETING_NOT_FINALIZABLE");

  const endedAt = iso(payload.ended_at || payload.endedAt || new Date().toISOString(), "meeting_ended_at", { required: true });
  const processingMeeting = await one(
    supabaseAdmin
      .from("secretary_meetings")
      .update({ status: "PROCESSING", ended_at: endedAt, updated_at: new Date().toISOString() })
      .eq("organization_id", organization)
      .eq("id", meeting.id)
      .select("*")
      .single(),
  );

  try {
    const [participants, segments] = await Promise.all([
      many(
        supabaseAdmin
          .from("secretary_meeting_participants")
          .select("party_id,display_name,participant_role,speaker_key,metadata")
          .eq("organization_id", organization)
          .eq("meeting_id", meeting.id)
          .order("display_name", { ascending: true }),
      ),
      many(
        supabaseAdmin
          .from("secretary_meeting_segments")
          .select("id,sequence_number,speaker_party_id,speaker_label,transcript,language,metadata")
          .eq("organization_id", organization)
          .eq("meeting_id", meeting.id)
          .order("sequence_number", { ascending: true }),
      ),
    ]);
    if (!segments.length) throw new Error("SECRETARY_MEETING_TRANSCRIPT_EMPTY");

    const analysis = await analyzeMeeting(processingMeeting, participants, segments);
    const actionItems = [];
    for (const raw of list(analysis.action_items).slice(0, 100)) {
      const created = await materializeActionItem(processingMeeting, raw);
      if (created) actionItems.push(created);
    }

    const completed = await one(
      supabaseAdmin
        .from("secretary_meetings")
        .update({
          status: "COMPLETED",
          executive_summary: text(analysis.executive_summary, 12000) || null,
          protocol: text(analysis.protocol, 50000) || null,
          decisions: list(analysis.decisions).slice(0, 200),
          unresolved_questions: list(analysis.unresolved_questions).slice(0, 200),
          attendee_summary: list(analysis.attendee_summary).slice(0, 200),
          processed_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organization)
        .eq("id", meeting.id)
        .select("*")
        .single(),
    );

    return {
      status: "completed",
      meeting: completed,
      action_items: actionItems.map((item) => item.action_item),
      tasks: actionItems.map((item) => item.task),
      secretary_jobs: actionItems.map((item) => item.job).filter(Boolean),
      external_authority_used: false,
    };
  } catch (error) {
    await supabaseAdmin
      .from("secretary_meetings")
      .update({
        status: "FAILED",
        last_error: text(error?.message || error, 2000),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", organization)
      .eq("id", meeting.id);
    throw error;
  }
}

export async function getSecretaryMeeting({ context, payload = {} } = {}) {
  const organization = organizationId(context);
  const meeting = await requireMeeting(organization, payload.meeting_id || payload.meetingId);
  const [participants, segments, actionItems] = await Promise.all([
    many(
      supabaseAdmin
        .from("secretary_meeting_participants")
        .select("*")
        .eq("organization_id", organization)
        .eq("meeting_id", meeting.id)
        .order("display_name", { ascending: true }),
    ),
    many(
      supabaseAdmin
        .from("secretary_meeting_segments")
        .select("*")
        .eq("organization_id", organization)
        .eq("meeting_id", meeting.id)
        .order("sequence_number", { ascending: true }),
    ),
    many(
      supabaseAdmin
        .from("secretary_meeting_action_items")
        .select("*")
        .eq("organization_id", organization)
        .eq("meeting_id", meeting.id)
        .order("created_at", { ascending: true }),
    ),
  ]);
  return { status: "completed", meeting, participants, segments, action_items: actionItems };
}

export default Object.freeze({
  start: startSecretaryMeeting,
  appendSegment: appendSecretaryMeetingSegment,
  finalize: finalizeSecretaryMeeting,
  get: getSecretaryMeeting,
});
